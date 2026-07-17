import { describe, it, expect } from "vitest";
import {
  mergeSettings,
  parseSettingsJson,
  deepEqual,
  applyOverride,
  validateOverride,
  stripDefaults,
  SETTINGS_DEFAULTS,
  type Json,
} from "./settings-merge";

describe("mergeSettings — per-key", () => {
  it("writes a primitive override into the live file", () => {
    const r = mergeSettings(
      { otherKey: "keep", collapseChangelog: false },
      { collapseChangelog: true },
    );
    expect(r.merged).toEqual({
      otherKey: "keep",
      collapseChangelog: true,
    });
    expect(r.appliedKeys).toEqual(["collapseChangelog"]);
    expect(r.untouchedKeys).toEqual(["otherKey"]);
  });

  it("does not touch keys absent from the override", () => {
    const live = {
      theme: "dark",
      defaultThinkingLevel: "low",
      doubleEscapeAction: "tree",
    };
    const r = mergeSettings(live, { defaultThinkingLevel: "high" });
    expect(r.merged).toEqual({
      theme: "dark",
      defaultThinkingLevel: "high",
      doubleEscapeAction: "tree",
    });
    expect(r.untouchedKeys.sort()).toEqual(["doubleEscapeAction", "theme"]);
  });

  it("replaces arrays wholesale (no concatenation)", () => {
    const r = mergeSettings(
      { tui: { input: { newLine: ["enter"] } } },
      { tui: { input: { newLine: ["shift+enter", "alt+enter"] } } },
    );
    expect(r.merged).toEqual({
      tui: { input: { newLine: ["shift+enter", "alt+enter"] } },
    });
    expect(r.appliedKeys).toEqual(["tui.input.newLine"]);
  });

  it("deep-merges nested objects without blowing siblings away", () => {
    const r = mergeSettings(
      {
        terminal: {
          showTerminalProgress: false,
          scrollbackLines: 1000,
          bell: "silent",
        },
      },
      { terminal: { showTerminalProgress: true } },
    );
    expect(r.merged).toEqual({
      terminal: {
        showTerminalProgress: true,
        scrollbackLines: 1000,
        bell: "silent",
      },
    });
    expect(r.appliedKeys).toEqual(["terminal.showTerminalProgress"]);
    expect(r.untouchedKeys.sort()).toEqual([
      "terminal.bell",
      "terminal.scrollbackLines",
    ]);
  });

  it("overrides nested object with primitive (override wins)", () => {
    const r = mergeSettings(
      { foo: { a: 1, b: 2 } },
      { foo: 7 as unknown as Json },
    );
    expect(r.merged).toEqual({ foo: 7 });
    expect(r.appliedKeys).toEqual(["foo"]);
  });

  it("preserves identity keys untouched and lists them with the prefix", () => {
    const r = mergeSettings(
      { terminal: { showTerminalProgress: false, bell: "loud" } },
      { terminal: { showTerminalProgress: true } },
    );
    expect(r.untouchedKeys).toEqual(["terminal.bell"]);
  });

  it("returns ignored keys when override value is undefined", () => {
    const r = mergeSettings(
      { keepMe: true },
      { keepMe: true, skipMe: undefined },
    );
    expect(r.merged).toEqual({ keepMe: true });
    expect(r.appliedKeys).toEqual(["keepMe"]);
    expect(r.ignoredKeys).toEqual(["skipMe"]);
  });

  it("treats dotted-flat keys as literal key names, not nested paths", () => {
    const r = mergeSettings(
      { "tui.input.newLine": ["shift+enter"], other: true },
      { "tui.input.newLine": ["shift+enter", "alt+enter"] },
    );
    expect(r.merged).toEqual({
      "tui.input.newLine": ["shift+enter", "alt+enter"],
      other: true,
    });
    expect(r.appliedKeys).toEqual(["tui.input.newLine"]);
    expect(r.untouchedKeys).toEqual(["other"]);
  });

  it("survives an empty live file", () => {
    const r = mergeSettings(
      {},
      { collapseChangelog: true, defaultThinkingLevel: "high" },
    );
    expect(r.merged).toEqual({
      collapseChangelog: true,
      defaultThinkingLevel: "high",
    });
    expect(r.untouchedKeys).toEqual([]);
  });

  it("survives an empty override file", () => {
    const r = mergeSettings(
      { theme: "dark", enabledModels: ["foo", "bar"] },
      {},
    );
    expect(r.merged).toEqual({
      theme: "dark",
      enabledModels: ["foo", "bar"],
    });
    expect(r.appliedKeys).toEqual([]);
    expect(r.untouchedKeys.sort()).toEqual(["enabledModels", "theme"]);
  });

  it("does not mutate either input", () => {
    const live = { terminal: { a: 1 }, theme: "dark" };
    const override = { terminal: { a: 2 }, theme: "light" };
    const liveCopy = JSON.parse(JSON.stringify(live));
    const ovCopy = JSON.parse(JSON.stringify(override));
    mergeSettings(live, override);
    expect(live).toEqual(liveCopy);
    expect(override).toEqual(ovCopy);
  });
});

