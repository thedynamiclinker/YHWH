# Redact

`bin/redact` and `bin/redact2` merge source prose into a single text in the
style of a Diatessaron or the Torah. R (`--rip`, the default) models the final
redactor combining JE and P. It uses addition level 4 and deletion level 2 and
preserves doublets. RJE (`--rje`) models the redactor combining J and E. It uses
addition level 2 and deletion level 4 and collapses more redundant passages.
Both favor original wording and retain distinct source details. Addition is
limited to brief glue such as transitions and grammatical repairs, even at the
highest setting.
Deletion targets redundancy within and across sources. `-a` or `--add` and
`-d` or `--del` override the profile independently on scales from 1 (least)
to 9 (most).

The checkout's `bin/` entry points resolve to the executable scripts in
`bin2/`.

`-s` or `--src` sets the smallest chunk that can be moved or interleaved.

- `file` keeps each named input and stdin together, with all retained text in
  its original order. The input chunks can be reordered as a whole.
- `paragraph` allows whole paragraphs to be moved or interleaved while
  preserving the order of retained text inside each paragraph. Only two
  consecutive Unix newline characters (`\n\n`) mark a paragraph boundary.
- `sentence` allows whole sentences to be moved or interleaved while
  preserving the order of retained words inside each sentence.
- `word` (the default) allows word-level joins and moves, including
  mid-sentence.

Both modes favor the original order of chunks. Glue and redundancy cuts follow
`--add` and `--del` within the selected chunk size's ordering constraints.

File operands are read in order. Piped or redirected stdin comes first unless
a `-` operand places it elsewhere. Both commands treat source text as data and
write only the merged prose to stdout by default.
`--in-place` (also `-i` or `--inplace`) writes the merge to the first named
file after all sources have been read and the merge succeeds.
The Bash wrapper keeps the original file if the runner fails, returns no
text, or the destination changes while redaction is running.

`redact` parses the invocation in Bash before handing resolved settings and
source text to `lordhavemercy`. It forwards `-f` or `--force` to the runner.
`redact2` delegates parsing, redaction, and any file replacement to one
expandable heredoc. Its original arguments, including any force flag, are data
inside the heredoc.
