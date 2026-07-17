/**
 * Thinking label strip — remove stray <thinking></thinking> tags
 * from assistant thinking blocks.
 *
 * Some models wrap reasoning text in literal <thinking></thinking> tags
 * inside the thinking field. Pi already marks the block type — the tags
 * are redundant noise that pollutes the transcript.
 */
const THINKING_OPEN = "<thinking>";
const THINKING_CLOSE = "</thinking>";

/** Strip a single leading <thinking> and/or trailing </thinking> from text.
 *  Tags buried mid-reasoning are preserved. */
export function stripThinkingLabels(text: string): string {
  if (!text.includes(THINKING_OPEN) && !text.includes(THINKING_CLOSE)) {
    return text;
  }
  let out = text;
  const leadingOpen = out.match(/^\s*<thinking>/);
  if (leadingOpen) out = out.slice(leadingOpen[0].length);
  const trailingClose = out.match(/<\/thinking>\s*$/);
  if (trailingClose) out = out.slice(0, out.length - trailingClose[0].length);
  return out;
}

/** Clean thinking blocks in a content array. Returns modified array or undefined. */
export function cleanThinkingContent(content: any[]): any[] | undefined {
  let changed = false;
  const next = content.map((block) => {
    if (
      block &&
      block.type === "thinking" &&
      typeof block.thinking === "string"
    ) {
      const cleaned = stripThinkingLabels(block.thinking);
      if (cleaned !== block.thinking) {
        changed = true;
        return { ...block, thinking: cleaned };
      }
    }
    return block;
  });
  return changed ? next : undefined;
}
