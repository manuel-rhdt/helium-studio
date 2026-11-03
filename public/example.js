// The document shown in a fresh editor. String.raw keeps the TeX backslashes as written.
const FENCE = "`".repeat(3);
window.HELIUM_EXAMPLE = String.raw`# A Short Note on the Gaussian Integral

*Your Name*

> **Abstract.** This document is written in Markdown with TeX math and typeset by *Helium*, an HTML
> and CSS layout engine written in Rust. Edit the text on the left, change the look in the **Style**
> panel, and press **Recompile**.

## 1. Introduction

The integral of $f(x) = e^{-x^2}$ over the real line is one of the most frequently encountered
integrals in analysis, probability and mathematical physics. Its value is famously

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

## 2. Main result

**Theorem 1.** For every $a > 0$ we have

$$\int_{-\infty}^{\infty} e^{-a x^2}\,dx = \sqrt{\frac{\pi}{a}}$$

The proof squares the integral and switches to polar coordinates, where
$\sum_{k=0}^{n} \binom{n}{k} = 2^n$ is not needed but looks nice.

## 3. Things to try

- Change fonts, margins and colors in the **Style** panel.
- Switch the editor to **HTML** to see the generated document.
- Write inline math with $\alpha + \beta$ and display math between $$ lines.
- Add code:

${FENCE}python
def gaussian(x):
    return math.exp(-x ** 2)
${FENCE}

Visit [the Helium repository](https://github.com/manuel-rhdt/helium) for more.
`;
