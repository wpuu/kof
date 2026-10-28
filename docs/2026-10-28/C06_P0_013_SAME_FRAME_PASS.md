# C06｜GGRS＋Matchbox 真双端输入后的同帧状态一致性验收

日期：2026-10-28（北京时间）｜阶段：P0-013A/B｜状态：**通过受控同机双 Chrome 端到端验收，不是实网/真机或完整格斗引擎验收**。

## 核验事实

[GitHub Actions #40674697739](https://github.com/wpuu/kof/actions/runs/40674697739) **SUCCESS**。

- 锁定官方 Matchbox 上游源代码 `9ed2495cd48c007f7a19e95dd5fcd64434b4879a`，采用其 Bevy 0.19＋bevy_ggrs 0.22＋Matchbox 0.15 的官方 `examples/bevy_ggrs` 样例；只在 CI 临时 clone 注入按玩家 handle 排序的状态日志。
- Rust 正式优化 WASM、绑定文件与 Matchbox 自托管信令在 GitHub 临时 Ubuntu runner 中运行；两个独立 Chrome 进程加入同一 GGRS 游戏。
- 向 P1、P2 分别发送真实 Playwright 键盘动作；两名玩家的运动均通过了“相对按键前位置变化阈值”检查。
- 双端读取到的指定模拟帧 **180** 位置/速度序列完全一致（量化精度 1/10,000 世界单位）。
- 样本：`P1=(x:20725,z:0,vx:172,vz:0)`；`P2=(x:-12500,z:-13744,vx:0,vz:-49)`。同帧的两浏览器字符串记录一致；这是 demo 的量化运动状态，不是完整 KOF 碰撞、血量、招式/音频哈希。

## 实际解决的旧失败

前面数次 CI [#40625225372](https://github.com/wpuu/kof/actions/runs/40625225372)、[#40673217294](https://github.com/wpuu/kof/actions/runs/40673217294) 等已看到双端相同帧的运动状态，但 HTTP 404 门禁将其判为 FAIL。

后续通过工具日志定位唯一资源错误路径：
`/assets/fonts/quicksand-light.ttf.meta`。

严格处理：
- 测试增加精确 HTTP 状态/路径记录，不采集原始 SDP/ICE。
- 双端必须真正确认 `/assets/fonts/quicksand-light.ttf` 已以 HTTP 2xx 载入；
- 在此前提下仅忽略同一路径的可选 `.meta` 404（本次每浏览器 1 次）；**不允许忽略任何其他必需 WASM/JS/字体/资源 404**。
- 新 CI 显示：`fontLoaded=[true,true]`，`ignoredOptionalFontMeta404=2`，`otherErrors=0`，所有真实 JS page errors 为空。
- 不把“藏掉所有 404”作为修复策略。

## 代码及重复执行入口

- [GGRS 双端状态跟踪补丁](../../lab/patch_matchbox_state_probe.mjs)
- [双浏览器输入与同帧比对](../../lab/matchbox_same_frame_web_smoke.mjs)
- [已通过的自动化 CI 配置](../../.github/workflows/p0-013-same-frame.yml)
- [快速语法预检](../../.github/workflows/p0-fast-browser-preflight.yml)

## 明确没有通过或没有测试的项目

- 本次不含人工延迟、抖动、丢包，也未验证异网 NAT、TURN、跨运营商 P2P、华为 Android Chrome 与 iPhone Safari。
- 官方示例使用浮点位置/速度并调用 `powf` 等；同一架构的双 Chrome 一致，不等于跨不同 CPU 与浏览器都确定性。
- 不含 60FPS 格斗碰撞/格挡/连招及输入到画面的 p95 时延，也未和 Kawaks 1.45 做真实设备同场对照。
- [P0-013 延迟＋连续丢包测试](https://github.com/wpuu/kof/actions/runs/40674731228) 是独立验收；完成前不得宣称它也 PASS。
- 不含 KOF ROM/受保护素材，不解决在线游戏付费运营或有价天数竞猜合规。

## 接续

优先回收 P0-013C 的延迟＋丢包 CI，分析“丢包确实发生、双方都接收到按键并真正运动、同帧状态确实一致”三个条件。若高延迟下有一方未运动，必须先用 Rust 测试端输入日志和浏览器焦点诊断明确成因，不能用双方坐标相同掩盖未运行的玩家操作。

最终判断：**原型 GGRS 同机双人真实输入后状态一致性基线 PASS；达到明显优于 Kawaks 1.45 的产品级联网手感仍未验证。**