describe("validateOverride — schema alignment", () => {
  it("accepts every key the schema knows about with valid types", () => {
    const r = validateOverride({
      collapseChangelog: true,
      enableInstallTelemetry: false,
      quietStartup: true,
      hideThinkingBlock: true,
      doubleEscapeAction: "none",
      defaultThinkingLevel: "high",
      terminal: { showTerminalProgress: true },
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects a boolean override with a non-boolean value", () => {
    const r = validateOverride({
      collapseChangelog: "yes" as unknown as Json,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.path === "collapseChangelog")?.error).toMatch(
      /boolean/,
    );
  });

  it("rejects doubleEscapeAction with an unknown enum value", () => {
    const r = validateOverride({
      doubleEscapeAction: "exit" as unknown as Json,
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.error).toMatch(/fork.*tree.*none/);
  });

  it("rejects defaultThinkingLevel with an unknown level", () => {
    const r = validateOverride({
      defaultThinkingLevel: "ultra" as unknown as Json,
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.error).toMatch(
      /"off"|"minimal"|"low"|"medium"|"high"|"xhigh"/,
    );
  });

  it("flags unknown top-level keys but does not error", () => {
    const r = validateOverride({
      collapseChangelog: true,
      someCustomSetting: 7,
    });
    expect(r.ok).toBe(true); // unknown keys are warnings, not failures
    expect(r.unknownKeys).toEqual(["someCustomSetting"]);
  });

  it("flags unknown nested keys under a known parent", () => {
    const r = validateOverride({
      terminal: {
        showTerminalProgress: true,
        someCustomTerminalSetting: 7,
      },
    });
    expect(r.unknownKeys).toEqual(["terminal.someCustomTerminalSetting"]);
  });
});

describe("stripDefaults — matches-default = no-op", () => {
  it("drops top-level overrides that equal the runtime default", () => {
    const { stripped, removedKeys } = stripDefaults({
      // override value matches the default → drop
      collapseChangelog: false,
      // override value differs from default → keep
      enableInstallTelemetry: false,
    });
    expect(stripped).toEqual({ enableInstallTelemetry: false });
    expect(removedKeys).toEqual(["collapseChangelog"]);
  });

  it("collapses an empty parent after stripping every nested leaf", () => {
    // When a nested object loses all its leaves to the default-strip,
    // the parent itself is dropped so the override file stays tight.
    const { stripped, removedKeys } = stripDefaults({
      terminal: { showTerminalProgress: false },
    });
    expect(stripped).toEqual({});
    expect(removedKeys).toEqual(["terminal.showTerminalProgress"]);
  });

  it("keeps every key when nothing matches the default", () => {
    const { stripped, removedKeys } = stripDefaults({
      collapseChangelog: true,
      enableInstallTelemetry: false,
      doubleEscapeAction: "none",
    });
    expect(stripped).toEqual({
      collapseChangelog: true,
      enableInstallTelemetry: false,
      doubleEscapeAction: "none",
    });
    expect(removedKeys).toEqual([]);
  });

  it("preserves unknown keys so the user can ship extras", () => {
    const { stripped } = stripDefaults({ someCustomSetting: "value" });
    expect(stripped).toEqual({ someCustomSetting: "value" });
  });

  it("matches doubleEscapeAction default='tree' exactly", () => {
    const { stripped, removedKeys } = stripDefaults({
      doubleEscapeAction: "tree",
    });
    expect(stripped).toEqual({});
    expect(removedKeys).toEqual(["doubleEscapeAction"]);
  });
});

describe("applyOverride — full pipeline", () => {
  it("drops default-matching keys before merge", () => {
    // `collapseChangelog: false` matches pi's default → stripped. The
    // live file already has `collapseChangelog: false`, so the merged
    // value is unchanged → not in appliedKeys.
    // `enableInstallTelemetry: false` is new (live had it undefined),
    // so the merge introduces it → in appliedKeys.
    const { result, validation } = applyOverride(
      { collapseChangelog: false, theme: "dark" },
      {
        collapseChangelog: false, // matches default → drop
        enableInstallTelemetry: false, // new for this live → apply
      },
    );
    expect(validation.ok).toBe(true);
    expect(result.defaultStrippedKeys).toEqual(["collapseChangelog"]);
    expect(result.merged).toEqual({
      collapseChangelog: false,
      theme: "dark",
      enableInstallTelemetry: false,
    });
    expect(result.appliedKeys).toEqual(["enableInstallTelemetry"]);
    expect(result.untouchedKeys.sort()).toEqual(["collapseChangelog", "theme"]);
  });

  it("reports validation errors when an override is wrong-shaped", () => {
    const { result, validation } = applyOverride(
      {},
      {
        doubleEscapeAction: "exit" as unknown as Json,
      },
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors[0]?.path).toBe("doubleEscapeAction");
    // Merge still runs; the bad value passes through unchanged so the
    // installer can fail loud at write time.
    expect(result.appliedKeys).toEqual(["doubleEscapeAction"]);
  });

  it("end-to-end: a fresh install — every override key applies", () => {
    // Brand new live file (just defaultProvider, defaultModel, packages).
    // Every override key writes a value that wasn't there before → all
    // in appliedKeys.
    const { result } = applyOverride(
      { defaultProvider: "x", defaultModel: "y", packages: ["z"] },
      {
        collapseChangelog: true,
        enableInstallTelemetry: false,
        quietStartup: true,
        hideThinkingBlock: true,
        doubleEscapeAction: "none",
        defaultThinkingLevel: "high",
        terminal: { showTerminalProgress: true },
      },
    );
    expect(result.defaultStrippedKeys).toEqual([]);
    expect(result.appliedKeys.sort()).toEqual([
      "collapseChangelog",
      "defaultThinkingLevel",
      "doubleEscapeAction",
      "enableInstallTelemetry",
      "hideThinkingBlock",
      "quietStartup",
      "terminal.showTerminalProgress",
    ]);
    expect(result.untouchedKeys.sort()).toEqual([
      "defaultModel",
      "defaultProvider",
      "packages",
    ]);
  });

  it("end-to-end: live === override — no applied, all untouched", () => {
    const live = {
      collapseChangelog: true,
      enableInstallTelemetry: false,
      quietStartup: true,
      hideThinkingBlock: true,
      doubleEscapeAction: "none",
      defaultThinkingLevel: "high",
      terminal: { showTerminalProgress: true },
      theme: "dark", // live-only, not in override
    };
    const override = {
      collapseChangelog: true,
      enableInstallTelemetry: false,
      quietStartup: true,
      hideThinkingBlock: true,
      doubleEscapeAction: "none",
      defaultThinkingLevel: "high",
      terminal: { showTerminalProgress: true },
    };
    const { result } = applyOverride(live, override);
    // Every key already matches → no write needed.
    expect(result.defaultStrippedKeys).toEqual([]);
    expect(result.appliedKeys).toEqual([]);
    expect(result.untouchedKeys.sort()).toEqual([
      "collapseChangelog",
      "defaultThinkingLevel",
      "doubleEscapeAction",
      "enableInstallTelemetry",
      "hideThinkingBlock",
      "quietStartup",
      "terminal.showTerminalProgress",
      "theme",
    ]);
  });
});

describe("applyOverride - expanded SETTINGS_DEFAULTS coverage", () => {
  it("supports shipping compaction.enabled as a no-op when it matches pi default", () => {
    const { result, validation } = applyOverride(
      { compaction: { enabled: true } },
      { compaction: { enabled: true } },
    );
    expect(validation.ok).toBe(true);
    expect(result.defaultStrippedKeys).toEqual(["compaction.enabled"]);
    expect(result.appliedKeys).toEqual([]);
    expect(result.merged).toEqual({ compaction: { enabled: true } });
  });

  it("supports shipping enableSkillCommands=true as a no-op", () => {
    const { result, validation } = applyOverride(
      { enableSkillCommands: true },
      { enableSkillCommands: true },
    );
    expect(validation.ok).toBe(true);
    expect(result.defaultStrippedKeys).toEqual(["enableSkillCommands"]);
    expect(result.appliedKeys).toEqual([]);
    expect(result.merged).toEqual({ enableSkillCommands: true });
  });

  it("supports flipping compaction.enabled off (non-default override applies)", () => {
    const { result, validation } = applyOverride(
      { compaction: { enabled: true } }, // pi default
      { compaction: { enabled: false } }, // override flips off
    );
    expect(validation.ok).toBe(true);
    expect(result.defaultStrippedKeys).toEqual([]);
    expect(result.appliedKeys).toEqual(["compaction.enabled"]);
    expect(result.merged).toEqual({ compaction: { enabled: false } });
  });
});
describe("SETTINGS_DEFAULTS — schema hand-coding invariants", () => {
  it("defaultThinkingLevel has no default (undefined per pi source)", () => {
    // pi returns settings.defaultThinkingLevel directly when the key
    // is present; undefined when absent. Document the absence.
    expect(SETTINGS_DEFAULTS.defaultThinkingLevel?.default).toBeUndefined();
  });

  it("all known keys have a default value or are explicitly undefined", () => {
    for (const [k, spec] of Object.entries(SETTINGS_DEFAULTS)) {
      expect(typeof spec.path).toBe("string");
      expect(spec.path).toBe(spec.path); // tautology; type guard
      expect(k).toBeTruthy();
      // null is a valid default only if the spec is read as null by pi;
      // we don't allow null defaults to keep the strip semantics simple.
      expect(["string", "number", "boolean", "undefined"]).toContain(
        typeof spec.default,
      );
    }
  });
});

describe("deepEqual", () => {
  it("treats structurally-identical objects as equal", () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true);
  });
  it("catches order-irrelevant differences for objects but order-sensitive for arrays", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });
});

describe("parseSettingsJson", () => {
  it("parses a top-level object", () => {
    expect(parseSettingsJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("rejects invalid JSON", () => {
    expect(() => parseSettingsJson("not json")).toThrow(/not valid JSON/);
  });
  it("rejects arrays as top-level value", () => {
    expect(() => parseSettingsJson("[1,2,3]")).toThrow(/top level/);
  });
  it("rejects primitives as top-level value", () => {
    expect(() => parseSettingsJson("42")).toThrow(/top level/);
    expect(() => parseSettingsJson("null")).toThrow(/top level/);
  });
});
