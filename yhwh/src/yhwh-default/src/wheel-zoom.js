const zoomTargets = new WeakMap();

export function registerWheelZoom(element, zoom) {
  zoomTargets.set(element, zoom);
}

// Give the closest zoom target the gesture before an editor or terminal can scroll.
window.addEventListener('wheel', event => {
  if (!event.ctrlKey || !event.deltaY) return;
  for (const element of event.composedPath()) {
    const zoom = zoomTargets.get(element);
    if (!zoom) continue;
    event.preventDefault();
    event.stopPropagation();
    zoom(event.deltaY < 0 ? 1 : -1, event);
    return;
  }
}, { capture: true, passive: false });
