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

// 3. Copy static assets (Taro copy plugin is unreliable)
const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const dirsToCopy = ['models', 'artoolkit'];
for (const dir of dirsToCopy) {
  const src = path.join(publicDir, dir);
  const dest = path.join(distDir, dir);
  if (fs.existsSync(src)) {
    copyDir(src, dest);
    console.log(`[postbuild] Copied ${dir}/ to dist/`);
  }
}

// 4. Copy .nojekyll
const nojekyllSrc = path.join(publicDir, '.nojekyll');
if (fs.existsSync(nojekyllSrc)) {
  fs.copyFileSync(nojekyllSrc, path.join(distDir, '.nojekyll'));
  console.log('[postbuild] Copied .nojekyll');
}

// 5. Copy images
const imagesSrc = path.join(publicDir, 'images');
const imagesDest = path.join(distDir, 'images');
if (fs.existsSync(imagesSrc)) {
  copyDir(imagesSrc, imagesDest);
  console.log('[postbuild] Copied images/ to dist/');
}

console.log('[postbuild] Done.');
