'use strict';
/* Single source of truth for every repository path. Run all tools from the repository root. */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const at = (...parts) => path.join(root, ...parts);

const pages = ['index.html', 'bigbang.html', 'cosmicweb.html', 'stellar.html', 'wormhole.html', 'heatdeath.html'];
const runtimeFiles = [
  'app/runtime.js', 'app/math.js', 'app/common.js', 'app/content.js', 'app/experience.js',
  'app/styles/base.css', 'app/styles/common.css', 'app/styles/experience.css', 'app/styles/design.css'
];

function browser() {
  if (process.env.EDGE_PATH || process.env.CHROME_PATH) return process.env.EDGE_PATH || process.env.CHROME_PATH;
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ];
  const found = candidates.find(item => item && fs.existsSync(item));
  if (!found) throw Error('Chromium browser not found. Set EDGE_PATH or CHROME_PATH to the executable.');
  return found;
}

function ffmpeg() {
  const candidates = [
    process.env.FFMPEG_EXE,
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python312', 'site-packages', 'imageio_ffmpeg', 'binaries', 'ffmpeg-win-x86_64-v7.1.exe')
  ];
  const found = candidates.find(item => item && fs.existsSync(item));
  if (!found) throw Error('FFmpeg not found. Set FFMPEG_EXE to the encoder executable.');
  return found;
}

module.exports = {
  root, at, pages, runtimeFiles, browser, ffmpeg,
  app: name => at('app', name),
  styles: name => at('app', 'styles', name),
  chapters: name => at('app', 'chapters', name),
  data: name => at('data', name),
  evidence: name => at('evidence', name),
  docs: name => at('docs', name),
  tool: name => at('tools', name),
  page: name => at(name),
  output: (...parts) => at('output', ...parts),
  archive: (...parts) => at('archive', ...parts)
};
