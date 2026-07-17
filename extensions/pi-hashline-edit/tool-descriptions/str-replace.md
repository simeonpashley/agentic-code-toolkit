Performs exact replacement of one contiguous hashline-read block in a text file.

You must read the file first. This tool will error without a prior read.

old_str: one or more contiguous LINE#xHASH│content lines copied verbatim from the
latest read output. The format is: line number + #x + HASH + │ + actual content.
Copy everything after │ — preserve exact indentation. Never include the
line-number prefix in new_str.

new_str: raw replacement text without hashline prefixes. Use "" to delete.

For additive changes that preserve existing content — imports, directives, list
items, declarations — use `insert` instead. It cannot lose lines.

Single-line example:
{"path":"src/main.ts","old_str":"12#x3FF│const x=1;","new_str":"const x=2;"}

Multi-line example:
{"path":"src/main.ts","old_str":"3#xA4F│export default function main() {\n4#x1B2│ const x = 1;\n5#x7E0│}","new_str":"export default function main() {\n const x = 2;\n return x;\n}"}
