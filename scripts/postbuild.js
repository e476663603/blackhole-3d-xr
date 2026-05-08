// scripts/postbuild.js - Post-build: inject artoolkit + update version
const fs = require('fs');
const path = require('path');

const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(distIndex, 'utf8');

// 1. Update version in title
const now = new Date();
const versionStr = now.toISOString().slice(0, 10).replace(/-/g, '') + '.' + 
  now.toTimeString().slice(0, 8).replace(/:/g, '');
html = html.replace(
  /<title>.*?<\/title>/,
  `<title>blackhole-3d-xr v${versionStr}</title>`
);
html = html.replace(
  /window\.__BUILD_VERSION__\s*=\s*'[^']*'/,
  `window.__BUILD_VERSION__ = '${versionStr}'`
);
console.log(`[postbuild] Updated version to ${versionStr}`);

// 2. Inject artoolkit.min.js
const artoolkitScript = '<script src="./artoolkit/artoolkit.min.js"></script>';
if (!html.includes('artoolkit.min.js')) {
  const injectPoint = html.indexOf('<script defer="defer"');
  if (injectPoint !== -1) {
    html = html.slice(0, injectPoint) + artoolkitScript + '\n  ' + html.slice(injectPoint);
    console.log('[postbuild] Injected artoolkit.min.js');
  } else {
    console.log('[postbuild] Could not find injection point for artoolkit');
  }
} else {
  console.log('[postbuild] artoolkit.min.js already present');
}

fs.writeFileSync(distIndex, html, 'utf8');
console.log('[postbuild] Done.');
