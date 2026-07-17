/**
 * Tests for bash file-dump nudges and large-read warnings.
 *
 * Phase 1: nudge only cat/head/tail/sed -n/unbounded find/ls -R.
 * Do not nudge grep/rg/awk/jq/tree or transforms.
 * Large bash output is report-only, not model-visible.
 */

import { describe, it, expect } from "vitest";
import {
  classifyBashCommand,
  evaluateLargeRead,
  redactCommandSummary,
} from "../extensions/token-hygiene/bash-nudges.ts";

describe("classifyBashCommand", () => {
  describe("nudge candidates", () => {
    it("nudges `cat <file>`", () => {
      const result = classifyBashCommand("cat src/index.ts");
      expect(result.classification).toBe("cat-file");
      expect(result.warning).toBeTruthy();
    });

    it("nudges `cat file.ts` (no path)", () => {
      const result = classifyBashCommand("cat package.json");
      expect(result.classification).toBe("cat-file");
    });

    it("nudges `head <file>`", () => {
      const result = classifyBashCommand("head README.md");
      expect(result.classification).toBe("head-file");
      expect(result.warning).toBeTruthy();
    });

    it("nudges `head -20 <file>`", () => {
      const result = classifyBashCommand("head -20 src/main.ts");
      expect(result.classification).toBe("head-file");
    });

    it("nudges `tail <file>`", () => {
      const result = classifyBashCommand("tail server.log");
      expect(result.classification).toBe("tail-file");
      expect(result.warning).toBeTruthy();
    });

    it("nudges `sed -n '10,20p' <file>`", () => {
      const result = classifyBashCommand("sed -n '10,20p' src/file.ts");
      expect(result.classification).toBe("sed-range-print");
      expect(result.warning).toBeTruthy();
    });

    it("nudges unbounded `find` without -maxdepth", () => {
      const result = classifyBashCommand("find . -name '*.ts'");
      expect(result.classification).toBe("find-unbounded");
      expect(result.warning).toBeTruthy();
    });

    it("nudges `ls -R`", () => {
      const result = classifyBashCommand("ls -R src/");
      expect(result.classification).toBe("ls-R-large");
      expect(result.warning).toBeTruthy();
    });

    it("nudges `ls -laR`", () => {
      const result = classifyBashCommand("ls -laR .");
      expect(result.classification).toBe("ls-R-large");
    });
  });

  describe("no-nudge cases", () => {
    it("does not nudge grep", () => {
      expect(
        classifyBashCommand("grep -r 'function' src/").classification,
      ).toBe("no-nudge");
    });

    it("does not nudge rg", () => {
      expect(classifyBashCommand("rg 'pattern' src/").classification).toBe(
        "no-nudge",
      );
    });

    it("does not nudge awk", () => {
      expect(
        classifyBashCommand("awk '{print $1}' file.log").classification,
      ).toBe("no-nudge");
    });

    it("does not nudge jq", () => {
      expect(
        classifyBashCommand("jq '.name' package.json").classification,
      ).toBe("no-nudge");
    });

    it("does not nudge transform sed (substitution)", () => {
      expect(
        classifyBashCommand("sed 's/foo/bar/g' file.txt").classification,
      ).toBe("no-nudge");
    });

    it("does not nudge tree", () => {
      expect(classifyBashCommand("tree src/").classification).toBe("no-nudge");
    });

    it("does not nudge git commands", () => {
      expect(classifyBashCommand("git status").classification).toBe("no-nudge");
      expect(classifyBashCommand("git diff").classification).toBe("no-nudge");
    });

    it("does not nudge pnpm/npm/yarn commands", () => {
      expect(classifyBashCommand("pnpm test").classification).toBe("no-nudge");
      expect(classifyBashCommand("npm install").classification).toBe(
        "no-nudge",
      );
    });

    it("does not nudge pipelines containing cat", () => {
      const result = classifyBashCommand("cat data.txt | grep pattern");
      expect(result.classification).toBe("no-nudge");
    });

    it("does not nudge here-docs", () => {
      expect(classifyBashCommand("cat > file <<'EOF'").classification).toBe(
        "no-nudge",
      );
    });

    it("does not nudge process inspection", () => {
      expect(classifyBashCommand("ps aux").classification).toBe("no-nudge");
      expect(classifyBashCommand("top -b -n 1").classification).toBe(
        "no-nudge",
      );
    });

    it("does not nudge binary probes", () => {
      expect(classifyBashCommand("file /usr/bin/node").classification).toBe(
        "no-nudge",
      );
      expect(classifyBashCommand("xxd file.bin").classification).toBe(
        "no-nudge",
      );
    });

    it("does not nudge mutating commands", () => {
      expect(classifyBashCommand("rm -rf node_modules").classification).toBe(
        "no-nudge",
      );
      expect(classifyBashCommand("cp -f source dest").classification).toBe(
        "no-nudge",
      );
    });

    it("does not nudge curl/wget", () => {
      expect(
        classifyBashCommand("curl https://example.com").classification,
      ).toBe("no-nudge");
      expect(
        classifyBashCommand("wget https://example.com/file").classification,
      ).toBe("no-nudge");
    });
  });

  describe("edges", () => {
    it("returns no-nudge for empty string", () => {
      const result = classifyBashCommand("");
      expect(result.classification).toBe("no-nudge");
    });

    it("returns no-nudge for whitespace-only", () => {
      const result = classifyBashCommand("   ");
      expect(result.classification).toBe("no-nudge");
    });

    it("nudges cat with quoted path", () => {
      const result = classifyBashCommand('cat "src/my file.ts"');
      expect(result.classification).toBe("cat-file");
    });

    it("nudges cat with multiple files", () => {
      const result = classifyBashCommand("cat file1.ts file2.ts file3.ts");
      expect(result.classification).toBe("cat-file");
    });

    it("does not nudge cat with cwd flag only", () => {
      // Edge case: cat with only flags and no files
      const result = classifyBashCommand("cat -n");
      expect(result.classification).toBe("no-nudge");
    });

    it("does not nudge find with -maxdepth", () => {
      const result = classifyBashCommand("find . -maxdepth 2 -name '*.ts'");
      expect(result.classification).toBe("no-nudge");
    });
  });
});

describe("evaluateLargeRead", () => {
  it("warns when no limit and above threshold", () => {
    const result = evaluateLargeRead(600, false, 500);
    expect(result.isLarge).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it("does not warn when at or below threshold", () => {
    const result = evaluateLargeRead(400, false, 500);
    expect(result.isLarge).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("does not warn when limit was provided", () => {
    const result = evaluateLargeRead(600, true, 500);
    expect(result.isLarge).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("uses custom threshold", () => {
    const result = evaluateLargeRead(100, false, 50);
    expect(result.isLarge).toBe(true);
  });
});

describe("redactCommandSummary", () => {
  it("returns command name with arg count and length", () => {
    const result = redactCommandSummary("cat src/index.ts");
    expect(result).toBe("cat (1 args, 16 chars)");
  });

  it("handles single word command", () => {
    const result = redactCommandSummary("ls");
    expect(result).toBe("ls (0 args, 2 chars)");
  });

  it("handles command with flags", () => {
    const result = redactCommandSummary("grep -r foo src/");
    expect(result).toBe("grep (3 args, 16 chars)");
  });
});
