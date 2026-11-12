// Plugins are plain ES modules. Return a cleanup function for hot reload.
export default function helloWorld(api) {
  const remove = api.addCommand({ id: 'hello-world', name: 'Hello, world', run: () => api.notice(api.words.helloWorld) });
  const panel = api.addPanel({ id: 'hello-world', title: 'Hello, world', area: 'right', render(element) {
    const text = document.createElement('p');
    text.textContent = api.words.helloWorld;
    const edit = document.createElement('button');
    edit.textContent = 'Edit this text'; edit.onclick = () => api.editWords('helloWorld');
    element.append(text, edit);
  }});
  // Demonstrate a real command and movable panel without opening a permanent
  // welcome widget in the user's reading space.
  panel.element.hidden = true;
  const show = api.addCommand({ id: 'hello-panel', name: 'Show hello-world plugin panel', run: () => { panel.element.hidden = !panel.element.hidden; } });
  return () => { remove(); show(); panel.remove(); };
}
