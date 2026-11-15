#!/usr/bin/env python3
"""Import Genesis display markup using the book's ebook renderer.
Usage: python3 bin/import-verse-style.py '/path/to/We The Nameless'
Plain text and original TeX remain in the verse library; this is display data.
"""
import importlib.util
import json
from pathlib import Path
import shutil
import sys

source = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wtn_ebook', source / 'ebook/build.py')
book = importlib.util.module_from_spec(spec)
spec.loader.exec_module(book)
library = json.loads((root / 'etc/verses/we-the-nameless.json').read_text())
styles = {v['id']: {key: book.tex_to_markdown(v['tex'][key], compact=True)
                    for key in ('original', 'english')}
          for v in library['verses'] if v['book'] == 'Genesis'}
(root / 'etc/verses/genesis-display.json').write_text(json.dumps(styles, ensure_ascii=False) + '\n')
css = (source / 'ebook/epub.css').read_text()
font_rules = css[:css.index('/*')]
for font in book.FONT_FILES:
    shutil.copyfile(font, root / 'etc/default/fonts' / font.name)
# Keep the app layout; import only the book's typefaces and source profiles.
profiles = css[css.index('.source-j,'):css.index('.smallcaps')]
(root / 'etc/default/verse-source.css').write_text(
    '/* Imported from We The Nameless/ebook/epub.css. Regenerate with bin/import-verse-style.py. */\n'
    + font_rules.replace('../fonts/', 'fonts/') + '\n' + profiles)
