# Verses and commentary

- Bundle all verse blocks from `We The Nameless/[01][0-9]-*/*.tex`, including empty commentary, alternate drafts and apocryphal fragments. Preserve exact TeX fields and source provenance alongside readable display text. Import explicitly; normal builds and installed apps must not depend on the manuscript checkout.
- Chapter context carries across chapter files in a book, as in the book's sequential includes. Genesis 2:25 lives before the chapter heading in `03.tex`. Keep numbered Samuel and Kings volumes distinct. Prefer main chapter files for navigation and random verses; retain alternate drafts in the data.
- Preserve combined and split manuscript labels. Ordinary references must resolve to their corresponding blocks: Genesis 2:7 reaches 6–7; Genesis 49:24 reaches both 24a and 24b. Never invent missing manuscript verses or silently change versification.
- Reusable citations display a reference between horizontal rules, English on the left, the original RTL text on the right, and optional commentary underneath. Every instance controls its own commentary visibility.
- Commentary edits belong to the application profile, keyed by stable source/verse identity. Save atomically, preserve blank edits, and allow restoring the imported original. Reimporting or rebuilding must not erase edits or rewrite the source book.
- The random verse box becomes Nietzsche Family Circus in Nietzsche mode and disappears in Dawkins mode. Fetch errors stay within the box; mode changes must discard stale asynchronous results.
- Editable character copy and commentary are escaped plain text. Render their line breaks and blank lines faithfully, without interpreting markup or applying plain-text whitespace rules to Markdown documents.
