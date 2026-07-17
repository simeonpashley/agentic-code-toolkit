import { describe, it, expect } from "vitest";
import {
  renderCacheUsage,
  renderContextUsage,
  renderModelInfo,
} from "../extensions/custom-footer/renderers";

const plainTheme = {
  fg: (_role: unknown, text: string) => text,
  bold: (text: string) => text,
  inverse: (text: string) => text,
};

const taggedTheme = {
  fg: (role: string, text: string) => `[${role}]${text}[/${role}]`,
  bold: (text: string) => text,
  inverse: (text: string) => text,
};

describe("renderCacheUsage", () => {
  it("returns empty string when both are zero", () => {
    expect(renderCacheUsage(0, 0, plainTheme)).toBe("");
  });

  it("renders compact cache percentage only", () => {
    expect(renderCacheUsage(10_000, 6_000, plainTheme)).toBe("🎯 38%");
  });

  it("shows 100% when all tokens are from cache", () => {
    expect(renderCacheUsage(0, 10_000, plainTheme)).toBe("🎯 100%");
  });

  it("shows 50% when input equals cacheRead", () => {
    expect(renderCacheUsage(10_000, 10_000, plainTheme)).toBe("🎯 50%");
  });

  it("shows 23% when cacheRead is small relative to input", () => {
    expect(renderCacheUsage(10_000, 3_000, plainTheme)).toBe("🎯 23%");
  });

  it("color-codes high hit rate (≥60%) as success", () => {
    expect(renderCacheUsage(10_000, 20_000, taggedTheme)).toContain(
      "[success]",
    );
  });

  it("color-codes medium hit rate (30-59%) as warning", () => {
    expect(renderCacheUsage(10_000, 5_000, taggedTheme)).toContain("[warning]");
  });

  it("color-codes low hit rate (<30%) as error", () => {
    expect(renderCacheUsage(10_000, 1_000, taggedTheme)).toContain("[error]");
  });
});

describe("renderContextUsage", () => {
  it.each([
    [95, "error", "🌑 95%/200k"],
    [85, "warning", "🌘 85%/200k"],
    [65, "warning", "🌗 65%/200k"],
    [45, "warning", "🌖 45%/200k"],
    [40, "success", "🌕 40%/200k"],
  ])("renders compact moon phase for %s%% context", (pct, role, text) => {
    expect(renderContextUsage(pct, 200_000, taggedTheme)).toBe(
      `[${role}]${text}[/${role}]`,
    );
  });
});

describe("renderModelInfo", () => {
  it("renders known providers with shortnames", () => {
    const out = renderModelInfo("claude", "openai-codex", "off", plainTheme);

    expect(out.text).toBe("CODEX/claude");
    expect(out.rawWidth).toBe("CODEX/claude".length);
  });

  it("renders provider/model without the robot prefix", () => {
    const out = renderModelInfo("claude", "anthropic", "off", plainTheme);

    expect(out.text).toBe("anthropic/claude");
    expect(out.rawWidth).toBe("anthropic/claude".length);
  });

  it("renders thinking compactly in parentheses", () => {
    const out = renderModelInfo("claude", "anthropic", "high", taggedTheme);

    expect(out.text).toBe(
      "[accent]anthropic/claude[/accent][thinkingHigh](high)[/thinkingHigh]",
    );
    expect(out.rawWidth).toBe("anthropic/claude(high)".length);
  });
});
