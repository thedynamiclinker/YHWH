// Internal file moves only. Panel dragging and OS file drops use other types.
export function installFileDrag({ list, pathsFor, currentDirectory, move, notice }) {
  const type = 'application/x-yhwh-files';
  let paths = null, highlighted = null, holdTimer, touchStart, touchDragging = false, frame, point;
  const within = (value, root) => value === root || value.startsWith(root.replace(/[/\\]$/, '') + (root.includes('\\') ? '\\' : '/'));
  function target(element) {
    if (!element || !list.contains(element)) return null;
    const row = element.closest('[data-path]');
    if (row && row.dataset.directory !== 'true') return null;
    const group = element.closest('[data-children]');
    const directory = row?.dataset.path || group?.dataset.children || currentDirectory();
    if (paths?.some(source => within(directory, source))) return null;
    return { directory, element: row || group || list };
  }
  function highlight(destination) {
    highlighted?.classList.remove('drop-target');
    highlighted = destination?.element; highlighted?.classList.add('drop-target');
  }
  function reset() {
    clearTimeout(holdTimer); cancelAnimationFrame(frame); frame = null; highlight(null);
    list.classList.remove('dragging-files'); paths = null; touchStart = null; point = null; touchDragging = false;
  }
  function drop(destination) {
    const sources = paths; reset();
    if (sources?.length && destination) move(sources, destination.directory).catch(error => notice(error.message));
  }
  list.addEventListener('dragstart', event => {
    const row = event.target.closest('[draggable="true"][data-path]'); if (!row) return;
    paths = pathsFor(row);
    if (!paths.length) { event.preventDefault(); reset(); return; }
    event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(type, JSON.stringify(paths));
  });
  list.addEventListener('dragover', event => {
    if (!paths || !event.dataTransfer.types.includes(type)) return;
    event.stopPropagation(); event.preventDefault();
    const destination = target(event.target); event.dataTransfer.dropEffect = destination ? 'move' : 'none'; highlight(destination);
    // Keep long lists reachable without leaving the drag.
    const bounds = list.getBoundingClientRect();
    if (event.clientY < bounds.top + 35) list.scrollTop -= 15;
    else if (event.clientY > bounds.bottom - 35) list.scrollTop += 15;
  });
  list.addEventListener('dragleave', event => { if (!list.contains(event.relatedTarget)) highlight(null); });
  list.addEventListener('drop', event => {
    if (!paths || !event.dataTransfer.types.includes(type)) return;
    event.stopPropagation(); event.preventDefault(); drop(target(event.target));
  });
  list.addEventListener('dragend', reset);

  // WebViews do not consistently implement HTML drag events for touch. A hold
  // starts a move; swiping before the hold continues to scroll the file list.
  list.addEventListener('touchstart', event => {
    reset(); if (event.touches.length !== 1) return;
    const row = event.target.closest('[draggable="true"][data-path]'); if (!row) return;
    const touch = event.touches[0]; touchStart = { x: touch.clientX, y: touch.clientY };
    holdTimer = setTimeout(() => {
      paths = pathsFor(row); touchDragging = true; list.classList.add('dragging-files');
      highlight(target(row));
    }, 450);
  }, { passive: true });
  list.addEventListener('touchmove', event => {
    if (event.touches.length !== 1) { reset(); return; }
    const touch = event.touches[0];
    if (!touchDragging) {
      if (touchStart && Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > 8) reset();
      return;
    }
    event.preventDefault(); event.stopPropagation(); point = { x: touch.clientX, y: touch.clientY };
    highlight(target(document.elementFromPoint(point.x, point.y)));
    if (!frame) {
      const scroll = () => {
        if (!point) return;
        const bounds = list.getBoundingClientRect();
        if (point.y < bounds.top + 35) list.scrollTop -= 8;
        else if (point.y > bounds.bottom - 35) list.scrollTop += 8;
        highlight(target(document.elementFromPoint(point.x, point.y)));
        frame = requestAnimationFrame(scroll);
      };
      frame = requestAnimationFrame(scroll);
    }
  }, { passive: false });
  list.addEventListener('pointerup', event => {
    if (touchDragging && event.pointerType === 'touch') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  list.addEventListener('touchend', event => {
    if (!touchDragging) { reset(); return; }
    event.preventDefault(); event.stopPropagation();
    const touch = event.changedTouches[0]; drop(target(document.elementFromPoint(touch.clientX, touch.clientY)));
  }, { passive: false });
  list.addEventListener('touchcancel', reset);
  list.addEventListener('contextmenu', event => {
    if (touchDragging) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') reset(); });
}
