/**
 * Format-on-write helper.
 *
 * Runs the project's prettier (if installed) on the content about to be written,
 * so the on-disk file matches what the caller sees in the diff. Falls back
 * silently when prettier is unavailable, unconfigured, or fails — never
 * throws, never corrupts the agent's content.
 *
 * Why: agents issuing multi-line `lines:` replacements sometimes slip on
 * leading whitespace, blank lines, or line counts. The hashline anchor check
 * still passes (the file is internally consistent), but the indentation drift
 * produces a file that fails at runtime. Running prettier at write time
 * catches the formatting slip before it lands on disk.
 *
 * Caller contract:
 *   - Returns `{ content, formatted }`. `formatted` is true iff prettier ran
 *     and changed something. `content` is what should be written.
 *   - If prettier isn't installed, can't find a config, errors out, or doesn't
 *     support the file extension, return `{ content: <original>, formatted: false }`.
 *   - Never throw. The agent's edit must succeed even if prettier is broken.
 */
export type FormatResult = {
  content: string;
  formatted: boolean;
};

export async function formatIfSupported(
  filePath: string,
  content: string,
): Promise<FormatResult> {
  try {
    // Dynamic import so prettier is optional at runtime. If the user's
    // environment doesn't have prettier installed, the import throws and
    // we fall through to the no-format path.
    const prettier = await import("prettier");
    const formatted = await prettier.format(content, {
      filepath: filePath,
    });
    // Prettier returns the input unchanged when there's no config or the
    // extension is unrecognised, so we compare strings to detect an actual
    // reformat rather than relying on a boolean (which `format` doesn't expose).
    if (formatted === content) {
      return { content, formatted: false };
    }
    return { content: formatted, formatted: true };
  } catch {
    // Prettier not installed, no config, unsupported extension, parse error,
    // or anything else — fall back to the agent's content unchanged. The
    // edit must succeed; prettier is best-effort.
    return { content, formatted: false };
  }
}
