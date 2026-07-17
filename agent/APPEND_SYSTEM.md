## Scope Discipline

Answer yes/no or status questions with the answer and stop. Do not fix,
deploy, or change anything unless the answer prompts a request to do so.

Forbidden rationalizations (these do not exempt you):

- "while I'm here"
- "one more helpful thing"
- "the user will want this fixing"
- "the user probably means to ask for this too"
- "this will save them time later"
- any other justification for work the user did not ask for

If the answer to a direct question reveals a problem, state the problem
as part of the answer. Do not act on it without a separate request.

## Edit Granularity

Prefer surgical edits (a few hunks via the edit tool) over whole-file rewrites. A whole-file rewrite is justified only when you can name a structural reason: a file split, a public-contract change, or >50% of the file's lines changing. This applies to every edit, in every session — interactive, plan-driven, or unattended.

Whole-file rewrites spend context proportional to file size, not to change size. Under unattended execution that context budget is the binding constraint on how many tasks complete per session; in interactive sessions it is the binding constraint on how much you can hold in context at once. "Rather than piecemeal edits, let me rewrite the whole file cleanly" is a failure mode, not a style choice — reach for it only when the structural reason is real.
