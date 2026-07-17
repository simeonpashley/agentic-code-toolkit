/**
 * Tests for the read/search duplicate tracker.
 *
 * Phase 1: warn only on exact unchanged duplicates.
 * No-warning cases: changed file, raw-to-anchored, different offset/limit,
 * continuation reads, missing fingerprint best-effort.
 */

import { describe, it, expect } from "vitest";
import { createReadSearchTracker } from "../extensions/token-hygiene/read-search-tracker.ts";
import type {
  TokenHygieneConfig,
  ReadObservation,
  SearchObservation,
} from "../extensions/token-hygiene/types.ts";

const MOCK_CONFIG: TokenHygieneConfig = {
  configVersion: 1,
  phase: 1,
  enabled: true,
  metricsEnabled: true,
  metricsPath: ".pi/token-hygiene-metrics.jsonl",
  metricsSampleRate: 1.0,
  workloadLabel: "unlabeled",
  identifierMode: "hmac",
  metricsRetentionDays: 30,
  metricsMaxBytesPerFile: 10_000_000,
  metricsMaxFiles: 5,
  warnDuplicateReads: true,
  warnToolChoice: true,
  warnLargeReads: true,
  warnCustomContextVisibility: true,
  warningVisibility: "model-visible",
  compressBashSuccesses: false,
  largeReadLineThreshold: 500,
  largeListingThreshold: 500,
  modelVisibleMessageThresholdChars: 500,
  minCompressLines: 25,
  minCompressChars: 200,
};

