// Shared, read-only viewers. File contents never become executable HTML and
// spreadsheet formulas/macros and PDF scripts are never run.
export async function mountViewer(host, file) {
  const root = document.createElement('section'); root.className = `file-viewer viewer-${file.viewer}`; host.append(root);
  const heading = document.createElement('p'); heading.className = 'viewer-status'; heading.textContent = 'Loading preview…'; root.append(heading);
  let disposed = false, release = () => {};
  const cleanup = () => { disposed = true; release(); root.remove(); };
  // Return cleanup immediately, including while a library or document loads.
  (async () => {
    if (['image', 'video', 'audio'].includes(file.viewer)) {
      const media = document.createElement(file.viewer === 'image' ? 'img' : file.viewer);
      media.setAttribute('aria-label', file.name);
      if (file.viewer === 'image') media.alt = file.name;
      else { media.controls = true; media.preload = 'metadata'; }
      let url = file.url || file.data;
      if (!url) {
        url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }));
        release = () => { media.pause?.(); media.removeAttribute('src'); media.load?.(); URL.revokeObjectURL(url); };
      } else release = () => { media.pause?.(); media.removeAttribute('src'); media.load?.(); };
      media.onerror = () => { heading.textContent = 'This format or codec cannot be displayed here. Use File actions → Open externally.'; };
      media.onload = media.onloadedmetadata = () => { heading.hidden = true; };
      media.src = url; root.append(media); return;
    }
    if (file.viewer === 'spreadsheet' || file.viewer === 'table') {
      const XLSX = await import('xlsx'); if (disposed) return;
      const workbook = XLSX.read(file.viewer === 'table' ? file.content : file.bytes, {
        type: file.viewer === 'table' ? 'string' : 'array', sheetRows: 2001,
        ...(file.name.toLowerCase().endsWith('.tsv') ? { FS: '\t' } : {}),
        cellHTML: false, cellFormula: false, bookVBA: false,
      });
      const tools = document.createElement('div'); tools.className = 'viewer-tools';
      const sheets = document.createElement('select'); sheets.setAttribute('aria-label', 'Worksheet');
      for (const name of workbook.SheetNames) sheets.add(new Option(name, name));
      tools.append(sheets); root.append(tools);
      const scroller = document.createElement('div'); scroller.className = 'table-scroll'; root.append(scroller);
      function draw() {
        const sheet = workbook.Sheets[sheets.value]; scroller.replaceChildren();
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        range.e.r = Math.min(range.e.r, range.s.r + 1999); range.e.c = Math.min(range.e.c, range.s.c + 99);
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', range });
        const table = document.createElement('table'); table.setAttribute('aria-label', sheets.value);
        const header = table.createTHead().insertRow();
        for (const label of ['Row', ...Array.from({ length: range.e.c - range.s.c + 1 }, (_, i) => XLSX.utils.encode_col(i + range.s.c))]) {
          const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; header.append(th);
        }
        const body = table.createTBody();
        rows.forEach((values, i) => {
          const row = body.insertRow(), label = document.createElement('th'); label.scope = 'row'; label.textContent = String(i + range.s.r + 1); row.append(label);
          for (let c = 0; c <= range.e.c - range.s.c; c++) row.insertCell().textContent = String(values[c] ?? '');
        });
        scroller.append(table); heading.hidden = false;
        heading.textContent = 'Read-only preview · up to 2,000 rows and 100 columns per sheet. Formulas show saved values.';
      }
      sheets.onchange = draw; draw(); return;
    }
    if (file.viewer === 'pdf') {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs'); if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;
      const task = pdfjs.getDocument({ data: new Uint8Array(file.bytes), isEvalSupported: false,
        cMapUrl: new URL('./pdf/cmaps/', import.meta.url).href, cMapPacked: true,
        standardFontDataUrl: new URL('./pdf/standard_fonts/', import.meta.url).href,
        wasmUrl: new URL('./pdf/wasm/', import.meta.url).href,
      });
      let renderTask, generation = 0, observer;
      release = () => { generation++; observer?.disconnect(); renderTask?.cancel(); task.destroy().catch(() => {}); };
      const pdf = await task.promise; if (disposed) return;
      const tools = document.createElement('div'); tools.className = 'viewer-tools';
      const previous = document.createElement('button'); previous.textContent = '←'; previous.setAttribute('aria-label', 'Previous PDF page');
      const next = document.createElement('button'); next.textContent = '→'; next.setAttribute('aria-label', 'Next PDF page');
      const pageInput = document.createElement('input'); pageInput.type = 'number'; pageInput.min = 1; pageInput.max = pdf.numPages; pageInput.value = 1; pageInput.setAttribute('aria-label', 'PDF page');
      const count = document.createElement('span'); count.textContent = `/ ${pdf.numPages}`;
      const zoom = document.createElement('select'); zoom.setAttribute('aria-label', 'PDF zoom');
      for (const value of [0.75, 1, 1.5, 2]) zoom.add(new Option(`${value * 100}%`, value)); zoom.value = '1';
      tools.append(previous, pageInput, count, next, zoom); root.append(tools);
      const scroller = document.createElement('div'); scroller.className = 'pdf-pages'; scroller.tabIndex = 0;
      scroller.setAttribute('role', 'region'); scroller.setAttribute('aria-label', 'PDF pages'); root.append(scroller);
      const first = await pdf.getPage(1); if (disposed) return;
      const initialSize = first.getViewport({ scale: 1 });
      const pages = Array.from({ length: pdf.numPages }, (_, index) => {
        const element = document.createElement('figure'); element.className = 'pdf-page'; element.dataset.page = index + 1;
        element.setAttribute('aria-label', `Page ${index + 1}`);
        const placeholder = document.createElement('div'); placeholder.className = 'pdf-page-image';
        const text = document.createElement('details'), summary = document.createElement('summary'), content = document.createElement('pre');
        summary.textContent = `Page ${index + 1} text`; text.append(summary, content); element.append(placeholder, text); scroller.append(element);
        return { element, placeholder, content, size: initialSize, rendered: false };
      });
      let current = 1, scale = 1, drawing = false, pending = false;
      function controls() {
        pageInput.value = current; previous.disabled = current === 1; next.disabled = current === pdf.numPages;
      }
      function sizePage(item) {
        item.element.style.width = `${item.size.width * scale}px`;
        item.placeholder.style.height = `${item.size.height * scale}px`;
      }
      function visiblePages() {
        const bounds = scroller.getBoundingClientRect();
        return pages.filter(item => { const box = item.element.getBoundingClientRect(); return box.bottom > bounds.top && box.top < bounds.bottom; });
      }
      // Render only the visible pages and their immediate neighbors, serially.
      // Evict distant canvases so scrolling a large document has bounded memory.
      async function draw() {
        pending = true; if (drawing) return; drawing = true;
        try {
          while (pending && !disposed) {
            pending = false;
            const visible = visiblePages();
            const start = Math.max(0, pages.indexOf(visible[0]) - 1), end = Math.min(pages.length, pages.indexOf(visible.at(-1)) + 2);
            const wanted = new Set(pages.slice(start, end));
            for (const item of pages) if (item.rendered && !wanted.has(item)) {
              item.placeholder.replaceChildren(); item.rendered = false;
            }
            for (const item of wanted) {
              if (item.rendered) continue;
              const mine = generation, number = pages.indexOf(item) + 1;
              const page = await pdf.getPage(number); if (disposed || mine !== generation) { pending = true; break; }
              item.size = page.getViewport({ scale: 1 }); sizePage(item);
              const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(16000000 / (item.size.width * item.size.height * scale * scale)));
              const viewport = page.getViewport({ scale: scale * ratio }), canvas = document.createElement('canvas');
              canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
              canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${file.name}, page ${number}`);
              renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
              try { await renderTask.promise; }
              catch (error) { if (error.name !== 'RenderingCancelledException') throw error; }
              if (disposed || mine !== generation) { pending = true; break; }
              item.placeholder.replaceChildren(canvas); item.rendered = true;
              item.content.textContent = (await page.getTextContent()).items.map(part => part.str + (part.hasEOL ? '\n' : ' ')).join('');
              page.cleanup(); heading.hidden = true;
            }
          }
        } finally { drawing = false; }
      }
      const redraw = () => draw().catch(error => { if (!disposed) { heading.hidden = false; heading.textContent = error.message; } });
      function goTo(number) {
        current = Math.max(1, Math.min(pdf.numPages, Math.trunc(number) || 1));
        const element = pages[current - 1].element;
        scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
        controls(); redraw();
      }
      scroller.onscroll = () => {
        const visible = visiblePages();
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = pdf.numPages;
        else if (visible.length) current = pages.indexOf(visible[0]) + 1;
        controls(); redraw();
      };
      previous.onclick = () => goTo(current - 1); next.onclick = () => goTo(current + 1);
      pageInput.onchange = () => goTo(Number(pageInput.value));
      function resize() {
        const number = current;
        scale = Number(zoom.value) * Math.min(1, Math.max(100, scroller.clientWidth - 16) / initialSize.width);
        generation++; renderTask?.cancel();
        for (const item of pages) { item.placeholder.replaceChildren(); item.rendered = false; sizePage(item); }
        goTo(number);
      }
      zoom.onchange = resize;
      observer = new ResizeObserver(resize); observer.observe(scroller);
      resize();
    }
  })().catch(error => {
    if (!disposed) heading.textContent = `Preview unavailable: ${error.message}. Use File actions to open this file externally.`;
  });
  return cleanup;
}
