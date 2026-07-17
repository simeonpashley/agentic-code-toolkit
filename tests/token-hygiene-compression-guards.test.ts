import { describe, it, expect } from "vitest";
import type { SensitiveClassification } from "../extensions/token-hygiene/types";
import {
  evaluateCompressionEligibility,
  NEVER_COMPRESS_GUARDS,
  type CompressionGuard,
} from "../extensions/token-hygiene/compression-guards";

// ── Helpers ────────────────────────────────────────────────────────────────

const notSensitive: (_output: string) => SensitiveClassification = () =>
  "not-sensitive";
const alwaysSensitive: (_output: string) => SensitiveClassification = () =>
  "sensitive";
const alwaysUnknown: (_output: string) => SensitiveClassification = () =>
  "unknown";

// Default thresholds
const MIN_LINES = 25;
const MIN_CHARS = 200;

// ── evaluateCompressionEligibility ────────────────────────────────────────

describe("evaluateCompressionEligibility", () => {
  // ── eligible ──────────────────────────────────────────────────────────

  it("returns eligible when all conditions are met", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "On branch main\nnothing to commit, working tree clean\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("eligible");
  });

  // ── disabled-by-config ────────────────────────────────────────────────

  it("returns disabled-by-config when compressBashSuccesses is false", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: false,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "On branch main\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("disabled-by-config");
  });

  // ── non-zero-exit ─────────────────────────────────────────────────────

  it("returns non-zero-exit when exit code is non-zero", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 1,
      output: "fatal: not a git repository",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("non-zero-exit");
  });

  it("returns non-zero-exit for exit codes other than 0", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "pnpm test",
      commandFamily: "passing-tests",
      exitCode: 2,
      output: "error: test failed",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("non-zero-exit");
  });

  // ── unknown-family ────────────────────────────────────────────────────

  it("returns unknown-family when commandFamily is null", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "some-custom-tool --do-thing",
      commandFamily: null,
      exitCode: 0,
      output: "some output\n".repeat(30),
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("unknown-family");
  });

  // ── below-threshold ───────────────────────────────────────────────────

  it("returns below-threshold when lines are below minCompressLines", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "line 1\nline 2\n",
      env: {},
      minCompressLines: 25,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("below-threshold");
  });

  it("returns below-threshold when chars are below minCompressChars", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "hi",
      env: {},
      minCompressLines: 1,
      minCompressChars: 200,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("below-threshold");
  });

  it("returns below-threshold when both lines and chars are below threshold", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "short",
      env: {},
      minCompressLines: 100,
      minCompressChars: 1000,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("below-threshold");
  });

  // ── sensitive-output ──────────────────────────────────────────────────

  it("returns sensitive-output when classifyOutput returns sensitive", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "SECRET_KEY=abc123",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: alwaysSensitive,
    });
    expect(result).toBe("sensitive-output");
  });

  it("returns sensitive-output when classifyOutput returns unknown", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "\xff\xfe garbage bytes",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: alwaysUnknown,
    });
    expect(result).toBe("sensitive-output");
  });

  // ── never-compress (guards) ───────────────────────────────────────────

  it("returns never-compress for git diff commands", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git diff HEAD~1..HEAD",
      commandFamily: "git-status",
      exitCode: 0,
      output: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for diff-like commands", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "diff -u file1.txt file2.txt",
      commandFamily: "git-status",
      exitCode: 0,
      output: "--- file1.txt\n+++ file2.txt\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for cat file reads", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "cat src/index.ts",
      commandFamily: "git-status",
      exitCode: 0,
      output: "line 1\nline 2\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for head file reads", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "head -n 20 package.json",
      commandFamily: "git-status",
      exitCode: 0,
      output: "line 1\nline 2\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for tail file reads", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "tail -f /var/log/syslog",
      commandFamily: "git-status",
      exitCode: 0,
      output: "log line 1\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for sed -n range reads", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "sed -n '10,20p' src/main.ts",
      commandFamily: "git-status",
      exitCode: 0,
      output: "line 10\nline 11\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for curl responses", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "curl -s https://api.example.com/data",
      commandFamily: "git-status",
      exitCode: 0,
      output: '{"data": "value"}',
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for wget responses", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "wget -q -O - https://example.com/file",
      commandFamily: "git-status",
      exitCode: 0,
      output: "<html>content</html>",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for commands with --verbose flag", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "pnpm install --verbose",
      commandFamily: "package-install",
      exitCode: 0,
      output: "verbose: resolving packages\nverbose: downloading\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for commands with -v (verbose) flag", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "npm install -v",
      commandFamily: "package-install",
      exitCode: 0,
      output: "verbose: npm install\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress for commands with --debug flag", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "tsc --debug",
      commandFamily: "successful-builds",
      exitCode: 0,
      output: "debug: checking types\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress when PI_TOKEN_HYGIENE_NO_COMPRESS=1 is set", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "On branch main\n",
      env: { PI_TOKEN_HYGIENE_NO_COMPRESS: "1" },
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("returns never-compress when PI_TOKEN_HYGIENE_NO_COMPRESS=1 via env object", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "On branch main\n",
      env: { PI_TOKEN_HYGIENE_NO_COMPRESS: "1" },
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("never-compress");
  });

  it("does not return never-compress when PI_TOKEN_HYGIENE_NO_COMPRESS is set to 0", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "On branch main\nnothing to commit\n",
      env: { PI_TOKEN_HYGIENE_NO_COMPRESS: "0" },
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("eligible");
  });

  it("does not return never-compress when PI_TOKEN_HYGIENE_NO_COMPRESS is not set", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "On branch main\nnothing to commit\n",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("eligible");
  });

  // ── evaluation order precedence ───────────────────────────────────────

  it("returns non-zero-exit before unknown-family (exit checked first)", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: true,
      command: "unknown-tool",
      commandFamily: null,
      exitCode: 1,
      output: "error output",
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("non-zero-exit");
  });

  it("returns disabled-by-config before other checks", () => {
    const result = evaluateCompressionEligibility({
      compressBashSuccesses: false,
      command: "git status",
      commandFamily: "git-status",
      exitCode: 0,
      output: "output".repeat(100),
      env: {},
      minCompressLines: 1,
      minCompressChars: 1,
      classifyOutput: notSensitive,
    });
    expect(result).toBe("disabled-by-config");
  });
});

