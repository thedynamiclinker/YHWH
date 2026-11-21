# Redact

`bin/redact` and `bin/redact2` merge source prose into a single text. R
(`--rip`, the default) uses addition level 4 and deletion level 2 and preserves
doublets. RJE (`--rje`) uses addition level 2 and deletion level 4 and collapses
more redundant passages. Both favor original wording, retain distinct source
details, and add only brief glue. Explicit `--add` and `--del` levels from 1
through 9 override the profiles independently.

`--src` sets the smallest unit for switching sources or rearranging passages.
The choices are `file`, `paragraph`, `sentence`, and `word` (the default).
Both modes favor the order within each source.

File operands are read in order. Piped or redirected stdin comes first unless
a `-` operand places it elsewhere. The merge goes to stdout by default.
`--in-place` (also `-i` or `--inplace`) writes the merge to the first named
file after all sources have been read and the merge succeeds.

`redact` parses the invocation in Bash before handing resolved settings and
source text to `lordhavemercy`. It forwards `-f` or `--force` to the runner.
`redact2` delegates parsing, redaction, and any file replacement to one
expandable heredoc. Its original arguments, including any force flag, are data
inside the heredoc.
