# Verses and commentary

- Bundle all verse blocks from `We The Nameless/[01][0-9]-*/*.tex`, including empty commentary, alternate drafts and apocryphal fragments. Preserve exact TeX fields and source provenance alongside readable display text. Import explicitly; normal builds and installed apps must not depend on the manuscript checkout.
- Chapter context carries across chapter files in a book, as in the book's sequential includes. Genesis 2:25 lives before the chapter heading in `03.tex`. Keep numbered Samuel and Kings volumes distinct. Prefer main chapter files for navigation and random verses; retain alternate drafts in the data.
- Preserve combined and split manuscript labels. Ordinary references must resolve to their corresponding blocks: Genesis 2:7 reaches 6–7; Genesis 49:24 reaches both 24a and 24b. Never invent missing manuscript verses or silently change versification.
- Reusable citations display a reference between horizontal rules, English on the left, the original RTL text on the right, and optional commentary underneath. Every instance controls its own commentary visibility.
- Commentary edits belong to the application profile, keyed by stable source/verse identity. Save atomically, preserve blank edits, and allow restoring the imported original. Reimporting or rebuilding must not erase edits or rewrite the source book.
- The random verse box becomes Nietzsche Family Circus in Nietzsche mode and disappears in Dawkins mode. Fetch errors stay within the box; mode changes must discard stale asynchronous results.
- Nietzsche mode shows the Circus widget alongside the document without requiring the margins view. The margins view can still show it on its own.
- Editable character copy and commentary are escaped plain text. Render their line breaks and blank lines faithfully, without interpreting markup or applying plain-text whitespace rules to Markdown documents.

- Genesis is the only currently available book in the desktop verse browser, citations and random selection. Retain the full import for future unlocks; do not expose unfinished books through a typed reference. No unlock progression is implemented yet.
- Preserve the ebook's source profiles in both English and original text, including mixed-source spans, Hebrew direction and historical font encoding. Generate bundled display data with `yhwh/bin/import-verse-style.py`; normal builds must work without the manuscript checkout.
- In YHWH mode, margins start hidden and open as the tab's reading focus from the left ribbon. Documents, margins, Inbox and conversation share the reading area; switching focus preserves document buffers and file/terminal navigation.
- Inbox opens a message list, newest first, with sender, subject, preview and arrival date. Open one message at a time and mark only that message read. Preserve occasional work-triggered delivery, editable character copy, source citations and persistent read state.
