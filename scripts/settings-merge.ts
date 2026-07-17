/**
 * Per-key merge of `agent/settings-overrides.json` into the live
 * `~/.pi/agent/settings.json`.
 *
 * Design contract:
 *   - Keys present in the override file are written into the live file.
 *   - Primitive values overwrite. Arrays replace (no concatenation).
 *   - Plain object values deep-merge so partial nested objects don't blow
 *     away sibling keys (e.g. `terminal.showTerminalProgress: true` must
 *     not clear `terminal.scrollbackLines` if it's set on the live side).
 *   - Keys NOT present in the override file are never touched — the live
 *     file keeps everything the user had.
 *   - Dotted-paths emitted for the drift report.
 *
 * Schema alignment: the override file is shape-checked against pi's
 * canonical `Settings` interface (from
 * `@earendil-works/pi-coding-agent/core/settings-manager.d.ts`). The
 * `SETTINGS_DEFAULTS` table below captures the runtime defaults that
 * every getter in `settings-manager.js` falls back to. Keys whose
 * override value matches a default are dropped from the merge — the
 * override file should only encode intentional departures from
 * `Settings` defaults, not re-state the default values.
 *
 * Reference: pi's `Settings` interface in core/settings-manager.d.ts and
 * the getter fallbacks in core/settings-manager.js. Bump the table
 * whenever upgrading pi past a release that changes either source.
 *
 * Last verified against: @earendil-works/pi-coding-agent 0.80.2
 *
 * Tested independently in settings-merge.test.ts.
 */

export type Json =
  string | number | boolean | null | Json[] | { [k: string]: Json };

export interface MergeResult {
  /** The merged JSON object to write to `~/.pi/agent/settings.json`. */
  merged: Record<string, Json>;
  /** Override keys that landed in `merged`. Sorted. Dotted paths for nested. */
  appliedKeys: string[];
  /** Live keys that were NOT touched by the override. Sorted. */
  untouchedKeys: string[];
  /** Override keys removed because their value matches `SETTINGS_DEFAULTS`. */
  defaultStrippedKeys: string[];
  /** Anything in `override` that was rejected before merge (bad shape). */
  ignoredKeys: string[];
}

/**
 * Spec for a known Settings key. `path` is a flat dotted path that
 * matches both the live-file lookup AND the override-file lookup —
 * but for nested-object keys, the OVERRIDE form is a nested object
 * (e.g. `terminal: { showTerminalProgress: true }`), while the dotted
 * path is what gets reported. See `lookupSpec()` for the resolution.
 */
export interface SettingsValueSpec {
  /** Dotted path, used for both reporting and override-vs-default match. */
  readonly path: string;
  /** Runtime default (what pi returns when the key is absent). */
  readonly default: Json;
  /** Type/constraint validation for the override value. */
  readonly validate?: (v: Json) => string | null;
}

