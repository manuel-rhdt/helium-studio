#!/usr/bin/env python3
"""Picks the text fonts offered in the style sidebar from the installed font packages.

Runs inside the Amazon Linux build container (see build-fonts.sh), where the font packages are
installed. Usage: fonts.py OUTPUT_DIR

The files are copied as they are: helium subsets the fonts it embeds into the PDF. The math fonts
are not handled here.

Keep FAMILIES in step with FONTS in public/styles.js (test/styles.test.js checks this).
"""
import os
import shutil
import subprocess
import sys

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


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    fonts = scan(sorted(set(font_files())))
    total = 0
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
            shutil.copyfile(source, target)
            size = os.path.getsize(target)
            total += size
            print(f"{family:20} {face:12} {os.path.basename(source):34} {size / 1024:6.0f} KB")
    print(f"total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1])
