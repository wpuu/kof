# C05｜P0-013 GGRS 同帧一致性与丢包压力试验施工记录

日期：2026-10-28（北京时间）。这是执行证据和失败记录，**不是已通过的商用验收**。

## 1. 接管的实际失败结果

[上轮真实 GGRS 两浏览器同帧测试 #40625225372](https://github.com/wpuu/kof/actions/runs/40625225372) 最终为 **FAIL**。失败发生在浏览器资源请求 HTTP 404 的错误门禁，然而同一日志保留了两个独立 Chrome 都已进入游戏、且第 150、180、210 帧的两名玩家量化位置/速度完全一致的记录；两位玩家都做了键盘操作。

**处理原则：**不能简单因为两端位置相同就把整个测试记为 PASS；必须确认 404 是否影响必需资源，区分无关 favicon 与缺失 WASM/JS/字体/场景文件。

## 2. 本轮已提交的实际代码

1. [matchbox_same_frame_web_smoke.mjs](../../lab/matchbox_same_frame_web_smoke.mjs) 的资源诊断加强：捕获所有 HTTP status ≥400 的路径（不记录 query/ICE/SDP），对 JS、WASM、字体等请求失败单独报告；只有 `/favicon.ico` 的 404 可以作为无关错误忽略。
2. [matchbox_official_index.html](../../lab/matchbox_official_index.html) 添加 `data:,` favicon，避免 Chrome 反复请求不相关图标。
3. [matchbox_impairment_web_smoke.mjs](../../lab/matchbox_impairment_web_smoke.mjs) 添加**真实 WebRTC DataChannel.send** 的受控发送延迟/丢弃：仅拦截 `ordered=false && maxRetransmits=0` 的不可靠频道，在双方完成加入游戏之后激活；为避免共享 WASM 复用缓冲导致数据篡改，延迟发送前拷贝独立的 Uint8Array；实际丢包数和延迟发送数都作为验收前提，不能只设置环境变量就声称施加了故障。
4. [p0-013-impairment.yml](../../.github/workflows/p0-013-impairment.yml) 复用同一锁定 Matchbox SHA 的临时 Rust 编译与自建信令服务器，顺序测试 `(0ms,0丢)`、`(45ms,4连丢)`、`(90ms,4连丢)`、`(90ms,5连丢)`，任何一项同帧不一致都会保留红灯；**不把 SAFE_VOID 当作流畅胜利**。
5. [p0-fast-browser-preflight.yml](../../.github/workflows/p0-fast-browser-preflight.yml) 独立快速语法预检，避免在耗时 Rust/WASM 编译之后才发现 JavaScript 测试脚本语法错误。

## 3. 已完成的预检与尚未回收的主试验

- **已通过：**[快速 Node.js 测试脚本语法 CI #40673806563](https://github.com/wpuu/kof/actions/runs/40673806563)。
- **待结果：**[修改后的同帧 GGRS 游戏验证 #40673217294](https://github.com/wpuu/kof/actions/runs/40673217294)（或同一修复的后续已完成运行，以最新完成记录为准）。
- **待结果：**[GGRS 真实 WebRTC 故障注入 #40673476167](https://github.com/wpuu/kof/actions/runs/40673476167)。
- [官方纯净网页示例 #40623334349](https://github.com/wpuu/kof/actions/runs/40623334349) 此前已经通过双端加入房间，但无法单独证明高延迟丢包下同帧一致。

## 4. 必须保持的边界

- 上游 Matchbox `9ed2495cd48c007f7a19e95dd5fcd64434b4879a` 及 Bevy/GGRS 示例只在临时 CI runner 改造，不向原仓库写入，不使用第三方受限游戏 ROM。
- 此测试为同一台 GitHub runner 的两个 Chrome 进程，模拟的“发送延迟”不同于实际 RTT，连续包丢失也不代表移动运营商真实丢包分布。
- 比较的状态只是原演示的两位玩家量化位置/速度，不覆盖完整格斗碰撞、音效、打击、命中冻结、作弊防护和可信成绩。
- 没有 Windows+华为+iPhone 真机异网数据，**不能断言明显优于 Kawaks 1.45**。
- 本轮结论只以最终 CI 原文为准，任何测试失败都要按可复现问题记录与修复，不把红灯变绿灯靠放宽真正必要的验收条件。

对应任务：[GitHub Issue #7](https://github.com/wpuu/kof/issues/7)。
