# 研究宇宙的秘密

六章原生 WebGL / Web Audio 科普交互演示：[黑洞](index.html)、[早期宇宙](bigbang.html)、[宇宙网](cosmicweb.html)、[恒星](stellar.html)、[假想虫洞](wormhole.html)、[宇宙终局](heatdeath.html)。双击 `index.html` 即可运行，也可通过静态 HTTP 服务器访问；页面无需 Node、安装包、联网或前端构建，正文与 MathML 公式离线可读。先看[导览审阅页](导览审阅.html)。

## 仓库结构

| 目录 / 文件 | 职责 |
| --- | --- |
| 六个章节 HTML、`导览审阅.html` | 交付入口；`file://` 相对引用 `app/` |
| `app/` | 运行时：`runtime.js`、`math.js`、`common.js`、`content.js`（生成物）、`experience.js`；`styles/` 含 `base`、`common`、`experience`、`design`；`chapters/` 六章模型；`assets/` 观测图与理论图解 |
| `data/` | 唯一内容源：`chapter-content.json`、`voiceover.json`、`science-content.json`、`asset-manifest.json`、`math-conversion.json`、`acceptance-manifest.json` |
| `tools/` | 生成与验收脚本；`paths.cjs` 是唯一路径来源，`content-source.cjs` 是唯一内容生成逻辑 |
| `docs/` | 审核提示词、[参数与科学映射](docs/参数与科学映射.md)、[分镜与逐幕旁白](docs/六章分镜与旁白稿.md)、[已知问题与复测记录](docs/已知问题与复测记录.md)、[复检与整改报告](docs/复检与整改报告.md) |
| `evidence/` | 结果 JSON 与执行日志；报告中的计数由这些原始文件汇总 |
| `output/` | 验收截图、导览录屏、来源快照等生成物 |
| `archive/` | 历史性能基线 `baseline-20261106`、`baseline-20261107` 与本轮工作前快照 `work-20261107`；其中的 `maintenance/` 为一次性调试脚本，不参与交付 |
| 根目录三份报告 | [完整验收报告](完整验收报告.md)、[NASA专题联动实施与验收](NASA专题联动实施与验收.md)、[执行进度](执行进度.md)，由 `tools/build_acceptance_report.cjs` 生成 |

`node tools/build_content.cjs` 是**单向生成**：`data/` → `app/content.js` + `docs/六章分镜与旁白稿.md`，不回写 HTML、章节脚本或科学账本。修改源数据后必须重跑；完整回归与体验专项都有生成物新鲜度断言，忘记重跑会直接失败。

## 视觉与叙事

`app/styles/design.css` 是视觉系统 v2：统一的深空底色、章节强调色光晕、衬线开场问题、细线导航、字幕式导览条、六个可见幕点，以及左右分栏的观测对照构图。六页只保留章节特有的 GLSL 与内联配色，公共外观由 `app/styles/` 统一驱动；减少动态模式由 `prefers-reduced-motion` 与工具栏共同控制。

每章导览 44 秒，六幕不等距：0 / 6 / 14 / 24 / 33 / 39 秒，对应「钩子 → 建立 → 变量 → 揭示 → 对照 → 收束」，末幕留出收束停顿。`data/voiceover.json` 的逐幕旁白由生成链注入 `content.js`，并在导览字幕条中真正显示；中文旁白为文本，未合成口播音轨。镜头、参数、字幕、旁白与幕点共用现有主 RAF 时钟。

## 操作

拖动旋转，双指或滚轮缩放；聚焦场景后方向键旋转、加减键缩放。H 隐藏/恢复 HUD；触屏可用独立「恢复控制界面」按钮。小屏面板可折叠和滚动。弹窗支持 Tab 焦点约束、Escape 关闭和焦点返回。

工具栏提供画质、统一音量、减少动态和暂停。音频由用户操作启动。减少动态冻结着色器时间，停止相机自动旋转、导演模式和自动演进；穿越直接完成状态切换。隐藏或暂停时停止动画时钟、挂起音频；恢复不会补算后台经过的时间。

「开始 44 秒导览」让镜头、参数、字幕与旁白共同推进；「下一幕」逐段跳转，「自由探索」退出导览。手动拖动核心滑块或操作相机会接管导览。开启减少动态后改为逐幕阅读。「打开观测对照」提供本地影像、图层解释、完整署名及原始发布页面；NASA 官方声化在独立资料卡中链接原站播放。

## 模型范围

观测对照层使用本地收录的官方发布图像，按原始说明标识观测重建、波段合成和质量推断。程序渲染层使用经验模型，未将观测图像作为已标定的模拟输出，也没有导入星表或官方音轨。黑洞和虫洞未实现 RK4 克尔或 Morris–Thorne 测地线积分；多光谱按钮提供示意配色。恒星阶段是教学形态拼接，质量只改变示意尺度。终局的常数 w 密度公式有明确假设，视觉大小映射不代表弗里德曼方程积分。质子衰变和重生是可选假设情景。

18 项参数的公式、单位和声画/HUD 关系见[参数与科学映射](docs/参数与科学映射.md)；12 项官方资料或原始论文的 URL、年份、条件和代码符号见[科学来源账本](data/science-content.json)；素材处理、署名和本地文件哈希见[asset-manifest.json](data/asset-manifest.json)，17 个资料入口的内容核对结果见[source-audit.json](evidence/source-audit.json)。没有明确日期的网页保留空年份。

