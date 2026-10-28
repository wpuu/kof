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

---

## 2026-10-28 本轮 P0-013 状态升级（最终 CI 证据回收）

**P0-013A/B 正式通过：**[CI #40674697739](https://github.com/wpuu/kof/actions/runs/40674697739)，GGRS＋Matchbox 官方 Bevy 网页 WASM，两个独立 Chrome 进程真正进入同一房间，各自键盘操作令 P1/P2 运动；相同第 180 帧位置/速度记录一致，所需字体双方均 HTTP 2xx 加载成功。完整报告：[C06](C06_P0_013_SAME_FRAME_PASS.md)。

**P0-013C 四场短时合成网络压力通过：**[CI #40674731228](https://github.com/wpuu/kof/actions/runs/40674731228)：0ms/0包、45ms/4包、90ms/4包、90ms/5包，均在真实 WebRTC 不可靠通道发生规定数量的合成数据包丢失/延迟，双方操作各自产生实际角色运动，第 180 帧量化运动状态相同，其他资源错误 0。完整报告：[C07](C07_P0_013_GGRS_IMPAIRMENT_PASS.md)。

**失败记录未抹除：**上轮 CI #40625225372、#40673217294 因浏览器资产元数据 404 门禁而失败，日志中已有同帧一致性迹象。本轮只在真实 `.ttf` 字体 HTTP 2xx 的条件下允许忽略其可选 `.ttf.meta` 404，不放宽其他必需资源验收；旧压力 CI #40673476167 在部分场景中未观察到双方运动，此后新 CI 4/4 有实际移动并 PASS，但需重复以评估可靠性。

**路线决定**：GGRS＋Matchbox 已经具有比“静态 Github 演示”强得多的真实浏览器证据，**作为优先推进的原创网页格斗联网基线 GO**。保留 JS V2，但不再优先从零扩展网络协议。此结论**不等于**它已在真实 KOF98 模拟器、不同运营商、Windows/华为/iPhone 或与 Kawaks 1.45 的同设备对照下胜出。

**下一验收门槛**：
1. 在玩家按键已经明确进入本地游戏输入采集的时间窗口内定点丢弃真正影响操作的网络数据，记录 WASM 端本地输入和远端应用，而不只记录丢了几个 DataChannel 发送包；
2. 至少 10 次重复 90ms+5包，附随机抖动和更长时长的连续游戏状态核验，记录恢复、卡帧/回滚、断线/作废；
3. 改造可确定性整数/定点模拟、加入格斗攻击/防御/命中状态，对跨 CPU/浏览器进行同帧校验；
4. 优化当前约 88MB 的 WASM 交付体积并测手机首屏；
5. 取得真实 Windows、Android、iOS 和不同运营商连线数据后，才判断是否明显优于 Kawaks 1.45；
6. 所有第三方版权及运营资质独立审批：不集成未授权的 SNK ROM，不开启有价天数竞猜。

GitHub 执行：[Issue #7](https://github.com/wpuu/kof/issues/7) 保持 OPEN；此轮 P0-013A/B/C 的已完成短时测试结果可以封存，产品验收继续进行。

---

## 2026-10-28 P0-013D/014 后续真实执行和安全边界

### P0-013D：非零输入对齐十轮，有明确红灯

- [真实十轮 CI #40689108165](https://github.com/wpuu/kof/actions/runs/40689108165) 的 Rust/WebAssembly 构建和测试前预检成功，十个独立 Chrome 对局 job 真实执行，**9 PASS / 1 FAIL**。全部用同一份短期 SHA-256 校验后的 WASM／信令二进制，无须逐轮重新编译。
- 具体失败在第 3 轮：Guest 在 GGRS frame=133 收到非零右移动输入 `mask=8`，但真实 `move_cube_system` 在两端均未消费其 player handle=0 的非零输入；其角色没有发生预期移动。**同帧状态一致不等于用户输入成功。**
- 丢包限定为 HOST 真正采到非零玩家输入后启动的 5 个不可靠 WebRTC 发送包，90ms±20ms 人工发送等待。尚不能宣称每个被丢的编码包都承载一个非零游戏输入帧。
- [C09 十轮原始成功／失败及详细状态](C09_P0_013D_10X_RESULTS.md)、[C08 验收合同](C08_P0_013D_NONZERO_INPUT_10X.md)。
- Rust 2024 `unsafe extern` 兼容更新版重复运行 [#40689765737](https://github.com/wpuu/kof/actions/runs/40689765737) 独立保留证据；在其最终输出核实前不得将它合并当作第二十次全部通过。

### P0-014：测量出不合格的本地输入等待

- 新 [Issue #8](https://github.com/wpuu/kof/issues/8) 专项处理“本地输入已经捕获但模拟没有及时应用”的可能停帧/输入覆盖问题。
- [CI #40691032752](https://github.com/wpuu/kof/actions/runs/40691032752) 使用上一运行生成的已校验 WASM artifact，**跨 GitHub run 复用**，没有重新编译。方向键保持至真实模拟应用后，3 个诊断样本都最终同帧一致、双端真实操作生效。
- 但采集→应用的 Host 等待为 **212ms / 796ms / 415ms**，最大约 796ms；这是当前原型在合成恶劣网络下不满足格斗游戏手感目标的真实技术阻断。
- [C10 原始时延及下一步诊断合同](C10_P0_014_INPUT_STALL_DIAGNOSIS.md)。

**状态决定**：GGRS+Matchbox 仍为优先研究技术基线，但不能将当前结果报告为 100% 稳定、低延迟或已优于 Kawaks 1.45。下轮优先诊断 GGRS 预测窗口/停帧/本地按键调度，不能通过无限延长键按压掩盖故障。
