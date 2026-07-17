import { describe, expect, it, afterEach, beforeAll } from "vitest";
import {
  statSync as fsStatSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  utimesSync,
  readFileSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  recordMtime,
  checkStale,
  clearReadMarkers,
  _readMarkersForTesting,
} from "../extensions/pi-hashline-edit/src/stale-read";
import { applyMutation } from "../extensions/pi-hashline-edit/src/mutation";
import { resolveEditTarget } from "../extensions/pi-hashline-edit/src/edit";
import { computeLineHash } from "../extensions/pi-hashline-edit/src/hashline";

const tmpDir = join(__dirname, "__stale_read_tmp__");
const fixture = (name: string) => join(tmpDir, name);

// Stub ExtensionContext — applyMutation only needs cwd + signal.
function makeCtx(cwd: string) {
  return { cwd } as unknown as Parameters<typeof applyMutation>[0]["ctx"];
}
function writeAndRecord(path: string, content: string): void {
  writeFileSync(path, content, "utf-8");
  recordMtime(path);
}

describe("stale-read protection", () => {
  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ok */
    }
    clearReadMarkers();
  });

  it("allows edit when file has not changed since recordMtime", () => {
    mkdirSync(tmpDir, { recursive: true });
    const f = fixture("unchanged.txt");
    writeAndRecord(f, "hello");
    expect(checkStale(f, f)).toBeUndefined();
  });

  it("rejects edit when file mtime advanced after recordMtime", async () => {
    mkdirSync(tmpDir, { recursive: true });
    const f = fixture("changed.txt");
    writeAndRecord(f, "hello");

    // Advance mtime by writing to the file after a small delay
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(f, "hello world", "utf-8");

    const msg = checkStale(f, f);
    expect(msg).toBeDefined();
    expect(msg).toContain("File changed since last read");
    expect(msg).toContain("Re-read first");
  });

  it("rejects edit when file has never been read (no marker recorded)", () => {
    mkdirSync(tmpDir, { recursive: true });
    const f = fixture("no_marker.txt");
    writeFileSync(f, "hello", "utf-8");
    const msg = checkStale(f, f);
    expect(msg).toBeDefined();
    expect(msg).toContain("has not been read yet");
  });

  it("allows edit when file deleted after recordMtime (ENOENT)", () => {
    mkdirSync(tmpDir, { recursive: true });
    const f = fixture("deleted.txt");
    writeAndRecord(f, "hello");
    rmSync(f, { force: true });
    expect(checkStale(f, f)).toBeUndefined();
  });

  it("recordMtime updates marker when called again", () => {
    mkdirSync(tmpDir, { recursive: true });
    const f = fixture("reread.txt");
    writeAndRecord(f, "v1");
    writeFileSync(f, "v2", "utf-8");
    recordMtime(f); // re-record
    expect(checkStale(f, f)).toBeUndefined();
  });

  it("clearReadMarkers removes all tracked files", () => {
    mkdirSync(tmpDir, { recursive: true });
    const f1 = fixture("a.txt");
    const f2 = fixture("b.txt");
    writeAndRecord(f1, "a");
    writeAndRecord(f2, "b");
    expect(_readMarkersForTesting().size).toBe(2);
    clearReadMarkers();
    expect(_readMarkersForTesting().size).toBe(0);
  });

  it("recordMtime does not crash on nonexistent path (ENOENT)", () => {
    expect(() => recordMtime("/nonexistent/path/file.txt")).not.toThrow();
    expect(_readMarkersForTesting().has("/nonexistent/path/file.txt")).toBe(
      false,
    );
  });

  it("display path used in rejection message, not absolute path", async () => {
    mkdirSync(tmpDir, { recursive: true });
    const f = fixture("display.txt");
    writeAndRecord(f, "hello");
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(f, "changed", "utf-8");
    const msg = checkStale(f, "my-display-file.ts");
    expect(msg).toContain("my-display-file.ts");
  });
  it("applyMutation rejects when file has never been read", async () => {
    const mutTmp = mkdtempSync(join(tmpdir(), "stale-neverread-"));
    try {
      const filePath = join(mutTmp, "sample.ts");
      writeFileSync(filePath, "alpha\nbeta\ngamma", "utf-8");

      const target = await resolveEditTarget(filePath, filePath, 6);
      expect(target.ok).toBe(true);
      if (!target.ok) return;

      // No recordMtime — simulates mutation without prior read
      const pos = `1#x${computeLineHash(target.normalized.split("\n"), 0)}`;
      const result = await applyMutation({
        pi: undefined,
        path: filePath,
        absolutePath: filePath,
        toolEdits: [{ op: "replace", pos, end: pos, lines: ["modified"] }],
        signal: undefined,
        ctx: makeCtx(mutTmp),
      });

      expect(result.isError).toBe(true);
      expect(result.details).toMatchObject({ stale: true });
      expect(result.content[0].text).toContain("has not been read yet");
    } finally {
      rmSync(mutTmp, { recursive: true, force: true });
    }
  });
});