## 画质与性能

| 档位 | 像素上限 | 分辨率倍率 | 粒子比例 | 光线步进上限 |
| --- | ---: | ---: | ---: | ---: |
| 低 | 600,000 | 0.6 | 35% | 56 |
| 中 | 1,200,000 | 0.8 | 65% | 96 |
| 高 | 2,100,000 | 1.0 | 100% | 140 |

DPR 上限 2，倍率后仍受总像素预算约束。虫洞着色器的固定循环上限为 90 步。自动模式观测提交耗时和帧间隔的较大值：持续超过 28 ms 约 1.8 秒且满足 3.5 秒冷却后降档；持续低于 20 ms 约 12 秒且满足 12 秒冷却后升档。手动档立即生效并保存偏好。

性能验收采用明确阈值：单组 P95 回退超过 1.0 ms 或长帧数增加即不通过。前后对照在 3 帧预热后各采样 40 帧，固定种子、参数、相机、视口、DPR 和质量档，以单像素同步回读确认渲染完成。报告墙钟 P50/P95 和超过 50 ms 的样本数；结果包含同步开销，不能当作纯 GPU 计时或完整显示帧率。

## 全局约束：禁止防御性编程

项目约定保持为：遵循已确定的数据结构和运行前提，使用清晰、直接、可追踪的执行路径；禁止无依据的空值判断、层层可选链、静默 `catch`、通用兜底文案、伪造默认数据和不相干来源切换。`tools/verify_experience.cjs` 保留对 `app/experience.js` 的源码断言（禁止额外动画循环与投机性兜底）。错误保留具体诊断，由验收脚本捕获并如实报告；应用不通过静默降级制造假成功。故障自检覆盖浏览器启动失败、无效导航、着色器失败和生成物漂移，验证的是「失败可被发现且退出码非零」。

## 开发验收

要求 Node.js 22+（全局 WebSocket）和 Chromium 浏览器，无 npm 依赖。浏览器路径由 `EDGE_PATH` / `CHROME_PATH` 指定，或由 `tools/paths.cjs` 在标准安装位置查找；FFmpeg 由 `FFMPEG_EXE` 指定，或自动定位 imageio-ffmpeg。`python tools/verify_pdf_source.py` 只校验已保存的 PDF 首页文本，不依赖 pypdf；重新提取 PDF 首页才需要 pypdf 与 PyMuPDF。

```powershell
node tools/build_content.cjs
node tools/format_math.cjs
node tools/verify_all_pages.js
node tools/verify_experience.cjs
$env:TEST_USE_HTTP = '1'
node tools/verify_all_pages.js
node tools/verify_experience.cjs
Remove-Item Env:TEST_USE_HTTP
node tools/verify_failure_paths.cjs
node tools/verify_audio_events.cjs
node tools/benchmark_upgrade.cjs
# 可选：联网核对资料；之后必须重跑 PDF 首页实测脚本，再生成报告
node tools/audit_sources.cjs
python tools/verify_pdf_source.py
node tools/record_tours.cjs
node tools/build_review.cjs
node tools/build_acceptance_report.cjs
```

`TEST_CORE=1` 跳过音频信号、录音和性能基准，不能替代完整验收。`TEST_REPORT` 指定报告路径；`TEST_FAULT=shader/navigation/stale` 供测试器自检使用。异常也生成 JSON，失败退出码为 1；`tools/build_acceptance_report.cjs` 在存在失败时同样生成报告并列出失败明细，计数与日期全部由 `evidence/` 原始数据推导。每章使用独立浏览器/profile，结束时清理。

报告为 `evidence/test-results.json` 和 `evidence/test-results-http.json`；自检为 `evidence/runner-failure-results.json`。截图和六章 WebM 录音在 `output/acceptance/file` 及 `http`。覆盖 18 项参数的最小/默认/最大值及高低档效果、全部阶段、四种视口、Pointer 拖动/双指缩放/取消、键盘与弹窗、三次上下文恢复、音频启停/静音/调度和画质迟滞。固定帧比较全部 RGB 像素，容忍同 GPU 少量 1/255 量化差异，不使用跨 GPU 金图。异常与外部请求在整个浏览器会话内累计，不再按导航清空。

专题升级前后对照运行 `node tools/benchmark_upgrade.cjs`，基线为 `archive/baseline-20261107`；更早的历史基准入口为 `tools/benchmark_before.cjs`。`node tools/audit_sources.cjs` 联网核对资料页面；`TOUR_PAGE=wormhole` 可重录单章。`node tools/build_review.cjs` 生成视频海报和审阅页。素材处理和视频编码仅用于开发交付，网站运行不依赖这些工具。

## 验证范围

自动验收覆盖本机 Edge 及四种模拟视口；没有实体手机、其他浏览器、屏幕阅读器设备或人工试听记录。叙事节奏、听感与「震撼」程度由用户观看审阅。中文旁白以文本随导览逐幕显示，未合成口播音轨。历史告警、已知限制与复测方式见[已知问题与复测记录](docs/已知问题与复测记录.md)；本轮整改明细见[复检与整改报告](docs/复检与整改报告.md)。
