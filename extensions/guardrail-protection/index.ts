/**
 * Guardrail Protection Extension
 *
 * Blocks file mutations that affect guardrail test files.
 * Files match if path contains "guardrail" or filename contains "guardrail"
 * (catches guardrail-suffixed test and similar patterns).
 *
 * Asks for explicit 'y' confirmation — Enter/Escape alone do not bypass.
 *
 * Bash handling: a command is allowed without confirmation only when EVERY
 * pipeline segment is a read-only command (find, rg, head, cat, xargs echo, …).
 * Pipeline-aware classifier:
 *
 *   1. splitBashSegments splits on |, ||, &&, ;, newlines (quote-aware).
 *   2. classifySegment tokenises the segment and walks the prefix chain
 *      (env / command / exec / builtin / nice) before consulting the
 *      read-only / mutating allow-lists.
 *   3. xargs gets an option-aware parser that respects options that
 *      consume a following argument (-I, --replace, -n, -L, -P, -s, -d,
 *      -E, --max-args, …) in both separate and attached forms.
 *   4. Heredocs (<<EOF, <<'EOF', <<-EOF), process substitution (<( … ),
 *      >( … )) and any write redirect to a real file flip a segment to
 *      "unknown", which falls back to the existing confirm prompt.
 *   5. FD duplication (2>&1, 1>&2, 2>&-) is benign.
 *
 * Anything "unknown" or "mutate" still triggers the original confirm
 * prompt, so the guardrail stays tight for ambiguous commands.
 * `/gp` slash command toggles protection per-session (default: on). Use
 * `/gp on`, `/gp off`, `/gp status`, or `/gp toggle` to control.
 *
 * Exported helpers for testing. Default export is the pi extension factory.
 */
import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

import type { AutocompleteItem } from "@earendil-works/pi-tui";

/** Check if a file path targets a guardrail file. */
export function isGuardrailFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? "";

  // Path contains "guardrail" (e.g., src/guardrails/permissions.test.ts)
  // OR filename contains "guardrail" (e.g., guardrail-permissions.test.ts)
  return normalized.includes("guardrail") || basename.includes("guardrail");
}

