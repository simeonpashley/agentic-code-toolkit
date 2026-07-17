Read UTF-8 text file or supported image. Produces LINE#xHASH anchors for `edit`/`insert`.

Params:

- path: file path
- offset (optional): start line (1-indexed)
- limit (optional): max lines to return
- raw (optional): true = plain text (no anchors). Never use `raw: true` before `edit`/`insert` — anchors required.

Default cap: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}.
Truncated output includes suggested next offset.
On truncation: continue at suggested offset. Never guess unseen lines.
