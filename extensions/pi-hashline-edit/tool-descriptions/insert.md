Add text after a hashline anchor without removing anything.

You must read the file first. This tool will error without a prior read.

Use for ALL additive changes: imports, directives, YAML keys, list items,
code blocks, functions, fields, CSS rules, comments, or any change that
preserves existing content. The anchor line is always preserved.

Params:

- path: file path
- insert_line: LINE#xHASH│content anchor copied verbatim from read output,
  or "0" for beginning of file. The format is: line number + #x + HASH + │ +
  content. Copy the anchor verbatim including the full prefix.
- insert_text: raw content to add, without LINE#xHASH prefixes

Use `str_replace` only to replace or delete an existing hashline read block.

Example:
{"path":"src/main.ts","insert_line":"4#xA25│@source '../pages';","insert_text":"@source inline('md:flex lg:flex-row');"}
