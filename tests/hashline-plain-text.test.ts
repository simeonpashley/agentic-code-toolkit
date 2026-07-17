import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  handlePlainTextStrReplace,
  parseHashlineOldStr,
} from "../extensions/pi-hashline-edit/src/str-replace";
import {
  buildHashlineFile,
  computeLineHash,
  applySpans,
  resolveEditSpans,
} from "../extensions/pi-hashline-edit/src/hashline";

function readLine(lines: readonly string[], index: number): string {
  return `${index + 1}#x${computeLineHash(lines, index)}│${lines[index]}`;
}

describe("handlePlainTextStrReplace — exact-string match fallback", () => {
  // ── Happy path ────────────────────────────────────────────────────

  it("replaces a single unique match", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-plain-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "hello world\nsecond line\nthird\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "hello world", new_str: "hai there" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("hai there\nsecond line\nthird\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("replaces the correct line when old_str appears on line 2 in 3-line file", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-correct-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "alpha\nbeta\ngamma\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "beta", new_str: "BETA" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("alpha\nBETA\ngamma\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Multi-line ────────────────────────────────────────────────────

  it("replaces multi-line block", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-ml-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "a\nb\nc\nd\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "b\nc", new_str: "B\nC" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("a\nB\nC\nd\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("replaces multi-line block at start of file", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-ml-start-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "line 1\nline 2\nline 3\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        {
          path: f,
          old_str: "line 1\nline 2",
          new_str: "replaced 1\nreplaced 2",
        },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("replaced 1\nreplaced 2\nline 3\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("replaces multi-line block at end of file", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-ml-end-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "line 1\nline 2\nline 3\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        {
          path: f,
          old_str: "line 2\nline 3",
          new_str: "replaced 2\nreplaced 3",
        },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("line 1\nreplaced 2\nreplaced 3\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Boundary lines ────────────────────────────────────────────────

  it("handles first line of file", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-first-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "first\nsecond\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "first", new_str: "changed first" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("changed first\nsecond\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles last line of file", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-last-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "first\nsecond\nlast\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "last", new_str: "last changed" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("first\nsecond\nlast changed\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles single-line file", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-single-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "only line\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "only line", new_str: "changed" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("changed\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Delete mode ───────────────────────────────────────────────────

  it("deletes line via empty new_str", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-del-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "keep\nremove\nkeep\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "remove", new_str: "" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("keep\nkeep\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("deletes first line via empty new_str", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-del-first-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "remove\nkeep\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "remove", new_str: "" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("keep\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("deletes last line via empty new_str", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-del-last-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "keep\nremove\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "remove", new_str: "" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("keep\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Error: no match ───────────────────────────────────────────────

  it("errors with steering when no match", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-nomatch-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "hello world\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "nonexistent", new_str: "x" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("E_NO_MATCH");
      expect(result.content[0].text).toContain("hashline-prefixed");
      expect(result.content[0].text).toContain("12#x3FF│const x=1;");
      expect(readFileSync(f, "utf-8")).toBe("hello world\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("errors with no-change when old_str matches current content exactly (noop)", async () => {
    // When the edit ends up producing identical file content, the engine
    // returns a noop response rather than an error.
    const tmp = mkdtempSync(join(tmpdir(), "sr-noop-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "hello\nworld\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "hello", new_str: "hello" },
        f,
        { cwd: tmp } as any,
      );
      // Noop — content didn't change, so it's not an error
      expect(result.isError).toBeFalsy();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Error: multiple matches ────────────────────────────────────────

  it("errors with steering when multiple matches", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-mm-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "dup\ndup\ndup\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "dup", new_str: "changed" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("E_MULTI_MATCH");
      expect(result.content[0].text).toContain("hashline-prefixed");
      expect(readFileSync(f, "utf-8")).toBe("dup\ndup\ndup\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("errors on multiple matches even when they span different contexts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-mm-ctx-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "abc\ndef abc ghi\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "abc", new_str: "xyz" },
        f,
        { cwd: tmp } as any,
      );
      // "abc" at line 1 AND within "def abc ghi" at line 2
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("E_MULTI_MATCH");
      expect(readFileSync(f, "utf-8")).toBe("abc\ndef abc ghi\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Substring match (whole-line replacement) ─────────────────────

  it("replaces entire line when old_str is a line substring", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-sub-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "const x = require('./util');\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        {
          path: f,
          old_str: "require('./util')",
          new_str: "import('./util.js')",
        },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      // The hashline engine replaces entire lines, not inline
      expect(readFileSync(f, "utf-8")).toBe("import('./util.js')\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Special characters ────────────────────────────────────────────

  it("handles old_str with regex metacharacters (. * + ? ( ) [ ] { } | \\ ^ $)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-meta-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "price: $10.00 + tax (5%)\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        {
          path: f,
          old_str: "price: $10.00 + tax (5%)",
          new_str: "cost: $10.50",
        },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("cost: $10.50\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles old_str with leading/trailing whitespace", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-space-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "  indented line\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "  indented line", new_str: "  changed indented" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("  changed indented\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles old_str with tabs", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-tabs-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "\t\ttab-indented\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "\t\ttab-indented", new_str: "\t\tchanged" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("\t\tchanged\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles old_str with unicode characters", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-unicode-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "héllo wörld 🎉\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "héllo wörld 🎉", new_str: "héllo wörld" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("héllo wörld\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Line ending normalization ──────────────────────────────────────

  it("handles CRLF line endings in file", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-crlf-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "alpha\r\nbeta\r\ngamma\r\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "beta", new_str: "BETA" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      // File should be written with the original line ending style preserved
      // (The mutation engine preserves original line endings)
      const content = readFileSync(f, "utf-8");
      expect(content).toContain("\r\n");
      expect(content).toBe("alpha\r\nBETA\r\ngamma\r\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Edge: files without trailing newline ───────────────────────────

  it("handles file without trailing newline", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-notrail-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "line 1\nline 2", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "line 2", new_str: "changed 2" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("line 1\nchanged 2");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Edge: new_str with special content ─────────────────────────────

  it("handles new_str with newlines (multi-line replacement of single line)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-expand-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "single\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "single", new_str: "line 1\nline 2\nline 3" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("line 1\nline 2\nline 3\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles new_str with leading whitespace (indentation)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-indent-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "line 1\nline 2\n", "utf-8");
      const result = await handlePlainTextStrReplace(
        { path: f, old_str: "line 2", new_str: "    indented line 2" },
        f,
        { cwd: tmp } as any,
      );
      expect(result.isError).toBeFalsy();
      expect(readFileSync(f, "utf-8")).toBe("line 1\n    indented line 2\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Safety: file must not be mutated on error ──────────────────────

  it("does not change file on no-match error", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-safe-nomatch-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "keep this\n", "utf-8");
      await handlePlainTextStrReplace(
        { path: f, old_str: "does not exist", new_str: "x" },
        f,
        { cwd: tmp } as any,
      );
      expect(readFileSync(f, "utf-8")).toBe("keep this\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not change file on multi-match error", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "sr-safe-mm-"));
    try {
      const f = join(tmp, "file.txt");
      writeFileSync(f, "same\nsame\n", "utf-8");
      await handlePlainTextStrReplace(
        { path: f, old_str: "same", new_str: "x" },
        f,
        { cwd: tmp } as any,
      );
      expect(readFileSync(f, "utf-8")).toBe("same\nsame\n");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("hashline old_str path (regression)", () => {
  it("still works with hashline-prefixed old_str", () => {
    const content = "alpha\nbeta\ngamma\ndelta\n";
    const file = buildHashlineFile(content);
    const oldStr = [readLine(file.lines, 1), readLine(file.lines, 2)].join(
      "\n",
    );
    const edit = parseHashlineOldStr(oldStr, "beta changed\ngamma changed");
    const result = resolveEditSpans(file, [edit]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(applySpans(file, result.spans).file.content).toBe(
      "alpha\nbeta changed\ngamma changed\ndelta\n",
    );
  });

  it("rejects non-contiguous hashline old_str", () => {
    const file = buildHashlineFile("alpha\nbeta\ngamma\n");
    expect(() =>
      parseHashlineOldStr(
        [readLine(file.lines, 0), readLine(file.lines, 2)].join("\n"),
        "x",
      ),
    ).toThrow(/contiguous/i);
  });

  it("rejects plain text sent to hashline parser", () => {
    expect(() => parseHashlineOldStr("beta", "x")).toThrow(
      /LINE#xHASH|hashline/i,
    );
  });
});
