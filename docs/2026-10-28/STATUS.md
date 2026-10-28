# wpuu/kof — 2026-10-28 阶段执行状态（P0-012）

**固定约束**：可用原创新游戏做网页/手机联机原型；未经 SNK 许可不分发任何 KOF ROM/美术/音频；付费天数竞猜和真金结算仍未获合规审查，暂不做收费上线。

## 本轮真实代码与 CI 完成

1. **GGRS** 上游锁定 `25bd9983dee3ecb0677be03b9e2e23d2bd6d29cb`；官方回滚/P2P/观战/同步测试 **120/120 通过**。[CI #40622336740](https://github.com/wpuu/kof/actions/runs/40622336740)
2. **Matchbox** 上游锁定 `9ed2495cd48c007f7a19e95dd5fcd64434b4879a`；原版信令服务器编译和测试 **24/24 通过**。Bevy 0.19 + bevy_ggrs 0.22 + Matchbox 0.15 官方 WASM 类型编译检查通过。[CI #40622223277](https://github.com/wpuu/kof/actions/runs/40622223277)
3. 官方例子实际 `cargo build` **PASS**，生成调试 WASM 共 `1,137,742,340` 字节；原始文件太大，不适合用户实际加载。[CI #40622591645](https://github.com/wpuu/kof/actions/runs/40622591645)
4. 已发起官方 Bevy/GGRS **优化版 WASM + 自建 Matchbox 信令 + 两 Chrome 进程的真实网页运行实验**：[CI #40623334349](https://github.com/wpuu/kof/actions/runs/40623334349)。**首次保存本报告时仍在编译，不可写成已完成或成功。**
5. 还发起官方 `examples/simple` Rust WASM 的**双浏览器实际 WebRTC 收发消息**实验，不依赖 Bevy 显卡：[CI #40624013750](https://github.com/wpuu/kof/actions/runs/40624013750)。同样须等待真实日志判断通过与否。
6. **自研 JS V2 的已定位生产原型故障被实际修复**：添加可靠 `HELLO_ACK` 握手屏障；接受浏览器 `performance.now()` 小数毫秒作为 NACK 时钟；增加回归测试。[协议测试 #40623433084](https://github.com/wpuu/kof/actions/runs/40623433084) 通过；[真实两浏览器游戏 #40623428444](https://github.com/wpuu/kof/actions/runs/40623428444) 双向控制与同帧 hash PASS（桌面及模拟触控）。
7. **实际同机压力对照**：[CI #40623721336](https://github.com/wpuu/kof/actions/runs/40623721336) 的 V2 双浏览器游戏：0ms/0丢包、45ms/4连丢同帧一致；90ms/4或5连丢双方宣布作废；没有安静分叉。**作废不代表流畅，也不能外推真实玩家网络。**
8. 已写 C02 [官方构建原始证据](C02_GGRS_MATCHBOX_BUILD_EVIDENCE.md) 与 C03 [V2 vs GGRS 同阶段证据比较](C03_V2_VS_GGRS_COMPARE_EVIDENCE.md)。

## 新的确定性风险

Matchbox 官方 `examples/bevy_ggrs/src/box_game.rs` 使用 `f32` 状态、`powf(dt)`、`sqrt`、`sin/cos`。**它只是演示，不代表跨 Windows、Android、iPhone Safari 都必然精确确定性。**真正格斗引擎需要定点/整数物理或经跨架构实证的确定性模拟，持续同帧 hash 核对。

## 决策门禁

- **继续验证**：Matchbox + GGRS；当前原版样例实际构建有证据，具备商业复用代码基础。
- **保留对照**：已经能在真实双浏览器游戏里运行的 JS V2，不立即废弃。至少需要将两路线置于相同确定性游戏和相同网络故障条件下再选型。
- **仍 NO-GO**：在没有实际真机/跨运营商/NAT-TURN、长期稳定性及内容/经营许可的情况下，以任何版本宣称已超越 Kawaks 1.45 或开始收费赛事。
- **下一条验收**：官方 Matchbox WASM 真正联机并交换输入，随后才是同帧 hash、90ms+4包、华为/iPhone Safari 与 Kawaks 同设备测试。

## 源码入口与可重复工作流

- `.github/workflows/p0-012-matchbox.yml`
- `.github/workflows/p0-012-ggrs.yml`
- `.github/workflows/p0-012-wasm-build.yml`
- `.github/workflows/p0-012-official-browser.yml`
- `.github/workflows/p0-012-matchbox-simple.yml`
- `.github/workflows/p0-012-v2-game-stress.yml`
- `lab/matchbox_official_web_smoke.mjs`
- `lab/matchbox_simple_web_smoke.mjs`
- `lab/neon_v2_impairment_smoke.mjs`
- [GitHub Issue #6：成熟架构对照](https://github.com/wpuu/kof/issues/6)。

## 实际完成记录追加：官方 GGRS/Matchbox 两浏览器页面成功

此前列为进行中的 [#40623334349](https://github.com/wpuu/kof/actions/runs/40623334349) 已 **SUCCESS**：优化 WASM 经绑定后 88,118,190B，两独立 Chrome 正常初始化画布，自建 Matchbox 信令真正配对，双方都输出 `All peers have joined, going in-game`。

- [C04 的完整证据](C04_MATCHBOX_GGRS_REAL_BROWSER_PASS.md)；[Issue #7](https://github.com/wpuu/kof/issues/7) 建立真实同帧状态/丢包/包体优化专项。
- 只是**进入游戏成功**，当前没有双方按键后的同帧 hash 验证；不可宣称真实 KOF 或移动网络比 Kawaks 流畅。

## 2026-10-28 后续运行：P0-013 与轻量 Matchbox 子样例状态

- [P0-013 测试用 GGRS 同帧状态仪表](../../lab/patch_matchbox_state_probe.mjs) 与 [双 Chrome 操作后同帧比较测试](../../lab/matchbox_same_frame_web_smoke.mjs) 已真实提交；[CI #40625225372](https://github.com/wpuu/kof/actions/runs/40625225372) 在本次记录时仍执行构建/测试，**未宣称通过**。
- Matchbox `examples/simple` 独立 WebRTC 消息测试 **#40624013750 与 #40624455349 失败**：双方 WASM 初始化和 WebSocket 创建成功，但未收到预期 `Peer joined` 或 `hello friend!` 日志；[#40625018044](https://github.com/wpuu/kof/actions/runs/40625018044) 改为明确 IPv4 地址和 `?next=2` 双人房间后仍失败。原因尚未证实，不能将源码编译完成说成消息通道可用。
- 这与已**成功**的官方完整 Bevy/GGRS [CI #40623334349](https://github.com/wpuu/kof/actions/runs/40623334349) 是不同子项目、不同验收场景；后者已确认双方加入同一 GGRS 游戏房间，但尚未量化游戏输入的同帧状态。
- 不复制上传 ROM、不使用 KOF 素材、不收费。还需检查新的同帧一致性 CI 后确定后续架构是否可进一步验收。
