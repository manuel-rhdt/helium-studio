window.HELIUM_EXAMPLE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>A Short Note on the Gaussian Integral</title>
<style>
  @page {
    @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; color: #555; }
  }
  body { font-family: serif; font-size: 11pt; line-height: 1.4; }
  h1 { text-align: center; font-size: 20pt; margin-bottom: 4px; }
  .author { text-align: center; margin-top: 0; margin-bottom: 24px; }
  h2 { font-size: 14pt; margin-top: 22px; }
  p { text-align: justify; margin-top: 0; margin-bottom: 10px; }
  .abstract { margin-left: 36px; margin-right: 36px; font-size: 10pt; }
  b { font-weight: bold; }
  .theorem { border-left: 4px solid #138a07; padding-left: 12px; margin-left: 12px; }
</style>
</head>
<body>
<h1>A Short Note on the Gaussian Integral</h1>
<p class="author">Your Name</p>

<div class="abstract">
<p><b>Abstract.</b> This document was typeset by <i>Helium</i>, an HTML and CSS
layout engine written in Rust. Edit the source on the left and press
<b>Recompile</b> to see the result.</p>
</div>

<h2>1. Introduction</h2>
<p>The integral of <math><mi>f</mi><mrow><mo>(</mo><mi>x</mi><mo>)</mo></mrow><mo>=</mo><msup><mi>e</mi><mrow><mo>&#x2212;</mo><msup><mi>x</mi><mn>2</mn></msup></mrow></msup></math>
over the real line is one of the most frequently encountered integrals in analysis,
probability and mathematical physics. Its value is famously</p>
<math display="block">
  <msubsup><mo>&#x222B;</mo><mrow><mo>&#x2212;</mo><mi>&#x221E;</mi></mrow><mrow><mo>+</mo><mi>&#x221E;</mi></mrow></msubsup>
  <msup><mi>e</mi><mrow><mo>&#x2212;</mo><msup><mi>x</mi><mn>2</mn></msup></mrow></msup>
  <mi>d</mi><mi>x</mi>
  <mo>=</mo>
  <msqrt><mi>&#x03C0;</mi></msqrt>
</math>

<h2>2. Main result</h2>
<div class="theorem">
<p><b>Theorem 1.</b> For every <math><mi>a</mi><mo>&gt;</mo><mn>0</mn></math> we have</p>
<math display="block">
  <msubsup><mo>&#x222B;</mo><mrow><mo>&#x2212;</mo><mi>&#x221E;</mi></mrow><mi>&#x221E;</mi></msubsup>
  <msup><mi>e</mi><mrow><mo>&#x2212;</mo><mi>a</mi><msup><mi>x</mi><mn>2</mn></msup></mrow></msup>
  <mi>d</mi><mi>x</mi>
  <mo>=</mo>
  <msqrt><mfrac><mi>&#x03C0;</mi><mi>a</mi></mfrac></msqrt>
</math>
</div>

<h2>3. Things to try</h2>
<ul>
  <li>Change the fonts, margins and colours in the <code>&lt;style&gt;</code> block.</li>
  <li>Add page headers with <code>@page { @top-left { ... } }</code>.</li>
  <li>Write some more <code>&lt;math&gt;</code>.</li>
</ul>
</body>
</html>
`;
