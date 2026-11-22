# New Human School

In YHWH, open the command palette and choose **New Human School** for the
bundled lesson or **New Human School · Practice this folder** for Markdown in
the current directory. On mobile, the palette is under **Menu → Commands**.
Obsidian uses the current folder in the YHWH navigator. The quiz takes over
the focus area while keeping the editor in the workspace.

The checkout's `bin/nhs` is installed as `nhs` with the YHWH package.

```sh
bin/nhs -i --track west --grade k --learn 8 --limit 5
bin/nhs --el --track east --grade 1 --learn 20 --shuffle > lesson.jsonl
cat 'my letter.md' | bin/nhs -i
bin/nhs -i deck/ 'one more card.md'
```

Use `--ordered` to practice in curriculum order and enter `:q` to finish
early. With piped cards, answers come from the controlling terminal. The
terminal skips illustration-only material. `--el` includes those illustrations
and writes one versioned JSON record per card for other tools. Pass `-` to
include stdin alongside paths. With no paths, NHS uses piped Markdown when
present and otherwise opens the bundled curriculum.

## Edit a lesson

Put each fact in a Markdown file with the following frontmatter. Use simple
key/value lines and a one-line alias list or semicolon-delimited aliases. The
body and an optional `mnemonic` are shown after answering. An optional `hint`
can appear beforehand. `image` accepts an embedded base64 SVG, PNG, JPEG or
WebP data URL. When adding a card, give it a unique ID.

```markdown
---
schema: "nhs.card/v1"
id: "my-deck.ear"
track: "east"
grade: 0
order: 1
kind: "primitive"
glyph: "耳"
prompt: "What does this component stand for?"
answer: "ear"
aliases: ["an ear"]
---

# Ear

Look for this shape in larger characters.
```

For compact lessons use `schema: nhs.deck/v1` and a Markdown table with
**Order**, **Glyph**, and **Answer** columns plus optional fields in their own
columns. See the [bundled curriculum](../yhwh/etc/nhs/curriculum/). Grade 0
is kindergarten. In the RTK table, `grade: rtk` assigns cards to 100-frame
blocks using the Order column. The CLI and folder view ignore ordinary
Markdown notes without an NHS schema.

## Curriculum provenance

- The RTK table contains the 3,000 revised-edition frame numbers, characters,
  and English keywords from the pinned [sdcr CSV](https://github.com/sdcr/heisig-kanjis/blob/e93cab40c55f193c975f91d4728bcc1d7e35556d/heisig-kanjis.csv).
- The kindergarten East deck uses all 441 entries in the audited primitive
  catalogue. The atlas contains the full drawings, variant forms, source
  evidence, and RTH checks. The quiz uses the illustration-only drawings it
  needs from that atlas and adds original teaching notes to the factual mappings.
  The upstream CC0 statement covers cyphar’s contributions to the drawings.
  [Catalogue](../var/log/new-human-school/heisig-primitives.json) ·
  [Atlas](../var/log/new-human-school/heisig-primitives-atlas.html) ·
  [CC0 statement](https://github.com/cyphar/heisig-rtk-index#license)
- The West deck uses the [22-letter Unicode range](https://www.unicode.org/charts/PDF/U10900.pdf)
  and an authored set of first words and grammar exercises. The Genesis
  completion cards show the source verse in their exported metadata.
