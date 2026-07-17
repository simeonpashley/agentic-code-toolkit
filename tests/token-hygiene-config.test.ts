/**
 * Token-hygiene config tests — env precedence, sentinel detection,
 * validation fail-closed, typo detection, phase defaults.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md (#Configuration)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CONFIG,
  loadTokenHygieneConfig,
  isGitIgnored,
  checkSentinel,
} from "../extensions/token-hygiene/config.ts";

// ── helpers ──────────────────────────────────────────────────────

let tmp: string;
let cwd: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "token-hygiene-config-"));
  cwd = tmp;
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeGitignore(content: string): void {
  writeFileSync(join(cwd, ".gitignore"), content);
}

function writeSentinel(): void {
  writeFileSync(join(cwd, ".pi-token-hygiene-off"), "");
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// ── DEFAULT_CONFIG ────────────────────────────────────────────────

describe("DEFAULT_CONFIG", () => {
  it("has configVersion 1", () => {
    expect(DEFAULT_CONFIG.configVersion).toBe(1);
  });

  it("has phase 1", () => {
    expect(DEFAULT_CONFIG.phase).toBe(1);
  });

  it("is enabled", () => {
    expect(DEFAULT_CONFIG.enabled).toBe(true);
  });

  it("has metricsEnabled true", () => {
    expect(DEFAULT_CONFIG.metricsEnabled).toBe(true);
  });

  it("has compressBashSuccesses false", () => {
    expect(DEFAULT_CONFIG.compressBashSuccesses).toBe(false);
  });

  it("has identifierMode hmac", () => {
    expect(DEFAULT_CONFIG.identifierMode).toBe("hmac");
  });

  it("has warningVisibility model-visible", () => {
    expect(DEFAULT_CONFIG.warningVisibility).toBe("model-visible");
  });

  it("has default metricsPath", () => {
    expect(DEFAULT_CONFIG.metricsPath).toBe(".pi/token-hygiene-metrics.jsonl");
  });

  it("has metricsSampleRate 1.0", () => {
    expect(DEFAULT_CONFIG.metricsSampleRate).toBe(1.0);
  });

  it("has metricsRetentionDays 30", () => {
    expect(DEFAULT_CONFIG.metricsRetentionDays).toBe(30);
  });

  it("has metricsMaxBytesPerFile 10_000_000", () => {
    expect(DEFAULT_CONFIG.metricsMaxBytesPerFile).toBe(10_000_000);
  });

  it("has metricsMaxFiles 5", () => {
    expect(DEFAULT_CONFIG.metricsMaxFiles).toBe(5);
  });

  it("has largeReadLineThreshold 500", () => {
    expect(DEFAULT_CONFIG.largeReadLineThreshold).toBe(500);
  });

  it("has largeListingThreshold 500", () => {
    expect(DEFAULT_CONFIG.largeListingThreshold).toBe(500);
  });

  it("has modelVisibleMessageThresholdChars 500", () => {
    expect(DEFAULT_CONFIG.modelVisibleMessageThresholdChars).toBe(500);
  });

  it("has minCompressLines 25", () => {
    expect(DEFAULT_CONFIG.minCompressLines).toBe(25);
  });

  it("has minCompressChars 200", () => {
    expect(DEFAULT_CONFIG.minCompressChars).toBe(200);
  });

  it("has workloadLabel unlabeled", () => {
    expect(DEFAULT_CONFIG.workloadLabel).toBe("unlabeled");
  });
});

// ── loadTokenHygieneConfig — defaults ──────────────────────

describe("loadTokenHygieneConfig — defaults", () => {
  it("default config has warnings enabled and compressBashSuccesses false", () => {
    const { config } = loadTokenHygieneConfig({ cwd });
    expect(config.warnDuplicateReads).toBe(true);
    expect(config.warnToolChoice).toBe(true);
    expect(config.warnLargeReads).toBe(true);
    expect(config.warnCustomContextVisibility).toBe(true);
    expect(config.metricsEnabled).toBe(true);
    expect(config.compressBashSuccesses).toBe(false);
  });
});

// ── loadTokenHygieneConfig — env precedence ─────────────────────

describe("loadTokenHygieneConfig — env precedence", () => {
  it("PI_TOKEN_HYGIENE=0 disables the extension completely", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE: "0" },
      cwd,
    });
    expect(config.enabled).toBe(false);
  });

  it("PI_TOKEN_HYGIENE=0 disables even if METRICS=1", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE: "0", PI_TOKEN_HYGIENE_METRICS: "1" },
      cwd,
    });
    expect(config.enabled).toBe(false);
  });

  it("PI_TOKEN_HYGIENE_METRICS=0 disables metrics", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_METRICS: "0" },
      cwd,
    });
    expect(config.enabled).toBe(true);
    expect(config.metricsEnabled).toBe(false);
  });

  it("PI_TOKEN_HYGIENE_METRICS=1 enables Phase 0 metrics", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_METRICS: "1" },
      cwd,
    });
    expect(config.metricsEnabled).toBe(true);
  });

  it("PI_TOKEN_HYGIENE_WORKLOAD sets the workload label", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_WORKLOAD: "ci-build" },
      cwd,
    });
    expect(config.workloadLabel).toBe("ci-build");
  });

  it("missing PI_TOKEN_HYGIENE_WORKLOAD defaults to unlabeled", () => {
    const { config } = loadTokenHygieneConfig({ cwd });
    expect(config.workloadLabel).toBe("unlabeled");
  });
});

// ── loadTokenHygieneConfig — sentinel detection ─────────────────

describe("loadTokenHygieneConfig — sentinel detection", () => {
  it("disables extension when sentinel exists and is gitignored", () => {
    writeGitignore(".pi-token-hygiene-off\n");
    writeSentinel();
    const { config } = loadTokenHygieneConfig({ cwd });
    expect(config.enabled).toBe(false);
  });

  it("does not disable when sentinel exists but is NOT gitignored", () => {
    writeSentinel();
    const { config } = loadTokenHygieneConfig({ cwd });
    expect(config.enabled).toBe(true);
  });

  it("does not disable when gitignore lacks the sentinel entry", () => {
    writeGitignore("node_modules/\n.DS_Store\n");
    writeSentinel();
    const { config } = loadTokenHygieneConfig({ cwd });
    expect(config.enabled).toBe(true);
  });

  it("does not disable when sentinel does not exist even if gitignored", () => {
    writeGitignore(".pi-token-hygiene-off\n");
    const { config } = loadTokenHygieneConfig({ cwd });
    expect(config.enabled).toBe(true);
  });

  it("sentinel overrides PI_TOKEN_HYGIENE_METRICS=1 when both present", () => {
    writeGitignore(".pi-token-hygiene-off\n");
    writeSentinel();
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_METRICS: "1" },
      cwd,
    });
    expect(config.enabled).toBe(false);
  });
});

// ── loadTokenHygieneConfig — validation fail-closed ─────────────

describe("loadTokenHygieneConfig — validation fail-closed", () => {
  it("invalid identifierMode defaults to hmac", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_IDENTIFIER_MODE: "plaintext" },
      cwd,
    });
    expect(config.identifierMode).toBe("hmac");
  });

  it("compressBashSuccesses stays false for invalid env value", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_COMPRESS_BASH: "maybe" },
      phase: 2,
      cwd,
    });
    expect(config.compressBashSuccesses).toBe(false);
  });

  it("negative metricsRetentionDays clamps to 0", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_METRICS_RETENTION_DAYS: "-1" },
      cwd,
    });
    expect(config.metricsRetentionDays).toBe(0);
  });

  it("zero metricsMaxBytesPerFile clamps to 1", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_MAX_BYTES_PER_FILE: "0" },
      cwd,
    });
    expect(config.metricsMaxBytesPerFile).toBe(1);
  });

  it("zero metricsMaxFiles clamps to 1", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_MAX_FILES: "0" },
      cwd,
    });
    expect(config.metricsMaxFiles).toBe(1);
  });

  it("out-of-range metricsSampleRate clamps to 1.0", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_SAMPLE_RATE: "2.5" },
      cwd,
    });
    expect(config.metricsSampleRate).toBe(1.0);
  });

  it("negative largeReadLineThreshold clamps to 1", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_LARGE_READ_THRESHOLD: "-5" },
      cwd,
    });
    expect(config.largeReadLineThreshold).toBe(1);
  });

  it("non-numeric env value falls back to default", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_MAX_FILES: "abc" },
      cwd,
    });
    expect(config.metricsMaxFiles).toBe(5);
  });

  it("invalid warningVisibility defaults to model-visible", () => {
    const { config } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_WARNING_VISIBILITY: "neither" },
      cwd,
    });
    expect(config.warningVisibility).toBe("model-visible");
  });
});

// ── isGitIgnored ─────────────────────────────────────────────────

describe("isGitIgnored", () => {
  it("returns true when pattern appears in .gitignore", () => {
    writeGitignore(".pi-token-hygiene-off\nnode_modules/\n");
    expect(isGitIgnored(cwd, ".pi-token-hygiene-off")).toBe(true);
  });

  it("returns false when pattern is not in .gitignore", () => {
    writeGitignore("node_modules/\n");
    expect(isGitIgnored(cwd, ".pi-token-hygiene-off")).toBe(false);
  });

  it("returns false when .gitignore does not exist", () => {
    expect(isGitIgnored(cwd, ".pi-token-hygiene-off")).toBe(false);
  });

  it("matches against exact gitignore line (trimmed)", () => {
    writeGitignore("  .pi-token-hygiene-off  \n");
    expect(isGitIgnored(cwd, ".pi-token-hygiene-off")).toBe(true);
  });
});

// ── checkSentinel ────────────────────────────────────────────────

describe("checkSentinel", () => {
  it("returns true when sentinel exists and is gitignored", () => {
    writeGitignore(".pi-token-hygiene-off\n");
    writeSentinel();
    expect(checkSentinel(cwd)).toBe(true);
  });

  it("returns false when sentinel exists but is NOT gitignored", () => {
    writeSentinel();
    expect(checkSentinel(cwd)).toBe(false);
  });

  it("returns false when sentinel does not exist", () => {
    expect(checkSentinel(cwd)).toBe(false);
  });
});

// ── diagnostic messages ─────────────────────────────────────────

describe("loadTokenHygieneConfig — diagnostics", () => {
  it("returns diagnostic when PI_TOKEN_HYGIENE=0 disables", () => {
    const { diagnostics } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE: "0" },
      cwd,
    });
    expect(diagnostics).toBeDefined();
    expect(diagnostics!.length).toBeGreaterThanOrEqual(1);
    const diag = diagnostics![0]!;
    expect(diag.level).toBe("info");
    expect(diag.message).toMatch(/PI_TOKEN_HYGIENE=0/i);
  });

  it("returns diagnostic when sentinel disables", () => {
    writeGitignore(".pi-token-hygiene-off\n");
    writeSentinel();
    const { diagnostics } = loadTokenHygieneConfig({ cwd });
    expect(diagnostics).toBeDefined();
    expect(diagnostics!.length).toBeGreaterThanOrEqual(1);
    const diag = diagnostics![0]!;
    expect(diag.level).toBe("info");
  });

  it("disable diagnostic mentions deletion command", () => {
    const { diagnostics } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE: "0" },
      cwd,
    });
    const allMessages = diagnostics!.map((d) => d.message).join(" ");
    expect(allMessages).toMatch(/delete-local-metrics/i);
  });

  it("returns validation diagnostics for invalid config", () => {
    const { diagnostics } = loadTokenHygieneConfig({
      env: { PI_TOKEN_HYGIENE_IDENTIFIER_MODE: "plaintext" },
      cwd,
    });
    const allMessages = diagnostics!.map((d) => d.message).join(" ");
    expect(allMessages).toMatch(/identifierMode/i);
  });
});

// ── gitignore entries ────────────────────────────────────────────

describe(".gitignore entries", () => {
  it("contains .pi-token-hygiene-off", () => {
    const content = readFileSync(join(repoRoot, ".gitignore"), "utf-8");
    expect(content).toContain(".pi-token-hygiene-off");
  });

  it("contains .pi/token-hygiene-metrics*.jsonl*", () => {
    const content = readFileSync(join(repoRoot, ".gitignore"), "utf-8");
    expect(content).toMatch(/\.pi\/token-hygiene-metrics\*\.jsonl\*/);
  });

  it("contains .pi/token-hygiene-retained/", () => {
    const content = readFileSync(join(repoRoot, ".gitignore"), "utf-8");
    expect(content).toContain(".pi/token-hygiene-retained/");
  });
});
