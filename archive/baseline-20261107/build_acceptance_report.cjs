const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=__dirname,read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const file=read('test-results.json'),http=read('test-results-http.json'),failures=read('runner-failure-results.json'),before=read('benchmark-before.json');
const audioEvents=read('audio-event-results.json');assert.equal(audioEvents.passed,true);assert.equal(audioEvents.results.length,3);
for(const report of [file,http]){assert.equal(report.passed,true,'Acceptance has failures');assert.equal(report.profile,'full','Core results cannot certify full acceptance');assert.equal(report.counts.failed,0);}
assert.equal(failures.passed,true);assert.equal(before.results.length,12);
const sourceFiles=['runtime.js','common.js','math.js','base.css','common.css','acceptance-manifest.json','science-content.json','verify_all_pages.js','test-support.cjs','verify_failure_paths.cjs','verify_audio_events.cjs','benchmark_before.cjs',...Object.keys(require('./acceptance-manifest.json')).flatMap(p=>[p+'.html','chapters/'+p+'.js'])];
const hashes=Object.fromEntries(sourceFiles.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
const get=(page,name)=>file.results.find(r=>r.page===page&&r.name===name)?.evidence;
const rows=[];for(const old of before.results){
 const timings=get(old.page,'measured GPU performance at desktop and phone viewport'),matches=timings.filter(t=>t.viewport.width===old.viewport.width),high=matches.find(t=>t.quality==='high'),low=matches.find(t=>t.quality==='low');assert.ok(high&&low);
 rows.push({page:old.page,viewport:old.viewport,before:old,high,low});
}
const names={index:'黑洞',bigbang:'早期宇宙',cosmicweb:'宇宙网',stellar:'恒星',wormhole:'虫洞',heatdeath:'终局'};
const renderer=get('index','WebGL and deterministic frame').renderer;
const matrices=[
 ['1 可信自动验证','通过','两套完整回归、非零退出、三种测试器故障、自有临时profile清理；种子和逐像素校验'],
 ['2 参数到模型','通过','18项最小/默认/最大值；高/低档有效性；质量尺度不变性；w边界分类；参数映射文档'],
 ['3 科学内容与来源','通过','11条官方/原始来源、单位/年份/条件/代码账本；经验模型和预设标识；原生MathML'],
 ['4 GL生命周期','通过','六页无上下文/编译/链接故障；每页三次原位恢复，资源数和参数稳定；单RAF'],
 ['5 移动与无障碍','通过','六页四视口；拖动/双指缩放/取消/键盘；全部主要控件可触达；弹窗、标签与HUD恢复'],
 ['6 音频映射与资源','通过','实际合成输出RMS/峰值、统一静音、六章录音、启停复用、节点上限；脉冲时间调度与扫描输入响应'],
 ['7 性能与质量','通过','前后基准、P50/P95/长帧、GPU与画布尺寸；三档预算、自动升降迟滞、减少动态和隐藏时钟'],
 ['8 公共实现与交付','通过','共享runtime/math/common/CSS；章节独立绘制；文件和HTTP离线运行；README和回归入口']
];
const table=(headers,rows)=>'| '+headers.join(' | ')+' |\n| '+headers.map(()=> '---').join(' | ')+' |\n'+rows.map(row=>'| '+row.join(' | ')+' |').join('\n');
const n=value=>value.toFixed(2),size=value=>value.width+'×'+value.height;
const performance=table(['章节','视口 / DPR','旧版画布','当前高档 / 低档画布','旧版P50/P95 ms','当前高档P50/P95 ms','当前低档P50/P95 ms'],rows.map(r=>[names[r.page],size(r.viewport)+' / '+(r.viewport.width<500?2:1),size(r.before.canvas),size(r.high.canvas)+' / '+size(r.low.canvas),n(r.before.p50)+' / '+n(r.before.p95),n(r.high.p50)+' / '+n(r.high.p95),n(r.low.p50)+' / '+n(r.low.p95)]));
const audio=table(['章节','峰值','最大RMS','录音字节','关闭后节点数 / 重复8次后'],Object.keys(names).map(page=>{const a=get(page,'audio signal, mute, repeat toggle and bounded nodes');return[names[page],a.peak.toFixed(5),a.rms.toFixed(5),a.recordingBytes,a.beforeNodes+' / '+a.afterNodes];}));
const report=`# 完整验收报告

验收日期：2026-11-06（Asia/Shanghai）。八项软件整改已完成；文件直开完整验收${file.counts.passed}项通过、0失败，本地HTTP完整验收${http.counts.passed}项通过、0失败；测试器故障自检3项、单次音效专项3项通过。此结论限定于下述实际环境和证据。

## 验收矩阵

${table(['任务','结果','完成内容及证据'],matrices)}

## 执行环境与可重现入口

- Node：${file.environment.node}；浏览器：${file.environment.browser.product}；Windows无头Edge。
- GPU：${renderer}。
- 视口：360×800、390×844、768×1024、1920×1080；小屏模拟DPR 2，其余DPR 1。性能另测1280×720。
- 文件模式：${file.started} 至 ${file.finished}（UTC）；HTTP模式：${http.started} 至 ${http.finished}（UTC）。
- 命令：README中的四条验收入口；完整profile为full。所有断言、失败记录和具体测量见test-results.json、test-results-http.json、runner-failure-results.json、audio-event-results.json。
- 当前测试源文件SHA-256和报告摘要存于acceptance-evidence.json；运行build_acceptance_report.cjs时强制校验两套完整报告通过。

固定随机种子20261106，固定采样秒数2。采样覆盖全部RGB像素，记录精确哈希；在当前ANGLE后端观察到首次采样偶发3个像素通道相差1级，因此同时使用严格数值判定：任一通道差≤1/255、变化像素比例≤0.01%。这允许已测量的量化噪声，显著画面变化仍会失败，不作为跨GPU金图。每次导航等待新文档，避免将旧页面的ready状态当成重载完成。

## 性能前后数据

${performance}

当前高档的同步耗时在部分章节高于旧版，本报告保留这一结果；本次性能验收确认的是测量可复现、分档预算生效和低档可降低当前高档负载，不认定所有章节或所有档位都已加速。

每组24帧，墙钟测量绘制加单像素同步回读完成屏障；含驱动同步和回读开销，不是纯GPU定时器，也不是浏览器完整呈现帧率。超过50 ms的样本计数在原始JSON中。旧版来自保留快照.backup-20261106，关闭其独立RAF后以固定时间调用原始队列；当前版使用同样的默认相机/种子/场景。旧版不处理DPR，因此小屏画布与当前高档不同；表中同时列出尺寸，不将其作为等像素加速比。粒子和光线预算属于明确可复测的资源缩减。

自动降档持续窗口1.8秒、冷却3.5秒；恢复升档需要12秒稳定和冷却。测试覆盖降档、保持、升档和60 Hz正常帧间隔下的恢复条件。隐藏生命周期通过确定性的document.hidden/visibilitychange注入验证；RAF待执行集合由浏览器端包装计数，重复resume只保持一个主回调。

## 音频证据

${audio}

六章均实际录制WebM；统一音量0时后级峰值低于测试阈值，反复切换8次上下文数量不增长。恒星页10/40 Hz调度误差和预调度范围见JSON；扫描纯函数测试包含相同输入重复、Y改变音高和扫描范围外不触发。补充的audio-event-results.json验证啁啾、穿越和重生三种单次音效：静音有效、重复播放有输出、瞬态节点归零、仅单次音效时暂停/恢复仍正常。共享输出节点受保护，短音结束不会断开公共输出链。

## 产物和人工复核

- output/acceptance/file 与 http：每章390/1920宽截图及六段WebM录音。四视口的逐控件可触达证据在JSON中。
- 参数与科学映射.md：18项控件的状态、公式、单位、不变量、声音和HUD。
- science-content.json：11条来源和关键声明；网页发表时间不明时保留null，演示预设无伪造来源。
- 截图已复核小屏折叠面板、工具栏、导航滚动和桌面结构；粒子过曝已修正，宇宙网纤维和终局星系结构可辨。
- README.md：运行依赖、交互、模块结构、画质、测试命令和模型范围。

## 验证边界

已完成的是本机Edge环境下的软件功能、渲染、音频信号、性能预算及模拟触控验收。没有实体手机、其他浏览器、屏幕阅读器设备的实际测试记录；音频已测量并录制，人工试听未执行。因此不声称真实移动GPU性能、人工听感、跨浏览器兼容性或普遍60 FPS已通过。严格科研数值求解和官方数据导入仍属于原审阅界定的独立升级课题，不混入本次科普演示验收。
`;
fs.writeFileSync(path.join(root,'完整验收报告.md'),report,'utf8');
fs.writeFileSync(path.join(root,'执行进度.md'),`# 八项整改与验收状态\n\n2026-11-06：八项软件整改完成，文件模式${file.counts.passed}项和HTTP模式${http.counts.passed}项完整回归全部通过，故障自检3项通过。\n\n${table(['任务','结果','证据'],matrices)}\n\n详细数据、截图/录音索引及验证边界见[完整验收报告](完整验收报告.md)。旧版部分完成记录已被本次结果替代。实体手机、其他浏览器、屏幕阅读器及人工试听没有执行记录，不计作已通过。\n`,'utf8');
fs.writeFileSync(path.join(root,'acceptance-evidence.json'),JSON.stringify({date:'2026-11-06',passed:true,reports:{file:file.counts,http:http.counts,runnerFaults:failures.results.length,audioEvents:audioEvents.results.length},sourceSHA256:hashes,performance:rows},null,2)+'\n','utf8');
console.log(JSON.stringify({file:file.counts,http:http.counts,runnerFaults:failures.results.length,hashes:sourceFiles.length}));
