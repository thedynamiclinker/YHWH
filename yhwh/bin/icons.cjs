#!/usr/bin/env node
// Export the checked-in launcher artwork. ImageMagick is needed only to
// regenerate these assets, never to build, install or run YHWH.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('../lib/paths.cjs');

const assets = path.join(root, 'etc/assets');
function iconSVG(development, { size = 1024, inset = 32, opaque = false } = {}) {
  const source = fs.readFileSync(path.join(assets, development ? 'icon-development-source.png' : 'icon-source.png')).toString('base64');
  const background = development ? '#000000' : '#222222';
  const title = development ? 'YHWH development · Paleo-Hebrew name' : 'YHWH · third mountain';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 1024 1024" role="img" aria-label="${title}">
  <title>${title}</title>
  <defs><clipPath id="disc"><circle cx="512" cy="512" r="${512 - inset}"/></clipPath></defs>
  ${opaque ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}
  <g clip-path="url(#disc)"><circle cx="512" cy="512" r="${512 - inset}" fill="${background}"/><image width="1024" height="1024" xlink:href="data:image/png;base64,${source}"/></g>
</svg>
`;
}
function render(svg, filename) {
  const result = spawnSync('magick', ['-background', 'none', 'svg:-', '-depth', '8', filename], { input: svg, maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw new Error('Install ImageMagick to regenerate launcher assets: ' + result.error.message);
  if (result.status !== 0) throw new Error(result.stderr.toString());
}
for (const development of [false, true]) {
  const id = development ? 'yhwh-development' : 'yhwh';
  const svg = iconSVG(development);
  fs.writeFileSync(path.join(root, '../usr/share/icons/hicolor/scalable/apps', `${id}.svg`), svg);
  fs.writeFileSync(path.join(assets, development ? 'icon-development.svg' : 'icon.svg'), svg);
  render(iconSVG(development, { size: 512 }), path.join(assets, development ? 'icon-development.png' : 'icon.png'));
}

const res = path.join(root, 'src/yhwh-mobile/android/app/src/main/res');
for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  const directory = path.join(res, `mipmap-${density}`);
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) render(iconSVG(false, { size: 48 * scale }), path.join(directory, name));
  // Adaptive icons have a 108dp canvas and a central 66dp safe area.
  const foreground = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${108 * scale}" height="${108 * scale}" viewBox="0 0 108 108"><svg x="21" y="21" width="66" height="66" viewBox="0 0 1024 1024">${iconSVG(false).replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')}</svg></svg>`;
  render(foreground, path.join(directory, 'ic_launcher_foreground.png'));
}
render(iconSVG(false, { opaque: true }), path.join(root, 'src/yhwh-mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
console.log('Exported circular desktop/Electron icons and installed artwork for Android/iOS.');
