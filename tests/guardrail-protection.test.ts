import { describe, it, expect } from "vitest";
import {
  isGuardrailFile,
  extractBashPaths,
  describeGuardrailMatch,
} from "../extensions/guardrail-protection/index";

// ── isGuardrailFile ─────────────────────────────────────────────────────

describe("isGuardrailFile", () => {
  it("blocks path containing guardrail (guardrails dir)", () => {
    expect(isGuardrailFile("src/guardrails/permissions.test.ts")).toBe(true);
  });

  it("blocks path with guardrail segment", () => {
    expect(isGuardrailFile("src/guardrail-utils/helper.test.ts")).toBe(true);
  });

  it("blocks filename containing guardrail", () => {
    expect(isGuardrailFile("guardrail-permissions.test.ts")).toBe(true);
  });

  it("blocks guardrails in mid-path", () => {
    expect(isGuardrailFile("some/path/guardrails/auth.test.ts")).toBe(true);
  });

  it("blocks bare guardrail.ts file", () => {
    expect(isGuardrailFile("src/guardrail.ts")).toBe(true);
  });

  it("allows normal test file", () => {
    expect(isGuardrailFile("src/components/button.test.ts")).toBe(false);
  });

  it("allows unrelated file", () => {
    expect(isGuardrailFile("README.md")).toBe(false);
  });

  it("allows deep normal path", () => {
    expect(isGuardrailFile("src/a/deeply/nested/file.txt")).toBe(false);
  });

  it("handles windows backslashes", () => {
    expect(isGuardrailFile("src\\guardrails\\permissions.test.ts")).toBe(true);
  });

  it("handles empty basename", () => {
    expect(isGuardrailFile("guardrail")).toBe(true);
  });
});

// ── extractBashPaths ────────────────────────────────────────────────────

describe("extractBashPaths", () => {
  it("finds absolute paths", () => {
    const result = extractBashPaths("cat /etc/guardrails/policy.test.ts");
    expect(result).toContain("/etc/guardrails/policy.test.ts");
  });

  it("finds relative paths with ./", () => {
    const result = extractBashPaths("rm ./src/guardrails/permissions.test.ts");
    expect(result).toContain("./src/guardrails/permissions.test.ts");
  });

  it("finds paths in quoted strings", () => {
    const result = extractBashPaths('cat "src/guardrails/permissions.test.ts"');
    expect(result).toContain("src/guardrails/permissions.test.ts");
  });

  it("finds paths in single quotes", () => {
    const result = extractBashPaths("cat 'src/guardrails/permissions.test.ts'");
    expect(result).toContain("src/guardrails/permissions.test.ts");
  });

  it("skips flags", () => {
    const result = extractBashPaths("rm -rf src/guardrails/");
    expect(result).not.toContain("-rf");
  });

  it("skips variable references", () => {
    const result = extractBashPaths("mv $OLD $NEW");
    expect(result).not.toContain("$OLD");
  });

  it("returns empty for paths only command", () => {
    const result = extractBashPaths("echo hello");
    expect(result).toEqual([]);
  });

  it("extracts multiple paths (./ prefix)", () => {
    const result = extractBashPaths("mv ./a.test.ts ./b/guardrails/c.test.ts");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// ── describeGuardrailMatch ──────────────────────────────────────────────

describe("describeGuardrailMatch", () => {
  it("labels guardrails/ test files", () => {
    const msg = describeGuardrailMatch("src/guardrails/permissions.test.ts");
    expect(msg).toContain("Guardrail test file");
  });

  it("labels path containing guardrail", () => {
    const msg = describeGuardrailMatch("src/guardrail-utils/helper.test.ts");
    expect(msg).toContain('"guardrail"');
  });

  it("labels filename containing guardrail", () => {
    const msg = describeGuardrailMatch("guardrail-permissions.test.ts");
    expect(msg).toContain('"guardrail"');
  });
});
