# New Human School

New Human School (NHS), informally “Super Advanced Kindergarten,” is an offline
quiz in the YHWH focus area. It opens from the command palette in the desktop,
Three, and mobile apps and in the YHWH Obsidian plugin. **Practice this folder**
reads NHS Markdown recursively from the current directory. **Reload cards**
rereads that directory. Returning to the workspace preserves the open document.

The terminal command and graphical view use the same facts and answer
checker. A lesson selects a track and grade, takes the first N eligible facts
in curriculum order, then samples within that range. The graphical view
supports typing, revealing and self-assessing, and practicing missed cards.
Practice is local to the session. Cards can explain a mnemonic or show a
construction after the answer.

`nhs` accepts ordinary Markdown from stdin, files, or directories. `nhs -i`
reads answers from the controlling terminal when the cards are piped in.
`nhs --el` emits one versioned JSON record per card for other tools. Markdown
is the editable source for both views.

## Curriculum

- The East introduces semantic writing through Heisig primitives and
  traditional radicals. The foundation covers all 214 traditional radical
  families and the additional primitive shapes and mnemonic roles documented in
  RTK1 and RTK3. Retain edition and source evidence, mark approximate revised
  RTK placements as approximate, and use RTH1/RTH2 as a cross-check. Later
  grades follow the revised RTK order in groups of 100.
  Preserve numbered keywords, mnemonic images, and conventional radical labels
  as distinct teaching roles. Introduce a new association when a piece needs
  one, and show the construction when known pieces combine. For example, teach
  根 (“root”) through 木 (“tree”) and 艮 (the mnemonic “silver”). An unverified
  decomposition stays unknown. Show a drawing when a component has no
  equivalent Unicode glyph.
- The West introduces the 22 Paleo-Hebrew letters, followed by Classical
  Biblical Hebrew roots and nouns in first grade and forms in context in
  second grade. Display Hebrew in Paleo-Hebrew without vowel points, using
  right-to-left isolation. Accept deliberate aliases and familiar
  transliteration variants. Teach contextual uses of grammatical forms.
- The bundled West vocabulary and grammar are a starter deck. RTK ordering,
  character forms, and source evidence remain visible as curriculum metadata.
  The traditional-character and Classical Chinese bridge can grow alongside
  the RTK sequence. Keep English glosses, readings, and mnemonic associations
  distinct and use original teaching explanations.

## Project context

The alphabet quiz is the small entrance to a larger project about shared
human inheritance. Phonetic writing in the West and semantic writing in the
East help tell the story of how humans made thought visible. The longer arc
runs from writing through notation, logic, computation, Unix, and AI. It
connects the human effort to understand thought with the tools we built in
the process.
Lessons start with simple usable pieces. The broader cultural story comes
through optional discoveries and invitations, including the Exodus and
unfinished-pyramid imagery shared with *We The Nameless*. Keep the entry
point approachable and leave room for local accents and ways of speaking.

Use ordinary files and composable commands so a person can bring their own
lessons, change them, or build another view over the same material.

[Original brief](../imperative/20261121-mk-new-human-school-original) ·
[NHS guide](../../doc/new-human-school.md)
