import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { Keyboard } from '@capacitor/keyboard';
import { createVerseLibrary } from '../../../lib/verse-library.cjs';
import defaults from '../../../etc/default/defaults.json';
import words from '../../../etc/default/words.json';
import { createStorage } from './storage.mjs';
import { createMobileBridge } from './bridge.mjs';
import { installMobile, pickPath } from './mobile.js';
import './mobile.css';

const storage = createStorage();
const verses = createVerseLibrary({
  loadData: async () => { const response = await fetch('./verses.json'); if (!response.ok) throw new Error('The bundled verse library could not load.'); return response.json(); },
  loadEdits: () => storage.loadState('commentaries', {}),
  persistEdits: edits => storage.saveState('commentaries', edits),
});
window.yhwh = createMobileBridge({
  platform: Capacitor.getPlatform(), storage, defaults, words, verses,
  builtinPlugins: [{ directory: 'hello-world', source: await (await fetch('./hello-world.js')).text() }],
  clipboard: string => Clipboard.write({ string }),
  external: async url => {
    if (!Capacitor.isNativePlatform()) { window.open(url, '_blank', 'noopener'); return; }
    if (url.startsWith('mailto:')) { const result = await AppLauncher.openUrl({ url }); if (!result.completed) throw new Error('No mail app could open this link.'); }
    else await Browser.open({ url });
  },
  share: async path => {
    if (Capacitor.isNativePlatform()) await Share.share({ title: path.split('/').at(-1), files: [await storage.uri(path)] });
    else {
      const url = URL.createObjectURL(new Blob([await storage.read(path)]));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = path.split('/').at(-1); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  },
  choose: (...args) => pickPath(storage, ...args),
});
document.body.classList.add('is-mobile');
window.addEventListener('yhwh:ready', () => {
  const app = window.YHWH;
  installMobile(app, storage);
  if (Capacitor.isNativePlatform()) {
    App.addListener('backButton', () => app.run('mobile-back')).catch(error => app.notice(error.message));
    App.addListener('appStateChange', ({ isActive }) => { if (isActive) app.refresh().catch(error => app.notice(error.message)); }).catch(error => app.notice(error.message));
    // Native keyboard resizing and visualViewport keep editing controls above
    // the software keyboard. No unsaved editor buffer is discarded on pause.
    if (Capacitor.getPlatform() === 'ios') {
      Keyboard.addListener('keyboardWillShow', () => document.body.classList.add('keyboard-open'));
      Keyboard.addListener('keyboardWillHide', () => document.body.classList.remove('keyboard-open'));
    }
  }
}, { once: true });
await import('../../yhwh-default/src/renderer.js');
