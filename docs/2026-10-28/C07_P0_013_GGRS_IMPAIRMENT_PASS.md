# C07｜P0-013 GGRS 双端实际输入＋模拟延迟与连续丢包：四组通过

日期：2026-10-28（北京时间）｜状态：**四个受控同机浏览器实测场景 PASS；尚不足以证明现实互联网电竞级流畅度**。

## 核验入口

[真实 GitHub Actions #40674731228](https://github.com/wpuu/kof/actions/runs/40674731228)：**SUCCESS**。运行脚本：[matchbox_impairment_web_smoke.mjs](../../lab/matchbox_impairment_web_smoke.mjs)，工作流：[p0-013-impairment.yml](../../.github/workflows/p0-013-impairment.yml)。

- 官方源代码固定 `johanhelsing/matchbox@9ed2495cd48c007f7a19e95dd5fcd64434b4879a`。
- Bevy 0.19＋bevy_ggrs 0.22＋Matchbox 0.15；Rust WASM + 本地自托管信令；每一用例在一台 Ubuntu CI 主机里启动**两套独立 Chrome 进程**，两端确实进入游戏。
- 通过真实浏览器 `RTCDataChannel.prototype.send` 拦截 `ordered=false,maxRetransmits=0` 的 `matchbox_socket_0` 不可靠游戏通道，不修改 WebSocket 信令和可靠通道。
- 每个延迟包发送前会复制独立的二进制数据，不会因为 WASM 重用底层发送缓冲而发生测试引入的数据篡改。
- 从双方进入游戏后才激活故障注入；HOST 的前 N 次被检测的不可靠通道发送直接丢弃，其余发送增加指定人工延迟。**注入的是连续 DataChannel 发送包，不等于已经逐包确认携带了连续 N 个非零操作帧。**

## 四组 CI 真实结果

| 人工增加的单向发送等待 | HOST 丢包数（实际记录） | HOST 延迟发送数 | GUEST 延迟发送数 | 双方 P1/P2 真实移动 | 同帧检查 |
|---:|---:|---:|---:|---|---|
| 0 ms | 0 | 0 | 0 | PASS | frame 180，状态一致 |
| 45 ms | 4 | 263 | 238 | PASS | frame 180，状态一致 |
| 90 ms | 4 | 287 | 301 | PASS | frame 180，状态一致 |
| 90 ms | 5 | 271 | 250 | PASS | frame 180，状态一致 |

所有四项都从实际脚本输出 `result:PASS`、`stateFingerprintMatch:true`、`player0ActuallyMoved:true`、`player1ActuallyMoved:true`。对应检查不依赖两端在不同模拟帧的临时位置；选择双方都有记录的同一模拟帧，再比较按 player handle 排序的量化 X/Z 位置及 X/Z 速度。此处的“状态一致”仅覆盖这两个角色的运动组件，不是所有游戏或模拟器状态。

本次各浏览器均已实际加载 `quicksand-light.ttf`（HTTP 2xx），只允许跳过 `/assets/fonts/quicksand-light.ttf.meta` 这个非关键元数据的 404；记录其他资源错误为 **0**。不能泛化为忽略任何 HTTP 404。

## 和现有 JS V2 的审慎对照

- 自研 V2 在 [Actions #40623721336](https://github.com/wpuu/kof/actions/runs/40623721336) 下，0ms/0丢、45ms/4连丢样本同帧一致，90ms/4或5连丢则双方显式作废（`SAFE_VOID_UNVERIFIED`）；没有静默认可错误成绩，这是安全保护，却不等于好玩。
- GGRS＋Matchbox 的本次方块示例在四组同机合成发送故障中保持双向移动和量化同帧运动状态一致，**是倾向成熟方案的正面依据**。
- **重要：不能把上述两者直接排成真实性能胜负**：JS V2 运行 Neon Fist 格斗原型，GGRS 运行 Bevy 方块示例；模拟与渲染代价、使用的输入协议、回滚窗口及状态哈希覆盖内容均不相同，尚未进行同游戏、同设备、同网络模拟器的公平对比。

## 本次没有验证

- 未证明丢失的 4/5 个包均承载非零移动或招式输入；这是下一阶段必须增强的故障注入真实性。
- 只有每场一次短时状态检查，没有 10/20 场长时连续对局，没有随机抖动、丢包概率分布、乱序、网络重连、NAT 穿透/区域 TURN。
- 没有 Windows、华为 Android、iPhone Safari 多架构确定性对照。官方 Bevy 示例使用浮点 `f32` 和 `powf` 等，跨架构数值不一致风险仍存在。
- 没有测试真实 KOF98 ROM、模拟器核心授权、打击硬直/搓招/连招手感与 Kawaks 1.45 相同设备的用户主观体验。

## 决策

**GO（下一步研究）**：优先围绕 GGRS＋Matchbox 构建合法原创格斗模拟、加入有意的非零操作帧丢包和多次重复比较，并评估 88MB WASM 体积优化。现有 JS V2 保留技术参考与可回退研究记录，暂不直接删除或宣布完全废弃。

**NO-GO（公开/收费运营）**：在没有真机异网、长期游戏输入一致性、内容/模拟器商业许可与支付/赛事合规前，仍不能宣称已比 Kawaks 1.45 好很多或开放有价赛事。

下阶段跟进：[Issue #7](https://github.com/wpuu/kof/issues/7)，重点是**确保本地键盘输入记录与故障包对应、同帧哈希扩展到真实格斗状态、重复十次与真实异网验收**。
