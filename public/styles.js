// Style settings for the default elements of a document, and the helium-compatible CSS built from
// them. The `SECTIONS` schema is the single source for defaults, validation and the sidebar UI.
//
// Only properties helium understands are used: it has no page size (always A4), letter-spacing,
// text-transform or small caps, and it needs `strong` and `b` set to bold explicitly.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HeliumStyles = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Fonts bundled with the render function: DejaVu and STIX Two Text by scripts/build-helium.sh, the
  // rest by scripts/build-fonts.sh (keep scripts/fonts.py in step). [family, kind]; the kind is also
  // the generic family used as a fallback.
  const FONTS = [
    ["STIX Two Text", "serif"],
    ["Latin Modern Roman", "serif"],
    ["Libertinus Serif", "serif"],
    ["EB Garamond", "serif"],
    ["Noto Serif", "serif"],
    ["Liberation Serif", "serif"],
    ["DejaVu Serif", "serif"],
    ["Source Sans 3", "sans-serif"],
    ["Lato", "sans-serif"],
    ["Latin Modern Sans", "sans-serif"],
    ["Liberation Sans", "sans-serif"],
    ["DejaVu Sans", "sans-serif"],
    ["Source Code Pro", "monospace"],
    ["Latin Modern Mono", "monospace"],
    ["Liberation Mono", "monospace"],
    ["DejaVu Sans Mono", "monospace"],
  ];
  const KIND_LABELS = { serif: "serif", "sans-serif": "sans", monospace: "mono" };
  const fontLabel = ([family, kind]) => `${family} (${KIND_LABELS[kind]})`;
  const fontOptions = FONTS.map((font) => [font[0], fontLabel(font)]);
  const monoFontOptions = FONTS.filter(([, kind]) => kind === "monospace").map((font) => [font[0], fontLabel(font)]);

  const num = (key, label, unit, min, max, step, def) => ({ key, label, type: "number", unit, min, max, step, default: def });
  const color = (key, label, def) => ({ key, label, type: "color", default: def });
  const select = (key, label, options, def) => ({ key, label, type: "select", options, default: def });

  const SECTIONS = [
    {
      id: "page",
      title: "Page",
      controls: [
        num("marginTop", "Top margin", "mm", 0, 100, 1, 25),
        num("marginBottom", "Bottom margin", "mm", 0, 100, 1, 25),
        num("marginLeft", "Left margin", "mm", 0, 100, 1, 25),
        num("marginRight", "Right margin", "mm", 0, 100, 1, 25),
        select(
          "pageNumbers",
          "Page numbers",
          [["none", "None"], ["left", "Bottom left"], ["center", "Bottom center"], ["right", "Bottom right"]],
          "center",
        ),
      ],
    },
    {
      id: "body",
      title: "Body text",
      controls: [
        select("font", "Font", fontOptions, "STIX Two Text"),
        num("size", "Font size", "pt", 6, 30, 0.5, 11),
        num("lineHeight", "Line height", "", 1, 3, 0.05, 1.45),
        color("color", "Text color", "#111111"),
        select("align", "Alignment", [["left", "Left"], ["justify", "Justified"]], "left"),
        num("paragraphSpacing", "Paragraph spacing", "pt", 0, 40, 1, 8),
      ],
    },
    {
      id: "headings",
      title: "Headings",
      controls: [
        select("font", "Font", [["", "Same as body"], ...fontOptions], ""),
        color("color", "Color", "#111111"),
        num("h1", "Heading 1 size", "pt", 8, 60, 0.5, 22),
        num("h2", "Heading 2 size", "pt", 8, 48, 0.5, 16),
        num("h3", "Heading 3 size", "pt", 8, 36, 0.5, 13),
        num("spaceAbove", "Space above", "pt", 0, 60, 1, 16),
      ],
    },
    {
      id: "code",
      title: "Code",
      controls: [
        select("font", "Font", monoFontOptions, "DejaVu Sans Mono"),
        num("size", "Font size", "pt", 6, 24, 0.5, 9.5),
        color("background", "Block background", "#f3f4f6"),
      ],
    },
    {
      id: "quote",
      title: "Block quotes",
      controls: [
        color("color", "Text color", "#555555"),
        color("bar", "Bar color", "#c8ccd4"),
        num("indent", "Indent", "pt", 0, 80, 1, 14),
      ],
    },
    {
      id: "links",
      title: "Links",
      controls: [
        color("color", "Color", "#0645ad"),
        select("underline", "Underline", [["yes", "Yes"], ["no", "No"]], "yes"),
      ],
    },
  ];

  function defaults() {
    const result = {};
    for (const section of SECTIONS) {
      result[section.id] = Object.fromEntries(section.controls.map((control) => [control.key, control.default]));
    }
    return result;
  }

  // Merges (possibly stale or hand-edited) saved settings over the defaults, dropping anything invalid.
  function normalize(saved) {
    const result = defaults();
    for (const section of SECTIONS) {
      const source = saved && typeof saved[section.id] === "object" && saved[section.id] ? saved[section.id] : {};
      for (const control of section.controls) {
        const value = source[control.key];
        if (control.type === "number") {
          if (typeof value === "number" && Number.isFinite(value)) {
            result[section.id][control.key] = Math.min(control.max, Math.max(control.min, value));
          }
        } else if (control.type === "color") {
          if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) result[section.id][control.key] = value;
        } else if (control.options.some(([option]) => option === value)) {
          result[section.id][control.key] = value;
        }
      }
    }
    return result;
  }

  const fontStack = (name) => {
    const [family, kind] = FONTS.find(([value]) => value === name) ?? FONTS[0];
    // helium aborts when none of the listed fonts exists, so always end with a generic family
    return `"${family}", ${kind}`;
  };
  const round = (value) => Math.round(value * 100) / 100;

  function buildCss(settings) {
    const { page, body, headings, code, quote, links } = normalize(settings);
    const headingFont = headings.font || body.font;
    const space = `${body.paragraphSpacing}pt`;

    const pageBox = `${page.marginTop}mm ${page.marginRight}mm ${page.marginBottom}mm ${page.marginLeft}mm`;
    const pageNumber =
      page.pageNumbers === "none"
        ? ""
        : `\n  @bottom-${page.pageNumbers} { content: counter(page); font-size: 9pt; color: #555555; }`;

    // helium does not inherit text-align, so it is set on the elements that hold text
    return `@page { margin: ${pageBox};${pageNumber}
}
body { margin: 0; font-family: ${fontStack(body.font)}; font-size: ${body.size}pt; line-height: ${body.lineHeight}; color: ${body.color}; }
p, li, blockquote { text-align: ${body.align}; }
p { margin-top: 0; margin-bottom: ${space}; }
strong, b { font-weight: bold; }
em, i { font-style: italic; }
h1, h2, h3, h4, h5, h6 { font-family: ${fontStack(headingFont)}; color: ${headings.color}; font-weight: bold; text-align: left; line-height: 1.2; margin-top: ${headings.spaceAbove}pt; margin-bottom: 0.4em; }
h1 { font-size: ${headings.h1}pt; }
h2 { font-size: ${headings.h2}pt; }
h3 { font-size: ${headings.h3}pt; }
h4 { font-size: ${round(body.size * 1.15)}pt; }
h5 { font-size: ${body.size}pt; }
h6 { font-size: ${round(body.size * 0.9)}pt; }
ul, ol { margin-top: 0; margin-bottom: ${space}; }
a { color: ${links.color}; text-decoration: ${links.underline === "yes" ? "underline" : "none"}; }
blockquote { margin: 0 0 ${space} 0; padding-left: ${quote.indent}pt; border-left: 3pt solid ${quote.bar}; color: ${quote.color}; }
code { font-family: ${fontStack(code.font)}; font-size: ${code.size}pt; }
.codeblock { font-family: ${fontStack(code.font)}; font-size: ${code.size}pt; line-height: 1.35; background-color: ${code.background}; padding: 8pt; margin: 0 0 ${space} 0; text-align: left; }
math[display="block"] { margin-top: ${space}; margin-bottom: ${space}; }
`;
  }

  const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function buildDocument(bodyHtml, settings, title) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || "Document")}</title>
<style>
${buildCss(settings)}</style>
</head>
<body>
${bodyHtml}</body>
</html>
`;
  }

  return { FONTS, SECTIONS, defaults, normalize, buildCss, buildDocument };
});
