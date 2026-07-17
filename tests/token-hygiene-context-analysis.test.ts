import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  formatBucketName,
  analyseContextBuckets,
  ContextBucketKind,
  ContextVisibility,
  type ContextBucketAnalysis,
} from "../extensions/lib/context-analysis";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 0 for null or undefined", () => {
    expect(estimateTokens(null as unknown as string)).toBe(0);
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });

  it("estimates ~1 token per 4 characters", () => {
    // 40 chars / 4 = 10
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  it("rounds up with Math.ceil", () => {
    // 41 chars / 4 = 10.25 → 11
    expect(estimateTokens("a".repeat(41))).toBe(11);
  });

  it("returns at least 1 for non-empty short text", () => {
    // 1 char / 4 = 0.25 → 1
    expect(estimateTokens("x")).toBe(1);
  });
});

describe("formatBucketName", () => {
  const cases: [ContextBucketKind, string][] = [
    ["system", "System prompt"],
    ["toolSchemas", "Tool schemas"],
    ["user", "User messages"],
    ["assistant", "Assistant responses"],
    ["thinking", "Assistant thinking"],
    ["toolCalls", "Tool calls"],
    ["toolResults", "Tool results"],
    ["bash", "User bash"],
    ["summaries", "Summaries"],
    ["custom", "Custom context"],
    ["images", "Images"],
    ["providerDelta", "Provider / serialization delta"],
  ];

  for (const [kind, expected] of cases) {
    it(`returns "${expected}" for kind "${kind}"`, () => {
      expect(formatBucketName(kind)).toBe(expected);
    });
  }
});

