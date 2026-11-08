'use strict';
/* One-way generation: data/ -> app/content.js + docs/storyboard. Never rewrites pages, chapters or the science ledger. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const paths = require('./paths.cjs');
const source = require('./content-source.cjs');

for (const asset of source.read('asset-manifest.json').assets) {
  const local = paths.at(asset.localPath);
  assert.ok(fs.existsSync(local), asset.localPath);
  assert.equal(fs.statSync(local).size, asset.bytes, asset.id + ': byte count');
  assert.ok(asset.credit && asset.processing && asset.supportsClaim && asset.dimensions, asset.id + ': required fields');
  if (asset.assetOrigin === 'original') {
    assert.ok(!asset.assetUrl, asset.id + ': original diagram must not claim an external asset URL');
  } else {
    assert.ok(asset.assetUrl && asset.assetUrl.startsWith('https://'), asset.id + ': assetUrl');
  }
}

for (const page of paths.pages) {
  const id = page.replace('.html', '');
  const html = fs.readFileSync(paths.page(page), 'utf8');
  assert.ok(html.includes('data-chapter="' + id + '"'), page + ': chapter marker');
  for (const file of [...paths.runtimeFiles, 'app/chapters/' + id + '.js']) {
    assert.ok(html.includes(file), page + ': missing ' + file);
  }
}

fs.writeFileSync(paths.app('content.js'), source.contentScript(), 'utf8');
fs.writeFileSync(paths.docs('六章分镜与旁白稿.md'), source.storyboard('zh'), 'utf8');
fs.writeFileSync(paths.docs('storyboard.en.md'), source.storyboard('en'), 'utf8');
fs.writeFileSync(paths.docs('storyboard.ja.md'), source.storyboard('ja'), 'utf8');
console.log('Generated app/content.js (zh/en/ja) and three storyboards from data/. No source file was rewritten.');
