(() => {
  "use strict";

  const STORAGE_KEY = "helium-studio";
  const AUTO_COMPILE_DELAY_MS = 1500;
  const $ = (id) => document.getElementById(id);

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // ---------- persisted state ----------

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }
  const saved = load();
  const state = {
    name: saved.name || "Untitled Document",
    source: typeof saved.source === "string" ? saved.source : window.HELIUM_EXAMPLE,
    autoCompile: saved.autoCompile ?? true,
    layout: saved.layout || "split",
    editorWidth: saved.editorWidth || null,
    showFiles: saved.showFiles ?? true,
    zoom: saved.zoom || "fit-width",
  };
  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* storage unavailable: the session still works, it just isn't remembered */
      }
    }, 300);
  }

  // ---------- editor ----------

  const editor = CodeMirror($("editor-host"), {
    value: state.source,
    mode: "htmlmixed",
    lineNumbers: true,
    lineWrapping: true,
    autoCloseTags: true,
    matchTags: { bothTags: true },
    styleActiveLine: true,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: {
      "Ctrl-S": () => compile(),
      "Cmd-S": () => compile(),
      "Ctrl-Enter": () => compile(),
      "Cmd-Enter": () => compile(),
      Tab: (cm) => cm.execCommand(cm.somethingSelected() ? "indentMore" : "insertSoftTab"),
    },
  });

  let autoTimer;
  editor.on("change", () => {
    state.source = editor.getValue();
    persist();
    updateOutline();
    $("pdf-viewer").classList.add("stale");
    if (state.autoCompile) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(compile, AUTO_COMPILE_DELAY_MS);
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "Enter")) {
      e.preventDefault();
      compile();
    }
  });

  // ---------- outline ----------

  function updateOutline() {
    const list = $("outline");
    list.textContent = "";
    const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    const text = editor.getValue();
    let match;
    while ((match = re.exec(text))) {
      const title = match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (!title) continue;
      const line = editor.posFromIndex(match.index).line;
      const li = document.createElement("li");
      li.className = `level-${match[1]}`;
      li.textContent = title;
      li.title = title;
      li.onclick = () => {
        editor.focus();
        editor.setCursor({ line, ch: 0 });
        editor.scrollIntoView({ line, ch: 0 }, 80);
      };
      list.appendChild(li);
    }
    if (!list.children.length) {
      list.innerHTML = '<li class="empty">No headings</li>';
    }
  }

  // ---------- compile ----------

  let compiling = false;
  let pendingCompile = false;
  let lastPdf = null;

  async function compile() {
    clearTimeout(autoTimer);
    if (compiling) {
      pendingCompile = true;
      return;
    }
    compiling = true;
    document.querySelector(".recompile-group").classList.add("compiling");
    $("recompile-label").textContent = "Compiling…";
    setStatus("");

    const source = editor.getValue();
    let result;
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ html: source }),
      });
      const body = await res.json().catch(() => ({ error: `Server responded with ${res.status}` }));
      result = { ok: res.ok && body.pdf, ...body };
    } catch (err) {
      result = { ok: false, error: `Could not reach the render function: ${err.message}` };
    }

    if (result.ok) {
      lastPdf = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0));
      $("download").disabled = false;
      try {
        await renderPdf(lastPdf.slice());
        $("pdf-viewer").classList.remove("stale");
        setStatus(`Compiled in ${(result.ms / 1000).toFixed(2)} s`);
      } catch (err) {
        result = { ok: false, error: `Could not display the PDF: ${err.message}`, log: result.log };
      }
    }
    showLogs(result);
    if (!result.ok) {
      setStatus("Compile failed");
      openLogs();
    }

    compiling = false;
    document.querySelector(".recompile-group").classList.remove("compiling");
    $("recompile-label").textContent = "Recompile";
    if (pendingCompile) {
      pendingCompile = false;
      compile();
    }
  }

  function setStatus(text) {
    $("compile-status").textContent = text;
  }

  // ---------- PDF rendering ----------

  let pdfDoc = null;

  async function renderPdf(data) {
    const doc = await pdfjsLib.getDocument({ data }).promise;
    if (pdfDoc) pdfDoc.destroy();
    pdfDoc = doc;
    await drawPages();
  }

  function currentScale(page) {
    const viewer = $("pdf-viewer");
    const base = page.getViewport({ scale: 1 });
    const availableWidth = viewer.clientWidth - 32;
    if (state.zoom === "fit-width") return Math.max(0.25, availableWidth / base.width);
    if (state.zoom === "fit-page") {
      return Math.max(0.25, Math.min(availableWidth / base.width, (viewer.clientHeight - 32) / base.height));
    }
    return Number(state.zoom) * (96 / 72);
  }

  let drawToken = 0;
  async function drawPages() {
    if (!pdfDoc) return;
    const token = ++drawToken;
    const viewer = $("pdf-viewer");
    // keep the reading position across recompiles, like Overleaf does
    const scrollRatio = viewer.scrollHeight > viewer.clientHeight ? viewer.scrollTop / viewer.scrollHeight : 0;
    const dpr = window.devicePixelRatio || 1;
    const fragment = document.createDocumentFragment();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      if (token !== drawToken) return;
      const viewport = page.getViewport({ scale: currentScale(page) });
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      }).promise;
      if (token !== drawToken) return;
      fragment.appendChild(canvas);
    }
    viewer.replaceChildren(fragment);
    viewer.scrollTop = scrollRatio * viewer.scrollHeight;
  }

  // ---------- logs ----------

  function parseLog(log) {
    const entries = [];
    for (const line of (log || "").split("\n")) {
      const m = line.match(/^\[[^\]]*\b(ERROR|WARN)\b[^\]]*\]\s*(.*)$/);
      if (m) entries.push({ level: m[1] === "ERROR" ? "error" : "warning", text: m[2] });
    }
    return entries;
  }

  function showLogs(result) {
    const container = $("logs-entries");
    container.textContent = "";
    const entries = parseLog(result.log);
    if (!result.ok) entries.unshift({ level: "error", title: result.error || "Compile failed", text: result.log });

    const add = (level, title, details) => {
      const el = document.createElement("div");
      el.className = `log-entry ${level}`;
      const header = document.createElement("header");
      header.textContent = title;
      el.appendChild(header);
      if (details) {
        const pre = document.createElement("pre");
        pre.textContent = details;
        el.appendChild(pre);
      }
      container.appendChild(el);
    };

    if (!entries.length) add("info", "No errors or warnings.");
    for (const e of entries) add(e.level, e.title ?? (e.level === "error" ? "Error" : "Warning"), e.text);

    $("raw-log").textContent = result.log || "(empty)";

    const errors = entries.filter((e) => e.level === "error").length;
    const warnings = entries.length - errors;
    const badge = $("logs-badge");
    badge.hidden = !(errors || warnings);
    badge.textContent = errors || warnings;
    badge.classList.toggle("warning", !errors);
  }

  function openLogs() {
    $("logs").hidden = false;
  }
  $("logs-btn").onclick = () => ($("logs").hidden = !$("logs").hidden);
  $("logs-close").onclick = () => ($("logs").hidden = true);

  // ---------- toolbar actions ----------

  $("recompile").onclick = () => compile();

  const menu = $("recompile-menu");
  function syncAutoMenu() {
    for (const b of menu.querySelectorAll("[data-auto]")) {
      b.classList.toggle("selected", (b.dataset.auto === "on") === state.autoCompile);
    }
  }
  $("recompile-menu-btn").onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  menu.onclick = (e) => {
    const b = e.target.closest("[data-auto]");
    if (!b) return;
    state.autoCompile = b.dataset.auto === "on";
    syncAutoMenu();
    persist();
    menu.hidden = true;
  };
  document.addEventListener("click", () => (menu.hidden = true));
  syncAutoMenu();

  $("download").onclick = () => {
    if (!lastPdf) return;
    const url = URL.createObjectURL(new Blob([lastPdf], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(state.name || "document").replace(/[^\w.-]+/g, "_")}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  $("project-name").value = state.name;
  $("project-name").oninput = (e) => {
    state.name = e.target.value;
    document.title = `${state.name} - Helium Studio`;
    persist();
  };
  document.title = `${state.name} - Helium Studio`;

  $("reset-doc").onclick = () => {
    if (editor.getValue() !== window.HELIUM_EXAMPLE && !confirm("Replace the current document with the example?")) return;
    editor.setValue(window.HELIUM_EXAMPLE);
    compile();
  };

  // ---------- zoom ----------

  const zoomSelect = $("zoom-select");
  const zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 2];
  zoomSelect.value = state.zoom;
  function setZoom(zoom) {
    state.zoom = String(zoom);
    zoomSelect.value = state.zoom;
    persist();
    drawPages();
  }
  zoomSelect.onchange = () => setZoom(zoomSelect.value);
  function effectiveZoom() {
    const canvas = document.querySelector(".pdf-page");
    if (!isNaN(Number(state.zoom))) return Number(state.zoom);
    return canvas ? canvas.clientWidth / (595 * (96 / 72)) : 1;
  }
  $("zoom-in").onclick = () => setZoom(zoomSteps.find((z) => z > effectiveZoom() + 0.01) ?? 2);
  $("zoom-out").onclick = () => setZoom([...zoomSteps].reverse().find((z) => z < effectiveZoom() - 0.01) ?? 0.5);

  // ---------- layout ----------

  const workspace = $("workspace");
  function setLayout(layout) {
    state.layout = layout;
    workspace.dataset.layout = layout;
    for (const b of document.querySelectorAll("[data-layout]")) {
      if (b.tagName === "BUTTON") b.classList.toggle("active", b.dataset.layout === layout);
    }
    persist();
    editor.refresh();
    drawPages();
  }
  for (const b of document.querySelectorAll(".layout-switch button")) b.onclick = () => setLayout(b.dataset.layout);
  setLayout(state.layout);

  $("toggle-files").onclick = () => {
    state.showFiles = !state.showFiles;
    workspace.classList.toggle("hide-files", !state.showFiles);
    persist();
    editor.refresh();
    drawPages();
  };
  workspace.classList.toggle("hide-files", !state.showFiles);

  const editorPane = $("editor-pane");
  if (state.editorWidth) editorPane.style.flexBasis = `${state.editorWidth}px`;
  const splitter = $("splitter");
  splitter.addEventListener("pointerdown", (e) => {
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add("dragging");
    const startX = e.clientX;
    const startWidth = editorPane.getBoundingClientRect().width;
    const move = (ev) => {
      const max = workspace.clientWidth - 240;
      const width = Math.min(max, Math.max(240, startWidth + ev.clientX - startX));
      editorPane.style.flexBasis = `${width}px`;
      state.editorWidth = width;
    };
    const up = () => {
      splitter.classList.remove("dragging");
      splitter.removeEventListener("pointermove", move);
      splitter.removeEventListener("pointerup", up);
      persist();
      editor.refresh();
      drawPages();
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", up);
  });

  let resizeTimer;
  new ResizeObserver(() => {
    if (!state.zoom.startsWith("fit")) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawPages, 150);
  }).observe($("pdf-viewer"));

  // ---------- start ----------

  updateOutline();
  compile();
})();