export const SETTINGS_DEFAULTS: Readonly<Record<string, SettingsValueSpec>> = {
  collapseChangelog: {
    path: "collapseChangelog",
    default: false,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  enableInstallTelemetry: {
    path: "enableInstallTelemetry",
    default: true,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  enableAnalytics: {
    path: "enableAnalytics",
    default: false,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  "compaction.enabled": {
    path: "compaction.enabled",
    default: true,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  "branchSummary.skipPrompt": {
    path: "branchSummary.skipPrompt",
    default: false,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  "retry.enabled": {
    path: "retry.enabled",
    default: true,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  enableSkillCommands: {
    path: "enableSkillCommands",
    default: true,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  quietStartup: {
    path: "quietStartup",
    default: false,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  hideThinkingBlock: {
    path: "hideThinkingBlock",
    default: false,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
  doubleEscapeAction: {
    path: "doubleEscapeAction",
    default: "tree",
    validate: (v) => {
      if (typeof v !== "string") return "must be string";
      if (!["fork", "tree", "none"].includes(v)) {
        return 'must be one of "fork", "tree", "none"';
      }
      return null;
    },
  },
  defaultThinkingLevel: {
    path: "defaultThinkingLevel",
    default: undefined as unknown as Json,
    validate: (v) => {
      const allowed = ["off", "minimal", "low", "medium", "high", "xhigh"];
      if (typeof v !== "string" || !allowed.includes(v)) {
        return `must be one of ${allowed.map((s) => JSON.stringify(s)).join(", ")}`;
      }
      return null;
    },
  },
  "terminal.showTerminalProgress": {
    path: "terminal.showTerminalProgress",
    default: false,
    validate: (v) => (typeof v !== "boolean" ? "must be boolean" : null),
  },
};

/**
 * Look up a spec by its dotted path. Returns undefined for unknown.
 */
export function findSpec(dotted: string): SettingsValueSpec | undefined {
  return SETTINGS_DEFAULTS[dotted];
}

/**
 * Validate the override file's structure against `SETTINGS_DEFAULTS`. Each
 * known key's value is type-checked. Unknown keys (not in the schema) pass
 * through silently — but they bypass the default-strip logic too.
 */
export interface ValidationResult {
  ok: boolean;
  errors: { path: string; value: unknown; error: string }[];
  unknownKeys: string[];
}

export function validateOverride(
  override: Record<string, Json>,
): ValidationResult {
  const errors: { path: string; value: unknown; error: string }[] = [];
  const unknownKeys: string[] = [];

  function walk(obj: Record<string, Json>, prefix: string) {
    for (const [k, v] of Object.entries(obj)) {
      const dotted = prefix ? `${prefix}.${k}` : k;
      if (dotted in SETTINGS_DEFAULTS) {
        const spec = SETTINGS_DEFAULTS[dotted]!;
        const err = spec.validate?.(v);
        if (err) errors.push({ path: dotted, value: v, error: err });
        continue;
      }
      if (isPlainObject(v)) {
        walk(v, dotted);
        continue;
      }
      // Scalar under an unknown dotted path → unknown leaf.
      // Validate that all sub-segments of `dotted` are either empty
      // (top level) or a known prefix to avoid flagging nested
      // sub-objects that contain a known leaf. We recurse into the
      // object above this branch only, so if we land here it's
      // because `dotted` is unknown and `v` is not an object.
      unknownKeys.push(dotted);
    }
  }
  walk(override, "");

  return { ok: errors.length === 0, errors, unknownKeys };
}

/**
 * Walk the override and drop any key whose value matches the runtime
 * default from `SETTINGS_DEFAULTS`. Pure: returns a new object.
 */
export function stripDefaults(override: Record<string, Json>): {
  stripped: Record<string, Json>;
  removedKeys: string[];
} {
  const stripped: Record<string, Json> = {};
  const removedKeys: string[] = [];

  walkForStrip(override, "", stripped, removedKeys);

  return { stripped, removedKeys };
}

function walkForStrip(
  obj: Record<string, Json>,
  prefix: string,
  out: Record<string, Json>,
  removed: string[],
): void {
  for (const [k, v] of Object.entries(obj)) {
    const dotted = prefix ? `${prefix}.${k}` : k;
    const spec = findSpec(dotted);
    if (spec) {
      if (deepEqual(v, spec.default)) {
        removed.push(dotted);
        continue;
      }
      // Found a leaf with a non-default value: write it. We must NOT
      // recurse here because this exact path is a known leaf, not a
      // branch.
      out[k] = v;
      continue;
    }
    if (isPlainObject(v)) {
      // No top-level spec for the path yet — might still contain a
      // known leaf deeper down (e.g. `terminal: { showX: true,
      // unknownThing: 7 }`). Recurse and preserve any siblings.
      const nested: Record<string, Json> = {};
      walkForStrip(v, dotted, nested, removed);
      // If everything inside was stripped, drop the parent entirely.
      if (Object.keys(nested).length === 0) continue;
      out[k] = nested;
      continue;
    }
    // Scalar at an unknown path → preserve verbatim. The user knows
    // what they're doing (or has an invalid setting — fine either way,
    // pi will use its default for unknown keys).
    out[k] = v;
  }
}

const isPlainObject = (v: unknown): v is Record<string, Json> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

/**
 * Deep-merge `override` into `live`. Returns a NEW object.
 */
export function mergeSettings(
  live: Record<string, Json>,
  override: Record<string, Json>,
): MergeResult {
  const appliedKeys: string[] = [];
  const ignoredKeys: string[] = [];
  const out: Record<string, Json> = {};

  for (const k of Object.keys(live)) {
    const v = live[k];
    if (v !== undefined) out[k] = v;
  }

  for (const k of Object.keys(override)) {
    const ov = override[k];
    if (ov === undefined) {
      ignoredKeys.push(k);
      continue;
    }
    const lv = out[k];
    if (isPlainObject(ov) && isPlainObject(lv)) {
      // Both sides nested — recurse so we can preserve nested siblings on
      // the live side and emit dotted leaf paths.
      const nested = mergeSettings(lv, ov);
      appliedKeys.push(...nested.appliedKeys.map((p) => `${k}.${p}`));
      ignoredKeys.push(...nested.ignoredKeys.map((p) => `${k}.${p}`));
      out[k] = nested.merged;
    } else if (isPlainObject(ov)) {
      // Override is nested, live is missing or scalar → seed live with
      // an empty object and recurse so we get dotted leaf paths.
      const nested = mergeSettings(isPlainObject(lv) ? lv : {}, ov);
      appliedKeys.push(...nested.appliedKeys.map((p) => `${k}.${p}`));
      ignoredKeys.push(...nested.ignoredKeys.map((p) => `${k}.${p}`));
      out[k] = nested.merged;
    } else {
      out[k] = ov;
      appliedKeys.push(k);
    }
  }

  const untouchedKeys = collectUntouchedKeys(live, out, appliedKeys);

  return {
    merged: out,
    appliedKeys: appliedKeys.sort(),
    untouchedKeys: untouchedKeys.sort(),
    defaultStrippedKeys: [],
    ignoredKeys: ignoredKeys.sort(),
  };
}

/**
 * Top-level apply helper: validate the override, strip matching
 * defaults, deep-merge into the live file, and return a structured
 * report for the installer to print.
 */
export function applyOverride(
  live: Record<string, Json>,
  override: Record<string, Json>,
): {
  result: MergeResult;
  validation: ValidationResult;
  strippedKeys: string[];
} {
  const validation = validateOverride(override);
  const { stripped, removedKeys } = stripDefaults(override);
  const result = mergeSettings(live, stripped);

  // Split the override-considered keys into two groups:
  //   - appliedKeys: override keys whose value ACTUALLY changed in merged
  //   - consideredKeys: all override keys regardless (those that ended
  //     up no-ops because live already had the override's value)
  // untouchedKeys is rebuilt from live-vs-merged using the same equality
  // so it correctly excludes the override keys (whether applied or not)
  // AND includes everything live had that the override did not touch.
  result.appliedKeys = result.appliedKeys.filter(
    (dotted) => !keyValuesEqual(live, result.merged, dotted),
  );

  // Rebuild untouchedKeys using the full live file (not the unfiltered
  // `appliedKeys` set `mergeSettings` originally computed against).
  result.untouchedKeys = computeUntouchedFromLive(live, result.merged);

  result.defaultStrippedKeys = removedKeys.sort();
  return { result, validation, strippedKeys: removedKeys.sort() };
}

/**
 * Walk `live` and emit every live key whose value survives unaltered in
 * `merged`. Dotted paths for nested objects. Mirrors the behaviour of
 * `mergeSettings`'s `collectUntouchedKeys` but takes the full live tree
 * as the source of keys to consider, independent of `appliedKeys`.
 */
function computeUntouchedFromLive(
  live: Record<string, Json>,
  merged: Record<string, Json>,
): string[] {
  const untouched: string[] = [];
  for (const k of Object.keys(live)) {
    walkUntouched(live[k], merged[k], k, untouched);
  }
  return untouched.sort();
}

function walkUntouched(
  lv: Json | undefined,
  ov: Json | undefined,
  path: string,
  out: string[],
): void {
  if (lv === undefined && ov === undefined) {
    out.push(path);
    return;
  }
  if (lv === undefined || ov === undefined) return;
  if (isPlainObject(lv) && isPlainObject(ov)) {
    // Always recurse into siblings when both sides are objects, even
    // if they're deeply equal. We want leaf-level paths in the drift
    // surface, not collapsed-object paths — every key in `live` is a
    // key the user might want to manage.
    for (const childKey of Object.keys(lv)) {
      walkUntouched(lv[childKey], ov[childKey], `${path}.${childKey}`, out);
    }
    return;
  }
  if (deepEqual(lv, ov)) out.push(path);
}

/**
 * Compare a dotted-path key's value in `before` vs `after`. Returns true
 * when the values are deeply equal.
 */
function keyValuesEqual(
  before: Record<string, Json>,
  after: Record<string, Json>,
  dotted: string,
): boolean {
  const segs = dotted.split(".");
  let b: Json | undefined = before;
  let a: Json | undefined = after;
  for (const s of segs) {
    if (
      b === undefined ||
      typeof b !== "object" ||
      b === null ||
      Array.isArray(b)
    )
      return false;
    if (
      a === undefined ||
      typeof a !== "object" ||
      a === null ||
      Array.isArray(a)
    )
      return false;
    b = (b as Record<string, Json>)[s];
    a = (a as Record<string, Json>)[s];
  }
  if (b === undefined && a === undefined) return true;
  if (b === undefined || a === undefined) return false;
  return deepEqual(b, a);
}

function collectUntouchedKeys(
  live: Record<string, Json>,
  out: Record<string, Json>,
  appliedKeys: string[],
): string[] {
  const untouched: string[] = [];

  for (const k of Object.keys(live)) {
    const lv = live[k];
    const ov = out[k];

    if (isPlainObject(lv) && isPlainObject(ov)) {
      const nestedApplied = new Set<string>();
      for (const p of appliedKeys) {
        if (p === k) nestedApplied.add("");
        else if (p.startsWith(`${k}.`))
          nestedApplied.add(p.slice(k.length + 1));
      }
      const nested = collectUntouchedKeysInner(lv, ov, nestedApplied, k);
      untouched.push(...nested);
      continue;
    }

    if (appliedKeys.includes(k)) continue;
    if (lv === undefined && ov === undefined) {
      untouched.push(k);
      continue;
    }
    if (lv === undefined || ov === undefined) continue;
    if (deepEqual(lv, ov)) untouched.push(k);
  }

  return untouched;
}

function collectUntouchedKeysInner(
  live: Record<string, Json>,
  out: Record<string, Json>,
  appliedNested: Set<string>,
  prefix: string,
): string[] {
  const untouched: string[] = [];
  for (const k of Object.keys(live)) {
    const lv = live[k];
    const ov = out[k];
    if (isPlainObject(lv) && isPlainObject(ov)) {
      const innerApplied = new Set<string>();
      for (const p of appliedNested) {
        if (p === k) innerApplied.add("");
        else if (p.startsWith(`${k}.`)) innerApplied.add(p.slice(k.length + 1));
      }
      const sub = collectUntouchedKeysInner(
        lv,
        ov,
        innerApplied,
        `${prefix}.${k}`,
      );
      untouched.push(...sub);
      continue;
    }
    if (lv === undefined && ov === undefined) {
      untouched.push(`${prefix}.${k}`);
      continue;
    }
    if (lv === undefined || ov === undefined) continue;
    if (deepEqual(lv, ov)) untouched.push(`${prefix}.${k}`);
  }
  return untouched;
}

export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!deepEqual(a[i]!, b[i]!)) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) if (!deepEqual(a[k]!, b[k]!)) return false;
    return true;
  }
  return false;
}

export function parseSettingsJson(text: string): Record<string, Json> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`settings.json is not valid JSON: ${msg}`, { cause: err });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("settings.json must be a JSON object at the top level");
  }
  return parsed as Record<string, Json>;
}

export { isPlainObject };
