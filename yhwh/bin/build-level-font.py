"""Regenerate Mono for YHWH with fonttools[woff].

Pass the regular Noto Sans Mono and Noto Sans Hebrew font files, in that order.
The other outlines and the font's license are bundled with YHWH.
"""

import argparse
import json
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.misc.timeTools import epoch_diff
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


FAMILY = "Mono for YHWH"
UNITS_PER_EM = 1000
LATIN_CELL = 600
HAN_CELL = 1000
ETC = Path(__file__).resolve().parents[1] / "etc"
FONTS = ETC / "default/fonts"


def build(mono, hebrew):
    paths = [mono, hebrew, FONTS / "yhwh-han.woff2", ETC / "assets/Phoenician.ttf",
             FONTS / "egyptian-hieroglyphs-regular-noto-sans.ttf"]
    sources = [TTFont(path) for path in paths]
    han_characters = sources[2].getBestCmap().keys()
    levels = json.loads((FONTS.parent / "levels.json").read_text())["levels"]
    characters = set(range(32, 127))
    for level in levels:
        for key in ("welcomePoem", "poem"):
            characters.update(ord(char) for char in level.get(key, "") if char.isprintable())

    outlines = {}
    for source in reversed(sources):
        glyph_set = source.getGlyphSet(location={"wght": 400} if "fvar" in source else None)
        outlines.update({point: (glyph_set, glyph) for point, glyph in source.getBestCmap().items()
                         if point in characters})
    missing = characters - outlines.keys()
    if missing:
        raise ValueError(f"No outline for {''.join(map(chr, sorted(missing)))}")

    cmap = {point: f"uni{point:04X}" for point in sorted(characters)}
    glyphs = {".notdef": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (LATIN_CELL, 0)}
    for point, name in cmap.items():
        glyph_set, glyph = outlines[point]
        source_glyph = glyph_set[glyph]
        source_font = glyph_set.font
        cell = HAN_CELL if point in han_characters else LATIN_CELL
        scale = UNITS_PER_EM / source_font["head"].unitsPerEm
        x_scale = min(scale, cell / source_glyph.width) if source_glyph.width else scale
        x_offset = (cell - source_glyph.width * x_scale) / 2
        outline = DecomposingRecordingPen(glyph_set)
        source_glyph.draw(outline)
        pen = TTGlyphPen(None)
        outline.replay(TransformPen(pen, (x_scale, 0, 0, scale, x_offset, 0)))
        glyphs[name] = pen.glyph()
        glyphs[name].recalcBounds(None)
        metrics[name] = (cell, getattr(glyphs[name], "xMin", 0))

    builder = FontBuilder(UNITS_PER_EM)
    builder.font["head"].created = builder.font["head"].modified = -epoch_diff
    builder.setupGlyphOrder(list(glyphs))
    builder.setupCharacterMap(cmap)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=1000, descent=-300)
    builder.setupOS2(sTypoAscender=1000, sTypoDescender=-300, usWinAscent=1000, usWinDescent=300)
    builder.setupNameTable({
        "familyName": FAMILY, "styleName": "Regular", "fullName": FAMILY,
        "uniqueFontIdentifier": FAMILY + " Regular 1.0", "psName": "MonoForYHWH-Regular",
        "version": "Version 1.0",
        "copyright": "\n".join(dict.fromkeys(source["name"].getDebugName(0) for source in sources)),
        "licenseDescription": "SIL Open Font License, Version 1.1",
        "licenseInfoURL": "https://openfontlicense.org",
    })
    builder.setupPost()
    builder.font.flavor = "woff2"
    builder.save(FONTS / "mono-for-yhwh.woff2")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mono", type=Path, help="Noto Sans Mono font")
    parser.add_argument("hebrew", type=Path, help="Noto Sans Hebrew font")
    args = parser.parse_args()
    build(args.mono, args.hebrew)