/** Extract all file paths referenced in a bash command. */
export function extractBashPaths(command: string): string[] {
  const paths: string[] = [];
  const tokens = command.match(
    // Match quoted strings or bare file paths
    /(['"])(?:(?!\1).)*\1|\/\S+|\.\.?(?:\/[\w.@~()-]+)+(?:\.[\w]+)?/g,
  );
  if (!tokens) return paths;

  for (const token of tokens) {
    const cleaned = token.replace(/^["']|["']$/g, "").trim();
    if (cleaned && !cleaned.startsWith("-") && !cleaned.startsWith("$")) {
      paths.push(cleaned);
    }
  }
  return paths;
}

/** Build a human-readable description of why a path matched. */
export function describeGuardrailMatch(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? "";

  if (normalized.includes("guardrails/") && basename.endsWith(".test.ts")) {
    return `Guardrail test file: ${path}`;
  }
  if (normalized.includes("guardrail")) {
    return `Path contains "guardrail": ${path}`;
  }
  return `Filename contains "guardrail": ${path}`;
}

// ---------------------------------------------------------------------------
//  Read-only / mutating allow-lists
// ---------------------------------------------------------------------------

/** Read-only commands: nothing they invoke can mutate the filesystem. */
const READ_ONLY_COMMANDS = new Set([
  // Search / list
  "find",
  "rg",
  "grep",
  "ag",
  "ack",
  // File inspection
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "bat",
  "view",
  // Listing / paths
  "ls",
  "tree",
  "pwd",
  "realpath",
  "readlink",
  "dirname",
  "basename",
  // Size / metadata
  "wc",
  "du",
  "df",
  "stat",
  "file",
  // Text transforms (mutating flags like sed -i flip to unknown)
  "awk",
  "gawk",
  "sed",
  "tr",
  "cut",
  "paste",
  "column",
  "sort",
  "uniq",
  // Structured data
  "jq",
  "yq",
  // Diff
  "diff",
  // Output
  "echo",
  "printf",
  // Process inspection
  "ps",
  "pgrep",
  "pidof",
  // Shell primitives
  "test",
  "[",
  "true",
  "false",
]);

/** Mutating commands: their base invocation writes / removes files. */
const MUTATING_COMMANDS = new Set([
  "rm",
  "mv",
  "cp",
  "ln",
  "touch",
  "chmod",
  "chown",
  "chgrp",
  "mkdir",
  "rmdir",
  "install",
  "tee",
  "dd",
  "shred",
  "truncate",
]);

// ---------------------------------------------------------------------------
//  xargs option sets
// ---------------------------------------------------------------------------

/** xargs options that consume a separate following argument. */
const XARGS_TAKES_ARG = new Set([
  "-I",
  "--replace",
  "-E",
  "--eof",
  "-n",
  "--max-args",
  "-L",
  "--max-lines",
  "-P",
  "--max-procs",
  "-s",
  "--max-chars",
  "-d",
  "--delimiter",
]);

/** xargs options that do not consume a following argument. */
const XARGS_NO_ARG = new Set([
  "-0",
  "-r",
  "--no-run-if-empty",
  "-t",
  "--verbose",
  "-p",
  "--interactive",
  "-x",
  "--exit",
]);

// ---------------------------------------------------------------------------
//  Redirect classification
// ---------------------------------------------------------------------------

/**
 * Targets of `>` / `>>` / `&>` / `&>>` that do not write to a real file.
 * Includes /dev/null and friends, /proc/* virtual paths, and FD
 * duplication / close (`&1`, `&2`, `&-`).
 */
const REDIRECT_BENIGN_TARGET = new RegExp(
  "^(?:" +
    "\\/?dev\\/(?:null|stdout|stderr|fd\\/\\d+|full|zero|random|urandom|tty)" +
    "|\\/proc\\/[\\w/.-]*" +
    "|&\\d+" +
    "|&-" +
    ")$",
);

/** True if `segment` contains a write redirect to a real file. */
function hasMutatingRedirect(segment: string): boolean {
  let i = 0;
  let quote: '"' | "'" | null = null;
  while (i < segment.length) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < segment.length) {
      i += 2;
      continue;
    }
    const isClober = ch === ">" || (ch === "&" && segment[i + 1] === ">");
    if (!isClober) {
      i++;
      continue;
    }
    if (ch === "&") i++; // &> / &>>
    i++; // > or >
    if (segment[i] === ">") i++; // >> / &>>
    // skip whitespace
    while (i < segment.length && (segment[i] === " " || segment[i] === "\t"))
      i++;
    // read the target token
    let path = "";
    const open = segment[i];
    if (open === '"' || open === "'") {
      i++;
      while (i < segment.length) {
        const c = segment[i];
        if (c === undefined || c === open) break;
        path += c;
        i++;
      }
      if (i < segment.length) i++; // closing quote
    } else {
      while (i < segment.length) {
        const c = segment[i];
        if (c === undefined || /[\s|&;()<]/.test(c)) break;
        path += c;
        i++;
      }
    }
    if (path && !REDIRECT_BENIGN_TARGET.test(path)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
//  Other unsafe shell constructs
// ---------------------------------------------------------------------------

function hasSubshell(segment: string): boolean {
  // $(...) or backticks — could embed any command, so treat as opaque.
  return /\$\(|`/.test(segment);
}

function hasHeredoc(segment: string): boolean {
  // <<EOF, <<'EOF', <<"EOF", <<-EOF, with optional whitespace.
  return /<<-?\s*(?:"[^"]*"|'[^']*'|[A-Za-z_]\w*)/.test(segment);
}

function hasProcessSubstitution(segment: string): boolean {
  // <(cmd) or >(cmd)
  return /[<>]\(/.test(segment);
}

// ---------------------------------------------------------------------------
//  Mutating flag detection
// ---------------------------------------------------------------------------

function hasMutatingFlag(segment: string, base: string): boolean {
  if (base === "find") {
    return /(^|\s)(--?(?:exec|execdir|delete|ok|f|flush))(\s|=|$|;|\|)/.test(
      segment,
    );
  }
  if (base === "sed" || base === "awk" || base === "gawk" || base === "perl") {
    // -i, --in-place, -i.bak (attached backup suffix)
    return /(^|\s)(--?i(?:n|-place)?)(\s|=|$|;|\||\.)/.test(segment);
  }
  return false;
}

// ---------------------------------------------------------------------------
//  Segmentation + tokenisation
// ---------------------------------------------------------------------------

/** Split a bash command into top-level segments, respecting quotes. */
export function splitBashSegments(command: string): string[] {
  const segments: string[] = [];
  let buf = "";
  let i = 0;
  let quote: '"' | "'" | null = null;
  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed) segments.push(trimmed);
    buf = "";
  };
  while (i < command.length) {
    const ch = command[i];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < command.length) {
      buf += ch + command[i + 1];
      i += 2;
      continue;
    }
    if (ch === "|" && command[i + 1] === "|") {
      flush();
      i += 2;
      continue;
    }
    if (ch === ";" && command[i + 1] === ";") {
      flush();
      i += 2;
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      flush();
      i += 2;
      continue;
    }
    if (ch === "|" || ch === ";" || ch === "\n") {
      flush();
      i += 1;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return segments;
}

/** Split a single segment into whitespace-separated tokens, quote-aware. */
function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      buf += ch;
      if (ch === quote && segment[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === undefined || /\s/.test(ch)) {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      continue;
    }
    buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens;
}

/** Strip surrounding quotes, then take the basename of a command path. */
function commandBase(word: string): string {
  let w = word;
  if (w.length >= 2) {
    const first = w[0];
    const last = w[w.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      w = w.slice(1, -1);
    }
  }
  return w.split("/").pop() ?? w;
}

// ---------------------------------------------------------------------------
//  Command-prefix peeling
// ---------------------------------------------------------------------------

/**
 * Peel off shell command prefixes (`env`, `command`, `exec`, `builtin`,
 * `nice`) and leading env-var assignments. Returns the effective
 * token list to classify, or marks the segment as ambiguous when the
 * prefix chain contains something we don't understand.
 */
function peelCommandPrefixes(tokens: string[]): {
  tokens: string[];
  ambiguous: boolean;
} {
  if (tokens.length === 0) return { tokens, ambiguous: true };
  let i = 0;
  // Skip leading env-var assignments (FOO=bar cmd)
  while (i < tokens.length && /^[A-Za-z_]\w*=/.test(tokens[i] ?? "")) i++;
  if (i >= tokens.length) return { tokens, ambiguous: true };
  const head = tokens[i];
  if (head === undefined) return { tokens, ambiguous: true };

  if (head === "env") {
    i++;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === undefined) return { tokens, ambiguous: true };
      if (/^[A-Za-z_]\w*=/.test(t)) {
        i++;
        continue;
      }
      if (t === "-i" || t === "--ignore-environment") {
        i++;
        continue;
      }
      if (t === "-u" || t === "--unset") {
        i += 2;
        continue;
      }
      if (t.startsWith("--unset=")) {
        i++;
        continue;
      }
      if (t.startsWith("-u") && t.length > 2) {
        i++;
        continue;
      }
      if (t === "-0" || t === "--null") {
        i++;
        continue;
      }
      // Any other flag (e.g. -S, -C, -P) could run arbitrary commands.
      if (t.startsWith("-")) return { tokens, ambiguous: true };
      break;
    }
    if (i >= tokens.length) return { tokens, ambiguous: true };
    return { tokens: tokens.slice(i), ambiguous: false };
  }

  if (head === "command") {
    i++;
    if (tokens[i] === "-p" || tokens[i] === "--") i++;
    if (i >= tokens.length) return { tokens, ambiguous: true };
    return { tokens: tokens.slice(i), ambiguous: false };
  }

  if (head === "exec") {
    i++;
    // Be conservative: only `--` is a known-safe separator.
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === undefined) return { tokens, ambiguous: true };
      if (t === "--") {
        i++;
        break;
      }
      if (t.startsWith("-")) return { tokens, ambiguous: true };
      break;
    }
    if (i >= tokens.length) return { tokens, ambiguous: true };
    return { tokens: tokens.slice(i), ambiguous: false };
  }

  if (head === "builtin") {
    i++;
    if (i >= tokens.length) return { tokens, ambiguous: true };
    return { tokens: tokens.slice(i), ambiguous: false };
  }

  if (head === "nice") {
    i++;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === undefined) return { tokens, ambiguous: true };
      if (t === "-n" || t === "--adjustment") {
        i += 2;
        continue;
      }
      if (t.startsWith("--adjustment=")) {
        i++;
        continue;
      }
      if (/^-n-?\d+$/.test(t)) {
        i++;
        continue;
      }
      if (t === "--") {
        i++;
        break;
      }
      if (t.startsWith("-")) return { tokens, ambiguous: true };
      break;
    }
    if (i >= tokens.length) return { tokens, ambiguous: true };
    return { tokens: tokens.slice(i), ambiguous: false };
  }

  return { tokens: tokens.slice(i), ambiguous: false };
}

// ---------------------------------------------------------------------------
//  xargs option-aware invocation parser
// ---------------------------------------------------------------------------

/**
 * Parse the tokens after `xargs` to find the actual invoked command.
 * Consumes flags that take an argument (in both separate and attached
 * forms). Returns `{ cmd, ambiguous }`.
 */
function parseXargsInvocation(tokens: string[]): {
  cmd: string | null;
  ambiguous: boolean;
} {
  let i = 1;
  // skip env-var assignments
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === undefined) return { cmd: null, ambiguous: true };
    if (/^[A-Za-z_]\w*=/.test(t)) i++;
    else break;
  }
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === undefined) return { cmd: null, ambiguous: true };
    if (XARGS_NO_ARG.has(t)) {
      i++;
      continue;
    }
    if (XARGS_TAKES_ARG.has(t)) {
      // separate-arg form: option + value
      i += 2;
      continue;
    }
    // Attached long form: --replace=foo
    if (t.startsWith("--") && t.includes("=")) {
      i++;
      continue;
    }
    // Attached short form: -I{}, -n1, -L1, -P4, -s4096, -d'\n'
    if (t.length > 2 && t.startsWith("-") && !t.startsWith("--")) {
      const opt = t.slice(0, 2);
      if (XARGS_TAKES_ARG.has(opt)) {
        i++;
        continue;
      }
      return { cmd: null, ambiguous: true };
    }
    // Unknown long or short option
    if (t.startsWith("-")) return { cmd: null, ambiguous: true };
    // Found the invoked command.
    return { cmd: t, ambiguous: false };
  }
  // No invoked command found.
  return { cmd: null, ambiguous: true };
}

// ---------------------------------------------------------------------------
//  Classification
// ---------------------------------------------------------------------------

/** Classify a single segment. */
export function classifySegment(
  segment: string,
): "read" | "mutate" | "unknown" {
  // Unsafe shell constructs first — any of these flips to unknown.
  if (hasSubshell(segment)) return "unknown";
  if (hasHeredoc(segment)) return "unknown";
  if (hasProcessSubstitution(segment)) return "unknown";
  if (hasMutatingRedirect(segment)) return "unknown";

  const tokens = tokenize(segment);
  if (tokens.length === 0) return "unknown";

  // Inspection builtins that do not execute their argument.
  if (tokens[0] === "type") return "read";
  if (tokens[0] === "command" && (tokens[1] === "-v" || tokens[1] === "-V")) {
    return "read";
  }

  // pnpm: only `pnpm vitest` and `pnpm typecheck` are read-only.
  if (tokens[0] === "pnpm") {
    if (tokens[1] === "vitest" || tokens[1] === "typecheck") return "read";
    return "unknown";
  }

  // Peel command prefixes (env / command / exec / builtin / nice).
  const peeled = peelCommandPrefixes(tokens);
  if (peeled.ambiguous) return "unknown";
  const effective = peeled.tokens;
  if (effective.length === 0) return "unknown";

  const word = effective[0];
  if (word === undefined) return "unknown";
  const base = commandBase(word);

  if (MUTATING_COMMANDS.has(base) && !READ_ONLY_COMMANDS.has(base)) {
    return "mutate";
  }
  if (hasMutatingFlag(segment, base)) return "unknown";

  if (base === "xargs") {
    const parsed = parseXargsInvocation(effective);
    if (parsed.ambiguous) return "unknown";
    if (!parsed.cmd) return "unknown";
    const nextBase = commandBase(parsed.cmd);
    if (MUTATING_COMMANDS.has(nextBase) && !READ_ONLY_COMMANDS.has(nextBase)) {
      return "mutate";
    }
    if (READ_ONLY_COMMANDS.has(nextBase)) return "read";
    return "unknown";
  }

  if (READ_ONLY_COMMANDS.has(base)) return "read";
  return "unknown";
}

/** True only when every segment of the command is read-only. */
export function isReadOnlyBash(command: string): boolean {
  const segments = splitBashSegments(command);
  if (segments.length === 0) return false;
  return segments.every((s) => classifySegment(s) === "read");
}

// ---------------------------------------------------------------------------
//  Extension factory
// ---------------------------------------------------------------------------

export default function guardrailProtection(pi: ExtensionAPI) {
  // Per-session toggle state. Defaults to enabled.

  let enabled = true;

  pi.registerCommand("gp", {
    description:
      "Toggle guardrail protection (on/off/status/toggle). Default: on.",

    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const opts = ["on", "off", "status", "toggle"];

      const items = opts.map((v) => ({ value: v, label: v }));

      const filtered = items.filter((i) => i.value.startsWith(prefix));

      return filtered.length > 0 ? filtered : null;
    },

    handler: async (args, ctx) => {
      const sub = (args ?? "").trim().toLowerCase();

      if (sub === "" || sub === "status") {
        ctx.ui.notify(
          `Guardrail protection: ${enabled ? "on" : "off"}`,

          "info",
        );

        return;
      }

      if (sub === "toggle") {
        enabled = !enabled;
      } else if (sub === "on") {
        enabled = true;
      } else if (sub === "off") {
        enabled = false;
      } else {
        ctx.ui.notify(
          `Unknown arg "${sub}". Use: on | off | toggle | status`,

          "warning",
        );

        return;
      }

      ctx.ui.notify(
        `Guardrail protection: ${enabled ? "on" : "off"}`,

        "info",
      );
    },
  });

  pi.on(
    "tool_call",

    async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
      // Bail early when protection has been toggled off for this session.

      if (!enabled) return;

      let matchedPath: string | undefined;

      if (event.toolName === "write" || event.toolName === "edit") {
        const targetPath = event.input.path as string | undefined;

        if (targetPath && isGuardrailFile(targetPath)) {
          matchedPath = targetPath;
        }
      } else if (event.toolName === "bash") {
        const command = event.input.command as string | undefined;

        if (command) {
          const paths = extractBashPaths(command);

          matchedPath = paths.find(isGuardrailFile);

          // Read-only pipelines (e.g. find … | xargs rg … | head) reference

          // guardrail paths as inputs but don't mutate. Skip the prompt

          // only when the entire pipeline is provably read-only.

          if (matchedPath && isReadOnlyBash(command)) {
            return;
          }
        }
      }

      if (!matchedPath) return;

      const reason = describeGuardrailMatch(matchedPath);

      if (!ctx.hasUI) {
        return { block: true, reason: `Guardrail protection: ${reason}` };
      }

      // Must type literal "y" — Enter/Escape do NOT bypass

      const response = await ctx.ui.input(
        `\u26a0\ufe0f  Guardrail Protection\n\n${reason}\n\nType "y" to confirm mutation:`,

        "y",
      );

      if (response !== "y") {
        return {
          block: true,

          reason: `Guardrail mutation denied by user: ${reason}`,
        };
      }
    },
  );
}
