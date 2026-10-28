# C02｜GGRS + Matchbox 官方源码实际编译与回滚测试

**日期**：2026-10-28（北京时间）
**任务**：[Issue #6 P0-012](https://github.com/wpuu/kof/issues/6)
**状态**：官方上游信令组件编译及测试通过、GGRS 原生测试通过、Bevy/GGRS/Matchbox 浏览器样例 WASM **类型编译检查通过**；完整 WASM 可执行文件及真实浏览器双端运行另行验收。

## 固定版本与外部代码范围

| 项目 | 源码 SHA | 用途 |
|---|---|---|
| Matchbox 上游 | `9ed2495cd48c007f7a19e95dd5fcd64434b4879a` | WebRTC 信令服务器、Bevy 集成和浏览器示例 |
| GGRS 上游 | `25bd9983dee3ecb0677be03b9e2e23d2bd6d29cb` | Rust rollback、同步测试/P2P 库 |

Matchbox 样例使用 Bevy 0.19、bevy_ggrs 0.22、Matchbox 0.15。Rust 测试环境为 GitHub Actions Ubuntu、rustc 1.99.1。Matchbox 使用仓库 Cargo.lock 的 `--locked` 依赖；GGRS 上游没有已跟踪的 Cargo.lock，依赖在该次测试时解析，后续商业基线需要保存锁定的版本与构建清单。

## 真正跑出的 CI 结果

### Matchbox / Bevy 示例

[GitHub Actions #40622223277](https://github.com/wpuu/kof/actions/runs/40622223277)

- `cargo check --locked --package matchbox_server` —— **PASS**；信令后端源代码已在独立 runner 编译检查。
- `cargo test --locked --package matchbox_signaling` —— **24 passed / 0 failed**（12 + 11 + 1 集成测试）。
- `cargo check --locked --package bevy_ggrs_example --target wasm32-unknown-unknown` —— **PASS**，约 1 分 57 秒编译检查成功。**是类型/依赖检查，不是最终 WASM 链接、浏览器渲染或两位玩家联机成功。**
- 源码依赖 Rust WASM + WebGL2 + WebRTC；信令默认可由 `matchbox_server` 自托管，必须在真正客户端上实测 NAT/TURN 和手机浏览器。

### GGRS 官方 rollback

[GitHub Actions #40622336740](https://github.com/wpuu/kof/actions/runs/40622336740)

`cargo test --lib --tests -- --test-threads=1` —— **120 passed / 0 failed**，分布为 66 个库测试、34 个核心 P2P 测试，以及 1+9+9+1 其他集成/观战/同步测试。覆盖回滚存档、恢复、输入时序、双人会话、旁观、确定性同步等官方现有断言。没有新增到游戏逻辑中的用户自定义实战测试。

### 已有 JS V2 作比较的必要事实

- 自研的 V2 协议适配器在 [Actions #40539887994](https://github.com/wpuu/kof/actions/runs/40539887994) 完成 25/25 独立测试，浏览器同机 ACK/NACK 五包补发也曾通过。
- 但旧版本与 Neon Fist 的真实游戏桥接在 [Actions #40541315755](https://github.com/wpuu/kof/actions/runs/40541315755) 中**双方 VOID/MALFORMED，未通过**。单元测试通过不能替代格斗游戏在线同步通过。
- 新增加的 HELLO_ACK 应用握手栅栏属于需要单独验证的实验修改，**不能在有明确真实浏览器成功证据前宣称已修复游戏桥接**。

## 技术及商业结论

GGRS + Matchbox 的完整源码实际编译及官方测试结果，已经明显强于“仓库声称具备 rollback”这种候选证据。它是当前原创网页、移动端跨端游戏的优先技术基线。

**仍需实证**：最终 WASM 构建、加载于真正 Chromium 的两端页面、官方自托管信令配对、玩家移动后同帧状态一致、45/90ms 及连续丢包对照、Windows/华为/iPhone 异网手感。任何未测项保留为未验收。

**许可**：Matchbox/GGRS 网络代码分别为 MIT 或 Apache-2.0 可选择；Bevy 演示的字体/其他素材需单独做商用追溯。网络代码许可不授权商用 KOF ROM、SNK 角色或其他第三方游戏内容，也不解决竞猜或付费天数权益的监管问题。

## 已创建可重复执行的工作流

- [p0-012-matchbox.yml](../../.github/workflows/p0-012-matchbox.yml)：上游服务器构建、信令测试、浏览器 WASM compile check。
- [p0-012-ggrs.yml](../../.github/workflows/p0-012-ggrs.yml)：GGRS 官方回滚/P2P test suites。
- [p0-012-wasm-build.yml](../../.github/workflows/p0-012-wasm-build.yml)：产出完整 WASM 文件并记录 SHA256；此流程在本报告首次保存时仍需回读最终结果。

## 下一步与验收边界

1. 若完整 WASM build PASS，使用官方示例代码及经允许的字体/临时素材、本地 `matchbox_server` 与 Playwright 验证**两独立浏览器同时进入实际房间**，不是只出现首页。
2. 优先测真实双端输入/模拟帧与延迟统计。若浏览器 WebGL2、性能或打包阻塞，保留错误码和精确依赖，不删改仓库已有 V2 验证成果。
3. 真正 KOF 98 模拟器的商用授权与确定性状态恢复是独立大门，不能用 Bevy 方块示例替代。
