/**
 * Documentation tests for token-hygiene extension README.
 *
 * Phase 0/1 operator controls documentation.
 * Standalone file-content tests — no extension code imports.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const README_PATH = join(
  import.meta.dirname,
  "..",
  "extensions",
  "token-hygiene",
  "README.md",
);

describe("token-hygiene README", () => {
  it("exists at expected path", () => {
    expect(existsSync(README_PATH)).toBe(true);
  });

  it("mentions PI_TOKEN_HYGIENE=0 to disable", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/PI_TOKEN_HYGIENE\s*=\s*0/i);
  });

  it("mentions PI_TOKEN_HYGIENE_METRICS=0 to disable metrics", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/PI_TOKEN_HYGIENE_METRICS\s*=\s*0/i);
  });

  it("mentions PI_TOKEN_HYGIENE_METRICS=1 to enable metrics", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/PI_TOKEN_HYGIENE_METRICS\s*=\s*1/i);
  });

  it("mentions the .pi-token-hygiene-off sentinel file", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/\.pi-token-hygiene-off/);
  });

  it("states all features are live by default", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/All features are live by default/);
  });

  it("states metrics are enabled by default", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/Metrics are enabled by default/);
  });

  it("mentions the metrics path", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/\.pi\/token-hygiene-metrics/);
  });

  it("mentions the analyser command", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/analyse-metrics/);
  });

  it("mentions the deletion command", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/delete-local-metrics/);
  });

  it("mentions the HMAC key location outside repo-local .pi/", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/HMAC.*key/i);
  });

  it("states compression is not yet implemented", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/Bash output compression is not yet implemented/);
  });

  it("includes the exact backup caveat sentence", () => {
    const content = readFileSync(README_PATH, "utf-8");
    const expected =
      "Deleting local token-hygiene data removes repo-local metrics and retained-output files, but copies may remain in Time Machine, rsync targets, VM snapshots, or other filesystem backups until those backup systems expire them.";
    expect(content).toContain(expected);
  });

  it("includes the exact disable-does-not-delete sentence", () => {
    const content = readFileSync(README_PATH, "utf-8");
    // README has backtick-formatted command
    expect(content).toMatch(
      /Disabling token hygiene or metrics does not delete existing metrics/,
    );
  });

  // === Edge-case / negative tests ===

  it("does NOT claim Phase 2 is active", () => {
    const content = readFileSync(README_PATH, "utf-8");
    // Should not say Phase 2 is active/available without caveat
    expect(content).not.toMatch(/Phase\s*2\s+is\s+(active|available|enabled)/i);
  });

  it("mentions PI_TOKEN_HYGIENE_WORKLOAD", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/PI_TOKEN_HYGIENE_WORKLOAD/i);
  });

  it("mentions the /token-hygiene slash command", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/\/token-hygiene/);
  });

  it("mentions HMAC key is outside repo-local .pi/", () => {
    const content = readFileSync(README_PATH, "utf-8");
    expect(content).toMatch(/outside.*\.pi/i);
  });
});
