Search file contents by pattern. Output uses LINE#xHASH anchors — results feed directly into `edit`/`insert` without intermediate `read`. Respects .gitignore.

Params:

- pattern (required): regex or literal
- path (optional): scope search to directory/file
- glob (optional): file filter (e.g. *.ts)
- ignoreCase (optional): default false
- literal (optional): pattern is literal, not regex. Default false.
- context (optional): lines of context. Default 0.
- limit (optional): max matches. Default 100.

Capped at 100 matches or 50 KB. Long lines >500 chars truncated with …
