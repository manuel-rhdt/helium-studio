#!/usr/bin/env python3
"""Picks the text fonts offered in the style sidebar and subsets them.

Runs inside the Amazon Linux build container (see build-fonts.sh), where the font packages are
installed. Usage: fonts.py OUTPUT_DIR

helium embeds the whole font file for every face a document uses, and the PDF has to stay under the
function's response limit, so the fonts are reduced to the scripts and symbols a document is likely
to use. Layout tables (kerning, ligatures) are kept. The math fonts are not touched here.

Keep FAMILIES in step with FONTS in public/styles.js (test/styles.test.js checks this).
"""
import os
import subprocess
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# Faces are chosen by fontconfig weight (80 regular, 200 bold) and slant, not by style name: a Black
# cut also lists "Regular" as its legacy style name, so names pick the wrong files.
REGULAR, BOLD = 80, 200
FACES = {"Regular": (REGULAR, False), "Bold": (BOLD, False), "Italic": (REGULAR, True), "Bold Italic": (BOLD, True)}
ALL_FACES = list(FACES)

# (family, faces, file name prefix). Latin Modern is shipped in several optical sizes under one
# family name; only the 10 pt design is used, which the prefix selects.
FAMILIES = [
    ("Latin Modern Roman", ALL_FACES, "lmroman10-"),
    ("Libertinus Serif", ALL_FACES, ""),
    ("EB Garamond", ALL_FACES, "EBGaramond-"),
    ("Noto Serif", ALL_FACES, "NotoSerif-"),
    ("Liberation Serif", ALL_FACES, ""),
    ("Latin Modern Sans", ALL_FACES, "lmsans10-"),
    ("Source Sans 3", ALL_FACES, ""),
    ("Lato", ALL_FACES, ""),
    ("Liberation Sans", ALL_FACES, ""),
    ("Latin Modern Mono", ["Regular", "Italic"], "lmmono10-"),
    ("Source Code Pro", ALL_FACES, ""),
    ("Liberation Mono", ALL_FACES, ""),
]

# Latin, Greek and Cyrillic, punctuation and symbols, arrows, math operators, box drawing, ligatures
RANGES = [
    (0x0020, 0x024F), (0x0250, 0x02FF), (0x0300, 0x036F), (0x0370, 0x03FF), (0x0400, 0x052F),
    (0x1E00, 0x1EFF), (0x1F00, 0x1FFF), (0x2000, 0x206F), (0x2070, 0x209F), (0x20A0, 0x20CF),
    (0x2100, 0x214F), (0x2150, 0x218F), (0x2190, 0x21FF), (0x2200, 0x22FF), (0x2300, 0x23FF),
    (0x2500, 0x257F), (0x2580, 0x259F), (0x25A0, 0x25FF), (0x2600, 0x26FF), (0x2700, 0x27BF),
    (0xFB00, 0xFB06),
]
ROOTS = ["/usr/share/fonts", "/usr/share/texlive"]


def font_files():
    for root in ROOTS:
        for directory, _, names in os.walk(root, followlinks=True):
            for name in names:
                if name.lower().endswith((".otf", ".ttf")):
                    yield os.path.join(directory, name)


def scan(paths):
    """Returns (families, weight, slanted, file) for every static font of normal width."""
    fonts = []
    for start in range(0, len(paths), 200):
        out = subprocess.run(
            ["fc-scan", "--format", "%{family}|%{weight}|%{slant}|%{width}|%{variable}|%{file}\\n", *paths[start : start + 200]],
            check=True, capture_output=True, text=True,
        ).stdout
        for line in out.splitlines():
            families, weight, slant, width, variable, path = line.split("|", 5)
            # fontconfig prints a weight or slant such as "80" or "0"; variable fonts print ranges
            if variable == "True" or not (weight.isdigit() and slant.isdigit() and width.isdigit()):
                continue
            if int(width) == 100:
                fonts.append((families.split(","), int(weight), int(slant) > 0, path))
    return fonts


def subset_font(source, target):
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    # Hints only matter on screen, not in a PDF, so they are dropped from CFF fonts. For TrueType fonts
    # they are kept: helium copies the cvt, prep and fpgm tables into the PDF and panics without them.
    options.hinting = source.lower().endswith(".ttf")
    font = subset.load_font(source, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[cp for start, end in RANGES for cp in range(start, end + 1)])
    subsetter.subset(font)
    subset.save_font(font, target, options)
    font.close()


def check_embeddable(path):
    """helium needs these tables to embed a TrueType font (src/layout/text/to_pdf_font.rs)."""
    font = TTFont(path)
    if "glyf" in font:
        missing = [tag for tag in ("head", "hhea", "loca", "maxp", "cvt ", "prep", "glyf", "hmtx", "fpgm") if tag not in font]
        if missing:
            sys.exit(f"{path}: helium cannot embed this TrueType font, missing tables {missing}")
    font.close()


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    fonts = scan(sorted(set(font_files())))
    total_before = total_after = 0
    for family, faces, prefix in FAMILIES:
        for face in faces:
            weight, slanted = FACES[face]
            candidates = sorted(
                {
                    path
                    for families, w, sl, path in fonts
                    if family in families and w == weight and sl == slanted and os.path.basename(path).startswith(prefix)
                },
                key=lambda path: (os.path.basename(path), path),
            )
            names = {os.path.basename(path) for path in candidates}
            if len(names) != 1:
                sys.exit(f"expected one file for {family} / {face}, found {sorted(names) or 'none'}")
            source = candidates[0]
            target = os.path.join(out_dir, f"{family}-{face}".replace(" ", "") + os.path.splitext(source)[1].lower())
            subset_font(source, target)
            check_embeddable(target)
            before, after = os.path.getsize(source), os.path.getsize(target)
            total_before += before
            total_after += after
            print(f"{family:20} {face:12} {os.path.basename(source):34} {before / 1024:6.0f} KB -> {after / 1024:5.0f} KB")
    print(f"total {total_before / 1e6:.1f} MB -> {total_after / 1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1])
