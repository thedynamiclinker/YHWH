# Accepted review rounds

Accepted rounds will be added here with the finished Teams message, GitLab
MR text, local commit IDs and validation notes. Drafts live in the review plan;
comments stay in the review state rather than being copied into this document.

<!-- accepted:R01 -->
## R01: Remove exact dependency pins and Python constraints

### TEAMS

Here's the small first step for the version upgrade: remove the exact dependency pins and Python constraints in both model repos. That lets us try other environments and compare the results.

### GitLab MR

#### es-as

**Title:** Remove exact dependency pins and Python constraints

Remove exact dependency pins and the package-level Python constraint. Package names and model code stay the same; this permits testing other environments but does not establish runtime support or prediction equivalence.

Commit: `64c8b1690bde47e1a4cff883610489eb9c43bcb0`. Review base: `ff18cd87895294ca59f2cb85fd52a9f99aa50d13`. Target branch: `main` after preceding rounds merge.

#### es-hf

**Title:** Remove exact dependency pins and Python constraints

Remove exact dependency pins and the package-level Python constraint. Package names and model code stay the same; this permits testing other environments but does not establish runtime support or prediction equivalence.

Commit: `cb5b7008bb8dbbae98149df43fe2998525873e99`. Review base: `f1c251e635ece3f7163d0dc7833b77e9e82073ca`. Target branch: `main` after preceding rounds merge.

### Validation

Inspected both patches: only exact dependency specifiers and Python constraint lines change. Package metadata parses; model source, runtime selection, CI and README are untouched. Other Python/runtime combinations still need comparison runs.

<!-- accepted:R02 -->
## R02: Remove remaining build and development version pins

### TEAMS

Same idea for the build and development dependencies: let the installer resolve them too. This keeps the version settings from disagreeing across the different requirements files.

### GitLab MR

#### es-as

**Title:** Remove remaining build and development version pins

Remove the remaining version restrictions in build and development dependencies, including the existing JavaScript development tools. Keep model behavior separate from dependency metadata.

Commit: `d8574e853d4f80cba10ea529ab2fe4e5bacb5a81`. Review base: `64c8b1690bde47e1a4cff883610489eb9c43bcb0`. Target branch: `main` after preceding rounds merge.

#### es-hf

**Title:** Remove remaining build and development version pins

Remove the remaining version restrictions in build and development dependencies, including the existing JavaScript development tools. Keep model behavior separate from dependency metadata.

Commit: `623c99e89f9235959c9d76a51d449d838b10ed25`. Review base: `cb5b7008bb8dbbae98149df43fe2998525873e99`. Target branch: `main` after preceding rounds merge.

### Validation

Changed Python files compile, package TOML parses, and patch whitespace checks pass. The completed sequence was built as wheels and passed the focused model/CLI checks described in the local validation report; these results do not certify all intermediate dependency combinations.

