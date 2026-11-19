// The real dialog keeps its keyboard focus and accessibility behavior, while
// its box and backdrop are limited visually to the Initial preview.
let preview = null;
export async function inInitialPreview(host, action) {
  const previous = preview;
  preview = host;
  try { return await action(); }
  finally { preview = previous; }
}

export function showWorkspaceDialog(dialog) {
  if (!preview?.isConnected) {
    dialog.classList.remove('initial-pane-dialog');
    dialog.showModal(); return;
  }
  const host = preview;
  const place = () => {
    const { x, y, width, height } = host.getBoundingClientRect();
    for (const [name, value] of Object.entries({ x, y, width, height })) dialog.style.setProperty('--initial-pane-' + name, value + 'px');
  };
  const observer = new ResizeObserver(place);
  dialog.classList.add('initial-pane-dialog');
  observer.observe(host);
  document.addEventListener('scroll', place, true);
  place();
  dialog.addEventListener('close', () => {
    observer.disconnect();
    document.removeEventListener('scroll', place, true);
    if (!dialog.open) dialog.classList.remove('initial-pane-dialog');
  }, { once: true });
  dialog.showModal();
}