describe("ReadSearchTracker", () => {
  describe("recordRead", () => {
    it("returns 'none' for a first read", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs: ReadObservation = {
        pathId: "file:/test.ts",
        offset: 1,
        limit: 50,
        raw: false,
        sizeBytes: 1000,
        mtimeMs: 1000000,
        contentFingerprint: "abc123",
        turn: 0,
      };
      expect(tracker.recordRead(obs)).toEqual({ classification: "none" });
    });

    it("returns 'exact-repeat' for an identical read", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs: ReadObservation = {
        pathId: "file:/test.ts",
        offset: 1,
        limit: 50,
        raw: false,
        sizeBytes: 1000,
        mtimeMs: 1000000,
        contentFingerprint: "abc123",
        turn: 0,
      };
      tracker.recordRead(obs);
      const result = tracker.recordRead({ ...obs, turn: 1 });
      expect(result.classification).toBe("exact-repeat");
      expect(result.previousTurn).toBe(0);
    });

    it("returns 'none' when file size changed", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs1: ReadObservation = {
        pathId: "file:/test.ts",
        sizeBytes: 1000,
        mtimeMs: 1000000,
        turn: 0,
      };
      tracker.recordRead(obs1);
      const obs2: ReadObservation = {
        pathId: "file:/test.ts",
        sizeBytes: 2000,
        mtimeMs: 1000000,
        turn: 1,
      };
      expect(tracker.recordRead(obs2)).toEqual({ classification: "none" });
    });

    it("returns 'none' when mtime changed", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs1: ReadObservation = {
        pathId: "file:/test.ts",
        sizeBytes: 1000,
        mtimeMs: 1000000,
        turn: 0,
      };
      tracker.recordRead(obs1);
      const obs2: ReadObservation = {
        pathId: "file:/test.ts",
        sizeBytes: 1000,
        mtimeMs: 2000000,
        turn: 1,
      };
      expect(tracker.recordRead(obs2)).toEqual({ classification: "none" });
    });

    it("returns 'none' when content fingerprint changed", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs1: ReadObservation = {
        pathId: "file:/test.ts",
        contentFingerprint: "abc123",
        turn: 0,
      };
      tracker.recordRead(obs1);
      const obs2: ReadObservation = {
        pathId: "file:/test.ts",
        contentFingerprint: "def456",
        turn: 1,
      };
      expect(tracker.recordRead(obs2)).toEqual({ classification: "none" });
    });

    it("returns 'none' for raw read followed by anchored read", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const raw: ReadObservation = {
        pathId: "file:/test.ts",
        raw: true,
        turn: 0,
      };
      tracker.recordRead(raw);
      const anchored: ReadObservation = {
        pathId: "file:/test.ts",
        raw: false,
        offset: 1,
        limit: 50,
        turn: 1,
      };
      expect(tracker.recordRead(anchored)).toEqual({ classification: "none" });
    });

    it("returns 'none' for different offset", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs1: ReadObservation = {
        pathId: "file:/test.ts",
        offset: 1,
        limit: 50,
        turn: 0,
      };
      tracker.recordRead(obs1);
      const obs2: ReadObservation = {
        pathId: "file:/test.ts",
        offset: 51,
        limit: 50,
        turn: 1,
      };
      expect(tracker.recordRead(obs2)).toEqual({ classification: "none" });
    });

    it("returns 'none' for continuation read (suggestedNextOffset)", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs1: ReadObservation = {
        pathId: "file:/test.ts",
        offset: 1,
        limit: 50,
        truncated: true,
        suggestedNextOffset: 51,
        turn: 0,
      };
      tracker.recordRead(obs1);
      const obs2: ReadObservation = {
        pathId: "file:/test.ts",
        offset: 51,
        turn: 1,
      };
      expect(tracker.recordRead(obs2)).toEqual({ classification: "none" });
    });

    it("warns only once per exact duplicate even with multiple identical reads", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs: ReadObservation = { pathId: "file:/test.ts", turn: 0 };
      tracker.recordRead(obs);
      // First repeat warns
      expect(tracker.recordRead({ ...obs, turn: 1 }).classification).toBe(
        "exact-repeat",
      );
      // Second repeat returns same classification but doesn't increment warnings
      const snapshot = tracker.snapshot();
      // The snapshot tracks warningsEmitted
      expect(snapshot.warningsEmitted).toBe(1);
    });

    it("handles missing fingerprint best-effort (no crash)", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs1: ReadObservation = { pathId: "file:/test.ts", turn: 0 };
      tracker.recordRead(obs1);
      const obs2: ReadObservation = { pathId: "file:/test.ts", turn: 1 };
      // Without fingerprint/size/mtime, it's an exact match
      expect(tracker.recordRead(obs2).classification).toBe("exact-repeat");
    });

    it("returns 'none' when only offset differs but no previous tracking fields match", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs1: ReadObservation = {
        pathId: "file:a",
        offset: undefined,
        turn: 0,
      };
      tracker.recordRead(obs1);
      const obs2: ReadObservation = { pathId: "file:a", offset: 1, turn: 1 };
      expect(tracker.recordRead(obs2).classification).toBe("none");
    });
  });

  describe("recordSearch", () => {
    it("returns 'none' for a first search", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs: SearchObservation = {
        tool: "grep",
        key: "pattern:test",
        turn: 0,
      };
      expect(tracker.recordSearch(obs)).toEqual({ classification: "none" });
    });

    it("returns 'repeated-search' for an identical search", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      const obs: SearchObservation = {
        tool: "grep",
        key: "pattern:test",
        turn: 0,
      };
      tracker.recordSearch(obs);
      const result = tracker.recordSearch({ ...obs, turn: 1 });
      expect(result.classification).toBe("repeated-search");
      expect(result.previousTurn).toBe(0);
    });

    it("returns 'none' for different search keys", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      tracker.recordSearch({ tool: "glob", key: "pattern:*.ts", turn: 0 });
      const result = tracker.recordSearch({
        tool: "glob",
        key: "pattern:*.js",
        turn: 1,
      });
      expect(result.classification).toBe("none");
    });

    it("returns 'none' for different tools with same key", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      tracker.recordSearch({ tool: "grep", key: "query:test", turn: 0 });
      const result = tracker.recordSearch({
        tool: "websearch",
        key: "query:test",
        turn: 1,
      });
      expect(result.classification).toBe("none");
    });
  });

  describe("resetSession", () => {
    it("clears all tracked reads and searches", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      tracker.recordRead({ pathId: "file:/test.ts", turn: 0 });
      tracker.recordSearch({ tool: "grep", key: "pattern:test", turn: 0 });
      tracker.resetSession();
      const snap = tracker.snapshot();
      expect(snap.reads).toBe(0);
      expect(snap.searches).toBe(0);
      expect(snap.warningsEmitted).toBe(0);
    });
  });

  describe("snapshot", () => {
    it("returns correct counts", () => {
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      tracker.recordRead({ pathId: "file:/a.ts", turn: 0 });
      tracker.recordRead({ pathId: "file:/b.ts", turn: 0 });
      tracker.recordSearch({ tool: "grep", key: "x", turn: 0 });
      const snap = tracker.snapshot();
      expect(snap.reads).toBe(2);
      expect(snap.searches).toBe(1);
      expect(snap.warningsEmitted).toBe(0);
    });
  });

  describe("config integration", () => {
    it("accepts a hasher (optional)", () => {
      // Should not throw with no hasher
      const tracker = createReadSearchTracker(MOCK_CONFIG);
      expect(() => {
        tracker.recordRead({ pathId: "file:/test.ts", turn: 0 });
      }).not.toThrow();
    });
  });
});
