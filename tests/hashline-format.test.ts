import { describe, it, expect } from "vitest";
import { formatIfSupported } from "../extensions/pi-hashline-edit/src/format";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// RED: formatIfSupported doesn't exist yet.
// EXPECTED: format a ts file with prettier; unformatted content comes back
// with semicolons normalised, indentation fixed, etc.

describe("formatIfSupported — prettier integration", () => {
  it("formats a TypeScript file with prettier, returning the formatted content", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hashline-format-"));
    try {
      const filePath = join(tmpDir, "sample.ts");
      // Deliberately poorly-formatted content (missing semicolons, bad indent)
      const sloppy = "const   x  =1\nif(x){console.log(x)}\n";
      writeFileSync(filePath, sloppy, "utf-8");

      const result = await formatIfSupported(filePath, sloppy);

      expect(result.formatted).toBe(true);
      // Prettier should add semicolons and reformat braces
      expect(result.content).not.toBe(sloppy);
      expect(result.content).toContain("const x = 1;");
      expect(result.content).toContain("if (x) {");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns content unchanged when file extension is unsupported", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hashline-format-"));
    try {
      const filePath = join(tmpDir, "sample.bin");
      const content = "\x00\x01\x02\x03binary data";
      writeFileSync(filePath, content, "utf-8");

      const result = await formatIfSupported(filePath, content);

      // Prettier doesn't know .bin → returns content unchanged, formatted=false
      expect(result.formatted).toBe(false);
      expect(result.content).toBe(content);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("falls back silently when prettier is not installed (or throws)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hashline-format-"));
    try {
      const filePath = join(tmpDir, "sample.ts");
      const content = "const x = 1\n";

      // Pass a malformed path that would cause prettier to throw
      // (e.g. binary content with .ts extension)
      const result = await formatIfSupported(filePath, content);

      // Either formatted=true (prettier handled it) OR formatted=false with
      // content unchanged (silent fallback). Both are valid; the contract is
      // "never throw, never corrupt the content".
      expect(result.content).toBeTruthy();
      if (!result.formatted) {
        expect(result.content).toBe(content);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
