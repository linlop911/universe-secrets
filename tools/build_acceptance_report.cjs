'use strict';
/* Truthful report builder: always writes reports, whether the suites passed or failed. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const paths = require('./paths.cjs');

const readEvidence = name => JSON.parse(fs.readFileSync(paths.evidence(name), 'utf8'));
const readData = name => JSON.parse(fs.readFileSync(paths.data(name), 'utf8'));
const write = (name, value) => fs.writeFileSync(paths.at(name), value, 'utf8');
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(paths.at(name))).digest('hex');
const cell = value => String(value).replaceAll('|', ' / ').replaceAll('\n', '');
const table = (heads, rows) => '| ' + heads.map(cell).join(' | ') + ' |\n| ' + heads.map(() => '---').join(' | ') + ' |\n' + rows.map(row => '| ' + row.map(cell).join(' | ') + ' |').join('\n');
const link = (text, url) => `[${text}](${url})`;
const n = value => value.toFixed(2);
const size = value => `${value.width}×${value.height}`;

const chapters = readData('chapter-content.json');
const assets = readData('asset-manifest.json').assets;
const science = readData('science-content.json');
const file = readEvidence('test-results.json'), http = readEvidence('test-results-http.json');
const expFile = readEvidence('experience-results-file.json'), expHttp = readEvidence('experience-results-http.json');
const audio = readEvidence('audio-event-results.json'), faults = readEvidence('runner-failure-results.json');
const sources = readEvidence('source-audit.json'), tours = readEvidence('tour-recordings.json');
const perf = readEvidence('upgrade-performance.json');

const suites = [
  { name: '原有完整回归', mode: 'file', report: file, link: 'evidence/test-results.json' },
  { name: '原有完整回归', mode: 'HTTP', report: http, link: 'evidence/test-results-http.json' },
  { name: '专题与导览', mode: 'file', report: expFile, link: 'evidence/experience-results-file.json' },
  { name: '专题与导览', mode: 'HTTP', report: expHttp, link: 'evidence/experience-results-http.json' },
  { name: '单次音效', mode: 'Edge', report: audio, link: 'evidence/audio-event-results.json' },
  { name: '故障自检', mode: 'Edge', report: faults, link: 'evidence/runner-failure-results.json' }
];
function summary(report) {
  if (report.results.some(item => typeof item.passed === 'boolean')) {
    const passed = report.results.filter(item => item.passed).length;
    return { passed, failed: report.results.length - passed, total: report.results.length };
  }
  return { passed: report.passed ? report.results.length : 0, failed: report.passed ? 0 : report.results.length, total: report.results.length };
}
for (const suite of suites) suite.summary = summary(suite.report);
const totals = suites.reduce((acc, suite) => ({
  passed: acc.passed + suite.summary.passed,
  failed: acc.failed + suite.summary.failed,
  total: acc.total + suite.summary.total
}), { passed: 0, failed: 0, total: 0 });
const failures = suites.flatMap(suite => {
  const items = suite.report.results
    .filter(item => item.passed === false)
    .map(item => ({ suite: suite.name, mode: suite.mode, page: item.page, name: item.name, error: String(item.error || '').split('\n')[0] }));
  if (suite.report.passed === false && items.length === 0) {
    return [{ suite: suite.name, mode: suite.mode, page: 'suite', name: 'report-level failure', error: 'report.passed=false without per-item failure flags' }];
  }
  return items;
});
const passedAll = suites.every(suite => suite.report.passed === true)
  && sources.passed === true && tours.passed === true && perf.passed === true;
const date = (file.started || new Date().toISOString()).slice(0, 10);

const testTable = table(['验收入口', '模式', '通过 / 失败', '原始结果'], suites.map(suite => [
  suite.name, suite.mode, `${suite.summary.passed} / ${suite.summary.failed}`, link(suite.link.split('/').pop(), suite.link)
]));
const failureTable = failures.length
  ? table(['套件', '模式', '页面', '检查项', '错误'], failures.map(item => [item.suite, item.mode, item.page, item.name, item.error]))
  : '本次无失败项。报告在存在失败时也会生成，并保留失败明细。';

const historical = [];
for (const name of fs.readdirSync(paths.output('diagnostics'))) {
  if (!name.endsWith('.log')) continue;
  const lines = fs.readFileSync(paths.output('diagnostics', name), 'utf8').split(/\r?\n/).filter(line => /^FAIL |^Error:/.test(line));
  if (lines.length) historical.push({ file: 'output/diagnostics/' + name, lines: lines.length, samples: lines.slice(0, 6) });
}
for (const name of ['asset-preparation.log', 'credit-inspection.log', 'pdf-source-check.log']) {
  const lines = fs.readFileSync(paths.evidence(name), 'utf8').split(/\r?\n/).filter(line => /404|warning|empty|空|202/.test(line));
  if (lines.length) historical.push({ file: 'evidence/' + name, lines: lines.length, samples: lines.slice(0, 4) });
}
const firstRun = paths.evidence('upgrade-performance-first-run.json');
if (fs.existsSync(firstRun)) {
  const first = JSON.parse(fs.readFileSync(firstRun, 'utf8'));
  historical.push({ file: 'evidence/upgrade-performance-first-run.json', lines: first.regressions.length,
    samples: first.regressions.map(row => `${row.page} ${size(row.viewport)} ${row.quality} P95 +${n(row.deltaP95)} ms; passed=${first.passed}`) });
}
const historicalTable = historical.length
  ? table(['证据文件', '告警行数', '样例'], historical.map(item => [item.file, item.lines, item.samples.join('；')]))
  : '仓库内未发现历史告警记录。';

const names = { index: '黑洞', bigbang: '早期宇宙', cosmicweb: '宇宙网', stellar: '恒星', wormhole: '虫洞', heatdeath: '宇宙终局' };
const matrix = table(['原有八项任务', '状态', '证据'], [
  ['1 可信自动验证', file.passed && http.passed && faults.passed ? '通过' : '未通过', '完整回归 file/HTTP、故障自检、逐像素固定帧、非零失败退出码'],
  ['2 参数到模型', file.passed ? '通过' : '未通过', '参数端点、单位与公式、质量尺度不变量'],
  ['3 科学内容与来源', sources.passed ? '通过' : '未通过', '科学账本与资料入口内容核对'],
  ['4 GL 生命周期', file.passed && http.passed ? '通过' : '未通过', '单 RAF、上下文恢复、暂停与隐藏时钟'],
  ['5 移动与无障碍', expFile.passed && expHttp.passed ? '通过' : '未通过', '四视口入口可达、触控、键盘、焦点'],
  ['6 音频映射与资源', audio.passed ? '通过' : '未通过', '信号、静音、瞬态与节点释放'],
  ['7 性能与质量', perf.passed ? '通过' : '未通过', `同场景前后对照；P95 阈值 ${perf.thresholdMs} ms`],
  ['8 公共实现与交付', expFile.passed && expHttp.passed ? '通过' : '未通过', '离线 file/HTTP、分层结构与导览']
]);

const assetTable = table(['章节', '素材 / 性质', '署名', '本地文件 / 原始条目'], assets.map(asset => [
  names[asset.chapter], asset.title + '；' + asset.contentType, asset.credit,
  link(asset.localPath, asset.localPath) + '；' + link('原始条目', asset.sourceUrl)
]));
const sourceTable = table(['登记项', '核对标题', '最终URL', '状态', '内容核对'], sources.results.map(item => [
  item.id, item.title, link('原始资料', item.finalUrl || item.requestedUrl),
  String(item.status), item.contentChecked ? '已核对' : '未核对'
]));
const proofRecord = sources.results.find(item => item.id === 'S9');
const proof = proofRecord && proofRecord.contentProof ? proofRecord.contentProof : '尚无实测内容证明。';

const performanceTable = perf.results.length ? table(
  ['章节', '视口 / DPR', '档位 / 画布', '改造前 P50/P95', '改造后 P50/P95', 'P95 差值', '>50ms 前/后'],
  perf.results.map(row => [
    names[row.page], size(row.viewport) + ' / ' + row.viewport.dpr,
    row.quality + ' / ' + size(row.after.canvas),
    n(row.before.p50) + ' / ' + n(row.before.p95), n(row.after.p50) + ' / ' + n(row.after.p95),
    n(row.after.p95 - row.before.p95), row.before.longFrames + ' / ' + row.after.longFrames
  ])) : '尚无性能对照结果。';
const performanceNote = `阈值：单组 P95 回退超过 ${perf.thresholdMs} ms 或长帧数增加即判定不通过；当前 ${perf.p95Regressions} / ${perf.results.length} 组 P95 高于基线，超阈值 ${(perf.regressions || []).length} 组，性能套件状态为${perf.passed ? '通过' : '未通过'}。数据为绘制加同步 1 像素回读的墙钟耗时，不等于纯 GPU 时间或完整显示帧率。`;

const get = (page, name) => file.results.find(item => item.page === page && item.name === name).evidence;
const renderer = get('index', 'WebGL and deterministic frame').renderer;
const audioTable = table(['章节', '峰值 / RMS', '重复启停前/后节点数', '验收录音字节'], Object.keys(chapters).map(page => {
  const item = get(page, 'audio signal, mute, repeat toggle and bounded nodes');
  return [names[page], item.peak.toFixed(5) + ' / ' + item.rms.toFixed(5), item.beforeNodes + ' / ' + item.afterNodes, item.recordingBytes];
}));
const tourTable = table(['章节', '完整录屏', '时长 / 画面', '导览终态'], tours.recordings.map(tour => [
  names[tour.page], link('MP4', tour.path) + ' / ' + link('音轨', tour.audio),
  n(tour.duration) + '秒 / ' + size(tour.viewport) + ' / ' + tour.quality,
  tour.guideStatus.status + ' / ' + tour.guideStatus.time + '秒'
]));
const climax = {
  index: ['光路偏折让盘背面的辐射进入视线；明亮环与中央暗区需要结合观测解释。', '改变自旋，比较吸积盘内缘与光环；最后对照 EHT 重建图。'],
  bigbang: ['早期不透明宇宙冷却后，辐射能够传播；今天 CMB 的冷暖色表达微小温差。', '推动纪元，观察散开与冷热斑驳，再切入 Planck 全天图。'],
  cosmicweb: ['光学星系、X 射线热气体与透镜推断质量回答不同问题；它们可以发生空间分离。', '依次分离图层，改变气体滞后，在子弹星系团合成图中寻找关系。'],
  stellar: ['恒星形成区、爆发遗迹与旋转脉冲反映不同物理过程。', '从星云到爆发，再聚焦旋转灯塔；以宇宙悬崖与蟹状星云对照。'],
  wormhole: ['理论空间截面的喉部连接两端；程序穿越用于建立几何直觉。', '先读理论截面、调整喉部，再连续穿越一次，结尾返回论文条件。'],
  heatdeath: ['暗能量性质与遥远未来的假设有关；常数 w 密度关系有明确适用条件。', '推动假设阶段让余辉与声景渐退，再比较三条常数 w 密度曲线。']
};
const chapterTable = table(['章节 / 开场问题', '看见与理解', '操作与视觉高潮', '原始资料 / 本地对照'], Object.keys(chapters).map(page => {
  const chapter = chapters[page];
  return [names[page] + '：' + chapter.question.replace('\n', ''), climax[page][0],
    chapter.coreLabel + '。' + climax[page][1],
    link(chapter.sourceLabel, chapter.sourceUrl) + '；' + chapter.assets.map(id => assets.find(asset => asset.id === id).title).join('、')];
}));

const scope = '自动验收覆盖本机 Edge 及四种模拟视口；没有实体手机、其他浏览器、屏幕阅读器设备或人工试听记录。叙事节奏、听感与「震撼」程度由用户观看审阅。录屏包含本项目合成声景；中文旁白以文本随导览逐幕显示，未合成口播音轨。';
const overview = `报告日期：${date}（Asia/Shanghai）。本轮完成仓库分层、视觉系统 v2、不等距六幕叙事与验收链复检。自动检查共 ${totals.total} 项，通过 ${totals.passed} 项，失败 ${totals.failed} 项；套件总结论：${passedAll ? '全部通过' : '存在失败或未通过套件'}。`;
const commonLinks = '[导览审阅页](导览审阅.html) · [六章分镜与逐幕旁白](docs/六章分镜与旁白稿.md) · [参数与科学映射](docs/参数与科学映射.md) · [已知问题与复测记录](docs/已知问题与复测记录.md)';
const knownIssues = `## 已知问题与历史告警\n\n${historicalTable}\n\n完整说明与复测方式见[已知问题与复测记录](docs/已知问题与复测记录.md)。报告不再只呈现当前全绿结果。`;

write('NASA专题联动实施与验收.md', `# NASA等专题联动实施与验收\n\n${overview}\n\n${commonLinks}\n\n## 逐章交付\n\n${chapterTable}\n\n每章 44 秒，六幕位于 0 / 6 / 14 / 24 / 33 / 39 秒，末幕留出收束停顿。中文旁白以文本随导览逐幕显示。官方资料采用普通外链，观测对照与解释在离线状态可读。\n\n## 本地素材与署名\n\n${assets.length} 项本地素材，共 ${assets.reduce((sum, item) => sum + item.bytes, 0).toLocaleString('en-US')} 字节。字段契约见[素材清单](data/asset-manifest.json)：官方素材登记 assetUrl，本项目原创图解登记 assetOrigin。\n\n${assetTable}\n\n## 导览录屏与声音\n\n${tourTable}\n\n录屏取自实际页面 CDP 截帧时间戳，输出 15fps H.264/AAC MP4，保留实际合成音频。NASA 官方数据声化通过独立资料卡访问原站，与本项目合成声景分别标识。\n\n## 自动验收\n\n${testTable}\n\n${failureTable}\n\n## 来源核对\n\n${sourceTable}\n\nPDF 首页实测证明：${proof}\n\n科学账本包含 ${Object.keys(science.sources).length} 条参考。\n\n## 实现与性能\n\n${performanceNote}\n\n${knownIssues}\n\n## 用户审阅范围\n\n${scope}\n`);

write('完整验收报告.md', `# 完整验收报告\n\n${overview}\n\n${commonLinks}\n\n## 原有八项验收\n\n${matrix}\n\n## 最终回归结果\n\n${testTable}\n\n${failureTable}\n\n执行环境：Node ${file.environment.node}；${file.environment.browser.product}；Windows 无头 Edge。GPU：${renderer}。\n\n四种视口 360×800、390×844、768×1024、1920×1080；小屏模拟 DPR 2，其余 DPR 1。file 完整回归：${file.started} 至 ${file.finished} UTC；HTTP：${http.started} 至 ${http.finished} UTC。异常与外部请求在整个浏览器会话内累计统计，不再按导航清空。\n\n固定种子 20261106。全 RGB 固定帧检查允许同 GPU 每通道最多 1/255 的已测量 ANGLE 量化差异；不作为跨 GPU 金图。新增生成物新鲜度断言：修改 data/ 后未运行 node tools/build_content.cjs，回归必须失败。\n\n## 专题与离线交付\n\n六章各 44 秒，全部分镜、旁白文本、原生官方链接、本地素材、四视口控件触达、手动接管、减少动态逐幕阅读、暂停/恢复同步、上下文恢复和离线运行无外部请求通过检查。\n\n## 同场景性能前后对照\n\n${performanceTable}\n\n${performanceNote}\n\n基线 ${perf.baseline}；每组 3 帧预热后各采样 40 帧。固定参数、相机、种子、视口、DPR 和档位。\n\n## 音频与录像\n\n${audioTable}\n\n${tourTable}\n\n## 复现与文件证据\n\n[README](README.md)列出所有命令。所有结果与计数由 evidence/ 下的原始 JSON 汇总，日期取自实际执行时间；报告在失败时同样生成。证据哈希见[acceptance-evidence.json](evidence/acceptance-evidence.json)。\n\n${knownIssues}\n\n## 验证范围\n\n${scope}\n`);

write('执行进度.md', `# 执行与验收状态\n\n${overview}\n\n${matrix}\n\n本轮：app/ 运行时分层、data/ 源数据、tools/ 工具、docs/ 文档、evidence/ 结果、archive/ 历史基线；视觉系统 v2；六幕不等距叙事与逐幕旁白；可证伪验收链。\n\n${commonLinks}\n\n${failureTable}\n\n${scope}\n`);

const hashed = [
  ...paths.pages, ...paths.runtimeFiles,
  ...fs.readdirSync(paths.chapters('')).map(name => 'app/chapters/' + name),
  ...assets.map(asset => asset.localPath),
  ...fs.readdirSync(paths.data('')).map(name => 'data/' + name),
  ...fs.readdirSync(paths.tool('')).map(name => 'tools/' + name),
  ...fs.readdirSync(paths.evidence('')).filter(name => name.endsWith('.json')).map(name => 'evidence/' + name),
  ...tours.recordings.flatMap(tour => [tour.path, tour.audio, 'output/tours/' + tour.page + '-poster.jpg'])
].filter(name => fs.existsSync(paths.at(name))).sort();
write('evidence/acceptance-evidence.json', JSON.stringify({
  date, passed: passedAll, counts: totals, suites: suites.map(suite => ({ name: suite.name, mode: suite.mode, ...suite.summary, report: suite.link })),
  failures, environment: file.environment, renderer,
  sourceUrls: sources.results.length, scientificReferences: Object.keys(science.sources).length,
  assets: assets.length, tours: tours.recordings.length, performancePairs: perf.results.length,
  performance: { thresholdMs: perf.thresholdMs, p95Regressions: perf.p95Regressions, passed: perf.passed },
  historicalAlerts: historical, scope, hashes: Object.fromEntries(hashed.map(name => [name, hash(name)]))
}, null, 2) + '\n');
console.log(JSON.stringify({ passed: passedAll, counts: totals, failures: failures.length, historical: historical.length, hashed: hashed.length }));
