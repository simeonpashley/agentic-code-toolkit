import { describe, it, expect } from "vitest";
import { applyMutation } from "../extensions/pi-hashline-edit/src/mutation";
import { resolveEditTarget } from "../extensions/pi-hashline-edit/src/edit";
import {
  computeLineHash,
  buildHashlineFile,
} from "../extensions/pi-hashline-edit/src/hashline";
import { formatIfSupported } from "../extensions/pi-hashline-edit/src/format";
import { recordMtime } from "../extensions/pi-hashline-edit/src/stale-read";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function makeCtx(cwd: string) {
  return { cwd } as unknown as Parameters<typeof applyMutation>[0]["ctx"];
}

describe("applyMutation — format-on-write is disabled", () => {
  it("writes raw agent output verbatim without prettier formatting", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hashline-mutation-"));
    try {
      const filePath = join(tmpDir, "sample.ts");
      const original = ["function hello() {", "  return 1", "}", ""].join("\n");
      writeFileSync(filePath, original, "utf-8");

      const target = await resolveEditTarget(filePath, filePath, 6);
      expect(target.ok).toBe(true);
      if (!target.ok) return;

      const file = buildHashlineFile(target.normalized);
      const pos = `2#x${computeLineHash(file.lines, 1)}`;
      recordMtime(filePath);
      const result = await applyMutation({
        pi: undefined,
        path: filePath,
        absolutePath: filePath,
        toolEdits: [
          {
            op: "replace",
            pos,
            end: pos,
            lines: ["const x=1"],
          },
        ],
        signal: undefined,
        ctx: makeCtx(tmpDir),
      });

      const onDisk = readFileSync(filePath, "utf-8");
      expect(onDisk).toContain("const x=1");
      expect(onDisk).not.toContain("const x = 1;");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("formatIfSupported falls back when file extension is unsupported", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hashline-fmt-"));
    try {
      const filePath = join(tmpDir, "sample.bin");
      const original = "\x00\x01abc\x02\x03";
      writeFileSync(filePath, original, "utf-8");

      const fmtResult = await formatIfSupported(filePath, original);
      expect(fmtResult.formatted).toBe(false);
      expect(fmtResult.content).toBe(original);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
