/**
 * Token-hygiene phase-boundary tests.
 *
 * Functions as a mechanical gate: asserts this branch does not create
 * compressor modules or compression tests that belong in Phase 2.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md
 * Plan: docs/plans/2026-07-07-token-hygiene-extension.md (Task 2)
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe("Phase boundary — no Phase 2 compressor files", () => {
  it("bash-compressors.ts exists (Phase 2)", () => {
    expect(
      existsSync(
        join(repoRoot, "extensions/token-hygiene/bash-compressors.ts"),
      ),
    ).toBe(true);
  });

  it("compression-guards.ts exists (Phase 2)", () => {
    expect(
      existsSync(
        join(repoRoot, "extensions/token-hygiene/compression-guards.ts"),
      ),
    ).toBe(true);
  });

  it("compression test files do not exist", () => {
    expect(
      existsSync(join(repoRoot, "tests/token-hygiene-compression.test.ts")),
    ).toBe(false);
  });
});
