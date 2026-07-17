import { describe, expect, it } from "vitest";
import {
  stripThinkingLabels,
  cleanThinkingContent,
} from "../extensions/token-hygiene/thinking-strip";

describe("thinking label strip", () => {
  it("strips leading <thinking> tag", () => {
    const result = stripThinkingLabels("<thinking>hello world");
    expect(result).toBe("hello world");
  });

  it("strips trailing </thinking> tag", () => {
    const result = stripThinkingLabels("hello world</thinking>");
    expect(result).toBe("hello world");
  });

  it("strips both leading and trailing tags", () => {
    const result = stripThinkingLabels("<thinking>hello world</thinking>");
    expect(result).toBe("hello world");
  });

  it("preserves tags mid-reasoning", () => {
    const text = "I considered <thinking> as a valid XML tag in my analysis";
    const result = stripThinkingLabels(text);
    expect(result).toBe(text);
  });

  it("preserves text when no tags present", () => {
    const text = "plain reasoning text";
    const result = stripThinkingLabels(text);
    expect(result).toBe(text);
  });

  it("handles whitespace around tags", () => {
    const result = stripThinkingLabels("  <thinking>  text  </thinking>  ");
    expect(result).toBe("  text  ");
  });

  it("returns empty string when tags wrap empty content", () => {
    const result = stripThinkingLabels("<thinking></thinking>");
    expect(result).toBe("");
  });

  it("is idempotent — applying twice produces same result", () => {
    const text = "<thinking>analysis here</thinking>";
    const first = stripThinkingLabels(text);
    const second = stripThinkingLabels(first);
    expect(second).toBe(first);
  });

  it("cleanThinkingContent mutates only thinking blocks", () => {
    const content = [
      { type: "text", text: "normal text" },
      { type: "thinking", thinking: "<thinking>internal reasoning</thinking>" },
      { type: "thinking", thinking: "plain reasoning" },
    ];
    const result = cleanThinkingContent(content);
    expect(result).toBeDefined();
    expect(result![0]).toEqual(content[0]); // unchanged
    expect(result![1].thinking).toBe("internal reasoning"); // stripped
    expect(result![2]).toEqual(content[2]); // unchanged (no tags)
  });

  it("cleanThinkingContent returns undefined when nothing changed", () => {
    const content = [
      { type: "text", text: "hello" },
      { type: "thinking", thinking: "plain reasoning" },
    ];
    const result = cleanThinkingContent(content);
    expect(result).toBeUndefined();
  });

  it("handles CRLF line endings within tags", () => {
    const result = stripThinkingLabels(
      "<thinking>\r\nreasoning\r\n</thinking>",
    );
    expect(result).toBe("\r\nreasoning\r\n");
  });

  it("only strips outermost tag pair, not nested", () => {
    const result = stripThinkingLabels(
      "<thinking>outer <thinking>inner</thinking> tail</thinking>",
    );
    expect(result).toBe("outer <thinking>inner</thinking> tail");
  });
});