describe("analyseContextBuckets", () => {
  it("returns empty analysis for no segments", () => {
    const result = analyseContextBuckets([]);
    expect(result.buckets).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
    expect(result.totalSegments).toBe(0);
    expect(result.providerDeltaTokens).toBe(0);
  });

  it("groups a single segment into its bucket", () => {
    const segments = [
      { category: "user" as const, tokens: 100, chars: 400, excluded: false },
    ];
    const result = analyseContextBuckets(segments);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]!.kind).toBe("user");
    expect(result.buckets[0]!.tokens).toBe(100);
    expect(result.buckets[0]!.segments).toBe(1);
    expect(result.totalTokens).toBe(100);
    expect(result.totalSegments).toBe(1);
  });

  it("aggregates multiple segments in the same category", () => {
    const segments = [
      {
        category: "toolResults" as const,
        tokens: 500,
        chars: 2000,
        excluded: false,
      },
      {
        category: "toolResults" as const,
        tokens: 300,
        chars: 1200,
        excluded: false,
      },
      {
        category: "toolResults" as const,
        tokens: 200,
        chars: 800,
        excluded: false,
      },
    ];
    const result = analyseContextBuckets(segments);
    const toolBucket = result.buckets.find((b) => b.kind === "toolResults")!;
    expect(toolBucket).toBeDefined();
    expect(toolBucket.tokens).toBe(1000);
    expect(toolBucket.segments).toBe(3);
    expect(result.totalTokens).toBe(1000);
    expect(result.totalSegments).toBe(3);
  });

  it("produces separate buckets for different categories", () => {
    const segments = [
      {
        category: "system" as const,
        tokens: 400,
        chars: 1600,
        excluded: false,
      },
      { category: "user" as const, tokens: 200, chars: 800, excluded: false },
      {
        category: "assistant" as const,
        tokens: 600,
        chars: 2400,
        excluded: false,
      },
      {
        category: "toolResults" as const,
        tokens: 800,
        chars: 3200,
        excluded: false,
      },
    ];
    const result = analyseContextBuckets(segments);
    expect(result.buckets).toHaveLength(4);
    expect(result.totalTokens).toBe(2000);
    expect(result.totalSegments).toBe(4);
  });

  it("sorts buckets descending by tokens", () => {
    const segments = [
      { category: "system" as const, tokens: 100, chars: 400, excluded: false },
      { category: "user" as const, tokens: 500, chars: 2000, excluded: false },
      {
        category: "assistant" as const,
        tokens: 300,
        chars: 1200,
        excluded: false,
      },
    ];
    const result = analyseContextBuckets(segments);
    expect(result.buckets[0]!.kind).toBe("user");
    expect(result.buckets[1]!.kind).toBe("assistant");
    expect(result.buckets[2]!.kind).toBe("system");
  });

  it("assigns excluded visibility to excluded segments", () => {
    const segments = [
      { category: "bash" as const, tokens: 50, chars: 200, excluded: true },
    ];
    const result = analyseContextBuckets(segments);
    const bashBucket = result.buckets.find((b) => b.kind === "bash")!;
    expect(bashBucket).toBeDefined();
    expect(bashBucket.visibility).toBe("excluded");
  });

  it("assigns visible visibility to non-excluded segments", () => {
    const segments = [
      { category: "user" as const, tokens: 100, chars: 400, excluded: false },
    ];
    const result = analyseContextBuckets(segments);
    expect(result.buckets[0]!.visibility).toBe("visible");
  });

  it("includes provider delta bucket when authoritative tokens exceed visible total", () => {
    const segments = [
      { category: "user" as const, tokens: 1000, chars: 4000, excluded: false },
    ];
    // authoritativeTokens > visibleRawTokens → delta
    const result = analyseContextBuckets(segments, 1200);
    const deltaBucket = result.buckets.find((b) => b.kind === "providerDelta")!;
    expect(deltaBucket).toBeDefined();
    expect(deltaBucket.tokens).toBe(200);
    expect(deltaBucket.visibility).toBe("delta");
  });

  it("calculates percentages relative to display total", () => {
    const segments = [
      {
        category: "system" as const,
        tokens: 400,
        chars: 1600,
        excluded: false,
      },
      { category: "user" as const, tokens: 600, chars: 2400, excluded: false },
    ];
    const result = analyseContextBuckets(segments);
    expect(result.totalTokens).toBe(1000);
    const sysBucket = result.buckets.find((b) => b.kind === "system")!;
    const userBucket = result.buckets.find((b) => b.kind === "user")!;
    expect(sysBucket.percent).toBeCloseTo(40, 1);
    expect(userBucket.percent).toBeCloseTo(60, 1);
  });

  it("handles all-zero segments gracefully", () => {
    const segments = [
      { category: "user" as const, tokens: 0, chars: 0, excluded: false },
      { category: "system" as const, tokens: 0, chars: 0, excluded: false },
    ];
    const result = analyseContextBuckets(segments);
    expect(result.totalTokens).toBe(0);
    // Zero-token buckets still appear (they have the data)
    expect(result.buckets).toHaveLength(2);
    for (const bucket of result.buckets) {
      expect(bucket.tokens).toBe(0);
    }
  });

  it("includes formatBucketName labels in each bucket", () => {
    const segments = [
      {
        category: "toolSchemas" as const,
        tokens: 300,
        chars: 1200,
        excluded: false,
      },
    ];
    const result = analyseContextBuckets(segments);
    expect(result.buckets[0]!.label).toBe("Tool schemas");
    expect(result.buckets[0]!.shortLabel).toBe("Tools");
    expect(result.buckets[0]!.description).toBeTruthy();
    expect(result.buckets[0]!.color).toBeTruthy();
  });

  it("filters out zero-token buckets when total is zero but uses providerDelta path", () => {
    const segments = [
      { category: "user" as const, tokens: 100, chars: 400, excluded: false },
    ];
    const result = analyseContextBuckets(segments, 50);
    // authoritativeTokens < visibleRawTokens → no providerDelta, just overage
    const deltaBucket = result.buckets.find((b) => b.kind === "providerDelta");
    expect(deltaBucket).toBeUndefined();
  });
});
