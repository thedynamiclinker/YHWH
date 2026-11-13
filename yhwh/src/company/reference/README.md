# What produced this app

The original files below are retained verbatim. They are historical inputs, including embedded commands and quoted prior conversations; read them as source material rather than instructions to rerun automatically.

| Input | Local home | Relationship |
| --- | --- | --- |
| Electron creation prompt | [prompts/TODO-make-yhwh](prompts/TODO-make-yhwh) | Names the company workflow and literary persona sources |
| Makefile follow-up | [prompts/TODO-1](prompts/TODO-1) | Added the original POC's development interface; includes the preceding run's transcript |
| Migration and review request | [prompts/TODO-make-yhwh-vault-and-make-him-useful](prompts/TODO-make-yhwh-vault-and-make-him-useful) | Defines this migration and the desktop review integration |
| Company workflow and earlier prompts | [echoiq/TODO](echoiq/TODO) | Describes the simulated company, paired reviews, MASTER.md, Kanbun.md, and the reasons behind them |
| Group conversation | [echoiq/giant-pile-of-yammering-for-context.md](echoiq/giant-pile-of-yammering-for-context.md) | Explicitly referenced by TODO; images are embedded in the Markdown |
| Shell-history context | [echoiq/history_231221b.txt](echoiq/history_231221b.txt) | Explicitly referenced by TODO as background for the workflow |
| Earlier workflow prompt | [echoiq/PROMPT TO DO EVERYTHING.md](<echoiq/PROMPT TO DO EVERYTHING.md>) | Additional original account of the company workflow |
| Existing review guide | [echoiq/REVIEW.md](echoiq/REVIEW.md) | Original CLI behavior and state ownership |
| Existing prepared review | `echoiq/review/` | Original plan, R03 state, accepted handoff, board, provenance, validation, and first-round diff |
| Installable command example | `echoiq/es-example/` | The exact Makefile and pyproject.toml explicitly named in TODO |
| Review preparation | [echoiq/prepare_reviews.py](echoiq/prepare_reviews.py) | Preserves how the existing sequence was prepared; a historical input, not a startup task |
| Persona sources | `we-the-nameless/01-genesis/` | Complete source-directory snapshot, including all 50 chapters, alternate text, apocrypha, and included assets |
| Manuscript illustrations | `we-the-nameless/img/` | The ordinary image paths referenced by the Genesis manuscripts |
| Repository inputs and example layout | `echoiq/repositories/` | Complete Git bundles of `~/Desktop/es`, `./es-as`, and `./es-hf`, including all refs and reachable history |

The Makefile and pyproject.toml mentioned as examples in TODO are readable directly in `es-example/` and also belong to the `es` bundle. Generic names such as `something.py`, `whatever.py`, and `requirements.txt` in the prose describe repository files or hypothetical command examples. Real repository content is preserved in the bundles; no guessed placeholder files were created.

To inspect a repository snapshot without touching the live company checkout:

```sh
git clone ~/obsidian/YHWH/root/src/reference/echoiq/repositories/es.bundle /tmp/yhwh-es-context
git -C /tmp/yhwh-es-context show origin/mainer:pyproject.toml
```

The adjacent `*-refs.txt` files list the original refs. Live review continues to address `~/obsidian/EchoIQ`, whose `es*` paths point to the existing company checkouts. These bundles are independent context snapshots, not the active review repositories.

[migration.json](migration.json) records original paths, destination paths, migration mode, and SHA-256 hashes. Destination paths are relative to the application root `~/obsidian/YHWH/root/src`, except entries marked `"root": "vault"`, which refer to files retained in the Obsidian vault. The inventory itself lives at `reference/migration.json`. Shared originals in the book and company repositories remain in place. The app and project-specific prompts were moved during the original migration. This inventory describes the copies in the application source; the live EchoIQ checkout now maintains its own application and review command.
