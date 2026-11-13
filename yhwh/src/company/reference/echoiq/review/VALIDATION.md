# Draft validation

Prepared locally on November 5, 2026, using Python 3.14.8. The original
checkouts remain on `mainer`; their tracked files are clean. The model repos'
`master` branches remain at their recorded `main` commits until review acceptance.
The existing `es/master` is also unchanged.

## Preservation and history

- 22 review rounds contain 41 commits: 19 AS, 21 HF and one `es` commit.
- Every changed Python file compiles at its commit. Package TOML parses at
  every model-repo commit. All patches pass `git diff --check`; all commit
  message lines are at most 72 characters.
- Every file under `esas/` and `eshf/` is identical between the completed
  `mistress` and recorded `mainer` trees. The entire `es` tree is identical.
- Deliberate differences outside the model packages: longer README CLI
  instructions move to `CLI.md`, superseded Git-URL installation prose is
  corrected, and one AS wheel test expects the package-index `es` dependency.
- [PROVENANCE.md](PROVENANCE.md) maps all 34 original commits to their new rounds.

The initial patch changes only exact dependency specifiers and Python constraint
lines. It does not change README, CI, runtime selection, package names or model
source. Build/development version ranges are handled in the next round.

## Executed checks

- Review CLI: eight disposable-repository integration tests passed. They cover
  paired acceptance, rejection/comments, edited patches and messages, invalid
  patches, external ref changes, checked-out branches, interrupted acceptance,
  duplicate-document prevention and board preservation/idempotence.
- A full rehearsal in disposable local clones accepted every round and checked
  each resulting tree against its draft. All 41 trees matched. This did not
  accept anything on the real `master` branches.
- Intermediate CLI test suites passed at rounds 09–15, 18–21. Tests are introduced
  alongside the APIs they exercise; round 20's AS wheel assertion already uses
  the current package-index dependency. Exact commands/results are recorded in
  each round's validation text and the local prefix logs.
- Both final wheels built without dependency downloads and installed together
  into `.review/test-env/site`. The four installed console entry points resolve
  to the intended legacy and streaming functions.
- AS: 60 focused tests passed, covering CLI behavior, input compatibility, real
  LiteRT inference on repository fixtures, serial/parallel equality, row limits,
  rounding, JSON stdin, legacy output tables and closed-pipe cleanup.
- HF: 82 focused tests passed across the CLI, real LiteRT inference, worker
  ordering, imputation and smooth sampling. The library-level string-number
  imputation test needs `ESHF_RUNTIME=litert` in this Python environment; its
  default legacy package is unavailable here. The initial run exposed that
  environment requirement; the affected test passed with the runtime selected.
- `es`: all six command-dispatch tests passed. `es as --help` and `es hf --help`
  also worked from `/tmp` against the installed model wheels.
- Five-row real-inference comparisons between TensorFlow Lite and LiteRT had
  identical study IDs/order and a maximum probability difference of zero for
  both models on the selected local fixtures.

Observed packages: NumPy 2.5.3, pandas 3.0.4, SciPy 1.18.1, scikit-learn 1.9.0,
TensorFlow 2.22.0rc0, ai-edge-litert 2.3.0 and pytest 9.1.1. These describe this
test environment, not new dependency constraints.

## Reproduction

The wheel builds used `python -m pip wheel --no-deps --no-build-isolation .` in
the draft worktrees. Existing local DVC assets were linked into those worktrees;
they were not downloaded or added to commits. Built wheels and test artifacts
are under `.review/test-env/` and excluded from Git.

For the installed-wheel checks, set:

```bash
task_root=/home/jason/obsidian/EchoIQ
export PATH="$task_root/.review/test-env/site/bin:$PATH"
export PYTHONPATH="$task_root/.review/test-env/site:$task_root/es/src"
```

In `.review/worktrees/es-as`:

```bash
python -m pytest -q test/test_cli.py test/test_compatibility.py test/test_inference_cli.py
```

In `.review/worktrees/es-hf`:

```bash
ESHF_RUNTIME=litert python -m pytest -q tests/test_cli.py tests/test_inference_cli.py tests/eshf/test_imputation.py tests/eshf/test_smooth_sampling.py
```

In `.review/worktrees/es`, use `PYTHONPATH=src python -m pytest -q tests/test_cli.py`.
In the workspace root, use `python -m unittest -q test_review.py`.

## Scope of the evidence

Full Neda2/Neda3 comparisons and a legacy-runtime baseline under its supported
Python environment were not run. The five-row comparisons and fixture tests
are smoke checks, not model-equivalence or regulatory acceptance criteria.
Historical exact-equality suites were preserved and not reinterpreted as passing.

The existing `mainer` HF CI change references a generic shared GitLab template;
that private template and remote CI execution have not been verified locally.
Live runtime installation and uv download/Python re-execution are covered by
boundary tests rather than performing downloads or replacing this environment.
Review edits to code require appropriate new checks before their results can be
included in accepted-round validation text.
