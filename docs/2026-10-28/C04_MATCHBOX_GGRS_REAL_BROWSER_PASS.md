# C04｜GGRS＋Matchbox 官方网页联机：真实双浏览器端到端通过

日期：2026-10-28（北京时间）
任务：[Issue #6 P0-012](https://github.com/wpuu/kof/issues/6)
状态：**官方 WASM 网页加载/信令/两独立 Chrome 进程入同一 GGRS 游戏通过。尚未验证游戏双方移动后的同帧 hash、真实跨运营商或手机 Safari。**

## 1. 真实上游版本和测试脚本

- Matchbox 固定源码 `9ed2495cd48c007f7a19e95dd5fcd64434b4879a`。
- Bevy 0.19、bevy_ggrs 0.22、Matchbox 0.15；GitHub Ubuntu/稳定 Rust、`wasm32-unknown-unknown`，WASM 绑定生成工具固定 `wasm-bindgen-cli 0.2.129`（与上游 Cargo.lock 对齐）。
- [GitHub Actions #40623334349](https://github.com/wpuu/kof/actions/runs/40623334349) 完整 **SUCCESS**。
- [CI 工作流](../../.github/workflows/p0-012-official-browser.yml)、[真实浏览器烟雾测试](../../lab/matchbox_official_web_smoke.mjs)、[最简页面](../../lab/matchbox_official_index.html) 全部保存于本仓库。没有在公共互联网部署。
- 官方游戏来自 `examples/bevy_ggrs`，没有使用 KOF ROM、SNK 美术、付费结算或任何个人真实账户。

## 2. 编译和分发体积事实

| 构建阶段 | 实测大小 | 状态 |
|---|---:|---|
| 非优化 debug WASM | **1,137,742,340 字节** | [Actions #40622591645](https://github.com/wpuu/kof/actions/runs/40622591645) PASS；不适合分发 |
| `cargo build --release` 后官方 WASM | **87,544,791 字节** | [Actions #40623334349](https://github.com/wpuu/kof/actions/runs/40623334349) PASS |
| `wasm-bindgen --target web` 处理后的 `game_bg.wasm` | **88,118,190 字节** | 同上，实际用于本次浏览器加载 |

约 88 MB 的未压缩正式网页文件仍然偏大，尤其对手机 4G/5G 冷启动。下一阶段必须测 gzip/Brotli、wasm-opt、懒加载和首屏时间，不应直接把它看成最佳产品体积。

官方示例所用字体文件附带 [SIL Open Font License 1.1](https://github.com/johanhelsing/matchbox/blob/main/examples/bevy_ggrs/assets/fonts/quicksand-light.txt) 声明。本轮**只在私有 CI 内部使用必要测试资源，不把字体文件复制到用户交付物中**。

## 3. 浏览器真正发生的事情

- Python 仅在 GitHub 临时 runner 本地端口 `1334` 提供优化 WASM/JS，原版 Matchbox 信令服务器通过本机 `ws://127.0.0.1:3536/` 提供连接；
- Playwright 启动**两套独立 Chrome 进程**，不是一个进程中的虚拟 P2P mock；
- 两个 Chrome 均实际加载 WASM，出现非零画布 **960×640**，初始化成功；
- 客户端真正连接 `ws://127.0.0.1:3536/bevy_ggrs?next=2`，双方控制台都有明确的 `All peers have joined, going in-game`，且无浏览器 JS pageerror；
- CI 发送少量 WASD 键盘操作用于最基本输入路径触发，但**没有从引擎取出两端同帧位置或 checksum，故不能宣称真正已验证操作同步精度**。
- 运行结束后自建服务与两浏览器均在 CI 容器销毁，没有真实互联网站点、玩家账号、持久化状态或收费行为。

## 4. 用来决策的真实结论

**已证明：**官方成熟 GGRS＋Matchbox 架构，在锁定依赖及无需专有游戏资源的情况下，能够完整编译、用浏览器加载、从自建信令服务器建立双端配对并进入游戏。这是可以继续开发的真实可运行技术底座。

**仍未证明：**比 Kawaks 1.45 流畅、在 90ms+4 连丢条件下不失同步、真正 iPhone Safari/华为触控可用、合理商业游戏首屏体积、模拟器和 KOF 版权许可。

官方 `examples/bevy_ggrs/src/box_game.rs` 直接使用 `f32`、`powf(dt)`、`sqrt` 和 `sin/cos` 的运动计算，不能自动推断在不同 CPU/浏览器下确定性。正式格斗模拟最好以**固定 60Hz 整数/定点物理＋权威一致性快照**替换演示方块运动逻辑。

## 5. 下一执行项及门禁

1. **P0-013A：**GGRS 示例增加隔离测试专用同帧状态/哈希读取，不改变游戏的功能和资产；双浏览器真正输入后比较同一帧。
2. **P0-013B：**通过可复现网络条件测试 45/90ms、1/4/5/8 连丢、抖动，以及 GGRS 当场回滚/卡帧统计；和现有 V2 在**同样模拟游戏**里对比，不比较不同游戏的单次 FPS。
3. **P0-013C：**Brotli/wasm-opt 优化与手机首次加载测试，记录包大小和首屏时间。
4. **P0-013D：**在有真机入口后完成 Windows↔华为↔iPhone Safari 异网 20 场验证，对比实际 Kawaks 1.45 的输入延迟和不同步。
5. **P0-013E：**重新评估商用模拟器核心与游戏内容授权。**GGRS/Matchbox 许可不包含 SNK ROM 权利。**

本阶段技术结论：**P0-012 官方示例实际浏览器双端联机 PASS；产品级可靠性/商用发布仍 NO-GO。**