// ── NEVER_COMPRESS_GUARDS ─────────────────────────────────────────────────

describe("NEVER_COMPRESS_GUARDS", () => {
  describe("is-diff guard", () => {
    const guard = NEVER_COMPRESS_GUARDS.find(
      (g: CompressionGuard) => g.reason === "never-compress",
    );
    // We use the first never-compress guard that matches diff commands
    const diffGuard = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
      g.matches({ command: "git diff", output: "", exitCode: 0, env: {} }),
    );

    it("matches git diff", () => {
      expect(
        diffGuard?.matches({
          command: "git diff HEAD",
          output: "--- a/file\n+++ b/file\n",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("matches plain diff command", () => {
      const dg = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
        g.matches({ command: "diff -u a b", output: "", exitCode: 0, env: {} }),
      );
      expect(dg).toBeDefined();
      expect(
        dg!.matches({
          command: "diff -u a b",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("does not match git status", () => {
      // Pick the diff guard
      const dg = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
        g.matches({ command: "git diff", output: "", exitCode: 0, env: {} }),
      );
      expect(
        dg?.matches({
          command: "git status",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(false);
    });
  });

  describe("cat/head/tail guard", () => {
    const catGuard = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
      g.matches({ command: "cat foo.txt", output: "", exitCode: 0, env: {} }),
    );

    it("matches cat", () => {
      expect(
        catGuard?.matches({
          command: "cat src/index.ts",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("matches head", () => {
      const hg = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
        g.matches({ command: "head -n 20", output: "", exitCode: 0, env: {} }),
      );
      expect(
        hg?.matches({
          command: "head -n 20 package.json",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("matches tail", () => {
      expect(
        catGuard?.matches({
          command: "tail -f /var/log/syslog",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("matches sed -n with range", () => {
      expect(
        catGuard?.matches({
          command: "sed -n '10,20p' file.txt",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("does not match sed transform without -n", () => {
      expect(
        catGuard?.matches({
          command: "sed 's/foo/bar/g' file.txt",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(false);
    });
  });

  describe("curl/wget guard", () => {
    const curlGuard = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
      g.matches({
        command: "curl http://example.com",
        output: "",
        exitCode: 0,
        env: {},
      }),
    );

    it("matches curl", () => {
      expect(
        curlGuard?.matches({
          command: "curl -s https://api.example.com/data",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("matches wget", () => {
      expect(
        curlGuard?.matches({
          command: "wget -q -O - https://example.com/file",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("does not match unrelated commands", () => {
      expect(
        curlGuard?.matches({
          command: "git status",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(false);
    });
  });

  describe("verbose/debug guard", () => {
    const verbGuard = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
      g.matches({ command: "cmd --verbose", output: "", exitCode: 0, env: {} }),
    );

    it("matches --verbose flag", () => {
      expect(
        verbGuard?.matches({
          command: "pnpm install --verbose",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("matches -v flag as verbose", () => {
      expect(
        verbGuard?.matches({
          command: "npm install -v",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("matches --debug flag", () => {
      expect(
        verbGuard?.matches({
          command: "tsc --debug",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(true);
    });

    it("does not match grep -v (invert-match, not verbose)", () => {
      // grep -v is invert-match, not verbose
      expect(
        verbGuard?.matches({
          command: "grep -v pattern",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(false);
    });

    it("does not match normal commands without verbose flag", () => {
      expect(
        verbGuard?.matches({
          command: "pnpm install",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(false);
    });
  });

  describe("PI_TOKEN_HYGIENE_NO_COMPRESS guard", () => {
    it("matches when env var is '1'", () => {
      const envGuard = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
        g.matches({
          command: "git status",
          output: "",
          exitCode: 0,
          env: { PI_TOKEN_HYGIENE_NO_COMPRESS: "1" },
        }),
      );
      expect(envGuard).toBeDefined();
      expect(
        envGuard!.matches({
          command: "git status",
          output: "",
          exitCode: 0,
          env: { PI_TOKEN_HYGIENE_NO_COMPRESS: "1" },
        }),
      ).toBe(true);
    });

    it("does not match when env var is absent", () => {
      const envGuard = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
        g.matches({
          command: "git status",
          output: "",
          exitCode: 0,
          env: { PI_TOKEN_HYGIENE_NO_COMPRESS: "1" },
        }),
      );
      expect(
        envGuard!.matches({
          command: "git status",
          output: "",
          exitCode: 0,
          env: {},
        }),
      ).toBe(false);
    });

    it("does not match when env var is '0'", () => {
      const envGuard = NEVER_COMPRESS_GUARDS.find((g: CompressionGuard) =>
        g.matches({
          command: "git status",
          output: "",
          exitCode: 0,
          env: { PI_TOKEN_HYGIENE_NO_COMPRESS: "1" },
        }),
      );
      expect(
        envGuard!.matches({
          command: "git status",
          output: "",
          exitCode: 0,
          env: { PI_TOKEN_HYGIENE_NO_COMPRESS: "0" },
        }),
      ).toBe(false);
    });
  });
});
