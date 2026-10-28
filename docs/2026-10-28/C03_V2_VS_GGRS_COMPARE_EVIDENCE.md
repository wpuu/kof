# C03｜GGRS/Matchbox vs 自研 V2：实际 CI 对照及下一决策

**日期**：2026-10-28（北京时间）
**关联**：[Issue #6：GGRS + Matchbox 成熟方案对比](https://github.com/wpuu/kof/issues/6)、[Issue #5：自研 V2 抗丢包](https://github.com/wpuu/kof/issues/5)
**状态**：两个技术方向已有真正的运行证据，尚未在**同一个游戏引擎、同一个网络模拟器及真实跨运营商设备**上公平地测出哪个更好。不能凭库单测/短时同机实验决定最终迁移。

## 1. 可复核证据

| 项目 | 真实完成的验收 | 证据 | 没有证明什么 |
|---|---|---|---|
| GGRS 原生 0.13 | **120/120 测试通过**，包括 rollback、P2P、sync-test、观战 | [Actions #40622336740](https://github.com/wpuu/kof/actions/runs/40622336740) | 未接进网页实战、未测 KOF ROM |
| Matchbox 0.15 信令 | **24/24 测试通过**，`matchbox_server` 编译检查成功 | [Actions #40622223277](https://github.com/wpuu/kof/actions/runs/40622223277) | 未确认实际 NAT/TURN 建连成功率 |
| Bevy 0.19＋GGRS 0.22＋Matchbox 0.15 | 官方网页示例 `cargo check --locked --target wasm32-unknown-unknown` **PASS** | [Actions #40622223277](https://github.com/wpuu/kof/actions/runs/40622223277) | 仅类型检查，不等于网页已运行 |
| 官方 WASM 二进制编译 | `cargo build --locked` 成功，未优化调试版约 **1,137,742,340 B**（约 1.14 GB）；SHA-256 `f6b2a9b358719bcfb1e9f9c21cc5b17b1dabda7dfb7c9163a315dcff482acbeb` | [Actions #40622591645](https://github.com/wpuu/kof/actions/runs/40622591645) | 调试版过大、尚未进行浏览器加载；优化版另测 |
| JS V2 协议＋双通道适配 | 原版 18 项＋先前 7 项；新增 HELLO_ACK 与时间戳回归后共**28 项测试通过**（以最新 CI 原始数量为准） | [Actions #40623433084](https://github.com/wpuu/kof/actions/runs/40623433084) | 仅测试协议和模拟信道，非玩家体验 |
| JS V2 无故障真实游戏 | 两独立 Chromium 游戏真正联机，P1/P2 操作在双方执行，校验同一模拟帧哈希 | [Actions #40623428444](https://github.com/wpuu/kof/actions/runs/40623428444) | 未覆盖跨网络、真实手机和掉包下连续长局 |
| JS V2 实际快速输入丢包回归 | 同机两浏览器，0/0 同帧一致；45ms/4连丢同帧一致；90ms/4连丢、90ms/5连丢均双方明确作废，防止静默计分分叉 | [Actions #40623721336](https://github.com/wpuu/kof/actions/runs/40623721336) | **作废是安全防护，不是良好的联网手感**；以上非实际 RTT |

> 以上数据均为当前观察的单次或小样本受控环境，不能外推到玩家真实卡顿率、获客/收入、Android/iOS Safari 或 Kawaks 1.45 同机公平对照结果。

## 2. 本轮从实际失败中修复的 JS V2 问题

原始 V2 游戏 CI [#40541315755](https://github.com/wpuu/kof/actions/runs/40541315755) 双方 VOID/MALFORMED。
- 一项握手时序问题：两条 DataChannel 中某端可能尚未确认对方处理 HELLO 时就开始发送游戏输入；新增可靠 `HELLO_ACK` 双向确认栅栏，避免快速输入早于对方握手完成。
- 一个可复现的浏览器运行时错误：`ReliableInputPeer.makeMissingRequest(nowMs)` 错误地要求整数毫秒，但实际 `performance.now()` 为小数。修改为允许**非负有限实数毫秒**，拒绝 NaN/Infinity/负值；增加回归用例。
- 上述修复后真实双端游戏 [#40623428444](https://github.com/wpuu/kof/actions/runs/40623428444) **PASS**，第 311 帧桌面与第 310 帧模拟触屏的同帧哈希匹配。
- 协议额外扩展消息 `HELLO_ACK`，与旧测试版 V2 并非完整线兼容，正式发布前需要显式小版本/能力握手或版本号升级，避免把这种实验变更默默推送给已有玩家。

## 3. 成熟路线自身仍存在不确定性

**官方 Bevy+GGRS 示例并不是天然跨 CPU/浏览器确定性。** 从 `examples/bevy_ggrs/src/box_game.rs` 可直接查到它使用 `f32` 位置/速度、`FRICTION.powf(dt)`、`sqrt`、初始位置 `sin/cos`，需要独立的跨架构状态核验。Windows Chrome、华为 Chromium 和 iPhone Safari 的平台差异，可能让浮点实现出现微小分歧。

正式的格斗游戏核心应考虑定点数/整数的决定性碰撞与物理、固定 60Hz 状态模拟、完整快照保存、版本和初始随机种子校验。Rust 库本身能 rollback，不等于任意游戏代码自动确定性。

## 4. 当前选择与推进先后

**阶段性建议：GGRS/Matchbox 保持主候选；JS V2 保留为真实可运行的对照实现。**

1. 先确认官方 Bevy/GGRS 优化 WASM 真正可以打包、装载并让两浏览器在自托管信令下同房；未成功之前不迁移。
2. 真正比两种架构的输入响应/回滚深度/容错，需同一个确定性测试游戏、同一故障注入器、同一组角色运动事件；如果 A 跑方块、B 跑格斗，不能用不同帧率直接得出胜负。
3. JS V2 下一步在临界 90ms+4 连丢时优先研究**有限等包/时间同步**而非一直向前模拟后作废。目标应是可恢复地继续对局，作废仅是最后保护。
4. GGRS 官方 WASM 示例与 Rust SDK 源代码许可为 MIT/Apache-2.0；用于演示的字体/角色需单独追溯合法授权。FBNeo 的非商业限制及 SNK ROM 版权不因 GGRS 开源而改变。
5. 用户曾真实体验 Kawaks 1.45 卡顿和不同步；要宣称明显更好，最终必须真实同设备同线路、同步游戏条件下做盲测、输入到画面 p95、不同步率和连续比赛数据。

**此处没有任何证明可以立即提供收费 KOF ROM、盈利竞猜或对外公开发行的证据。**
