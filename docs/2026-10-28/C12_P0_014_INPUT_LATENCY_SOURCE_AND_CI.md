# C12｜P0-014 真实输入等待、短按漏采集的源码与 CI 根因审计

日期：2026-10-28（北京时间）。**当前结论：已经实测网页输入及时性阻断；对症实验尚未完成商用品质验收。** 有关 CI 失败同时涵盖网络质量、输入轮询/事件调度和工作流配置错误，必须分开。

## 1. 完全对应项目依赖版本的源码事实

官方 Matchbox `Cargo.lock` 固定 `ggrs=0.13.0`、`bevy_ggrs=0.22.0`、`bevy_matchbox=0.15.0`。不再只凭最新版 `main` 推断旧锁定环境。

- [GGRS v0.13.0 `P2PSession::add_local_input`](https://github.com/gschup/ggrs/blob/v0.13.0/src/sessions/p2p_session.rs#L235-L267) 明确写明：同一玩家在尚未推进的同一帧反复提交输入时，**更早的输入被覆盖**。
- [bevy_ggrs v0.22.0 `run_p2p`](https://github.com/gschup/bevy_ggrs/blob/v0.22.0/src/schedule_systems.rs#L140-L170) 明确在每个 Bevy GGRS step 先运行 `ReadInputs`、调用 `add_local_input`，再调用 `advance_frame()`；遇 `PredictionThreshold` 则跳过 `AdvanceFrame`。
- [Matchbox pinned 官方示例](https://github.com/johanhelsing/matchbox/blob/9ed2495cd48c007f7a19e95dd5fcd64434b4879a/examples/bevy_ggrs/src/main.rs) 配置 `max_prediction_window=12`、`input_delay=2`。

**合理但未被唯一证实的机制**：按键在停帧期被 Bevy `ReadInputs` 报为非零，但在同帧恢复模拟之前被松键后的 0 覆盖，导致“曾经按下、模拟却没执行”。实际浏览器还可能因为 rAF 长时间没有 callback，**根本没有调用 ReadInputs 来采集 120ms 短按**，这不是单靠保存“已经采集到的输入”就能解决的。

## 2. 预测窗口受控比较（九场）

[原 CI #40693239358](https://github.com/wpuu/kof/actions/runs/40693239358) 优化 WASM 构建 PASS，但上传/下载 artifact 名不一致导致九个浏览器 job **全部因配置错误失败，绝非联网质量失败**。已经修正上传/下载名一致，并增加静态检查。

[复用原有可校验 WASM、无需再次编译的重放 CI #40695058730](https://github.com/wpuu/kof/actions/runs/40695058730) 才是真正的 9 场 GGRS 网络结果：双 Chrome、90ms±20ms 人为发送等待、HOST 非零采集后丢 5 包，全部要求双方实用输入、同帧量化状态一致、输入采集→应用等待 ≤250ms。

| 预测窗口 | ≤250ms 的场次 | >250ms 的场次 | 实验最大输入等待 |
|---|---:|---:|---:|
| 12 帧 | 2/3 | 1/3 | 820ms |
| 16 帧 | 3/3 | 0/3 | 24ms |
| 20 帧 | 2/3 | 1/3 | 381ms |

16 帧在**此九轮小样本**表现较好，但不能从 3 次试验得出普遍优于 12/20，也不能直接修改正式设置。三个窗口全部出现过 `WaitRecommendation`，有的有 `NetworkInterrupted`，且高等待与是否出现某一个事件未形成一对一因果证明。

## 3. 无丢包控制组揭示测试环境波动

[控制组 #40694770319](https://github.com/wpuu/kof/actions/runs/40694770319)：相同 WASM，预测窗口 12/16/20，分别不增加延迟、不丢包以及只增加 90ms 单方向发送等待、不丢包。三项达到 250ms 宽松质量线，三项失败：

- W12／0ms／无丢包：Host 3ms / Guest 1ms PASS。
- W12／90ms／无丢包：Host 1ms / Guest **1440ms** FAIL。
- W16／0ms／无丢包：Host 1ms / Guest **484ms** FAIL。
- W16／90ms／无丢包：Host 1ms / Guest 1ms PASS。
- W20／0ms／无丢包：Host 1ms / Guest 5ms PASS。
- W20／90ms／无丢包：Host **513ms** / Guest 4ms FAIL。

这种非单调性说明网络故障之外还存在 Chrome 无头／WebGL 软件渲染／时间调度噪声。不能把“W20 比 W16 差”当成科学定论，也不能把 1440ms 当作所有真实玩家的延迟。

## 4. 短按键真实失败不能隐瞒

- [90ms±20ms +5 丢包短按测试 #40694770306](https://github.com/wpuu/kof/actions/runs/40694770306)：12/16/20 三个窗口 × 3 种子，严格 **0/9**，多数 120ms W/D 按键未被 Rust `read_local_inputs` 采集。
- [完全没有人为网络故障的短按对照 #40695528313](https://github.com/wpuu/kof/actions/runs/40695528313)：同样严格 **0/9**。这足以证明“全部短按失败”不能直接归咎于网络丢包。
- [P0-014D 每帧非零输入保留原型 #40694773599](https://github.com/wpuu/kof/actions/runs/40694773599) Rust/WASM **编译成功**，但下载 artifact 名配置错误导致九场测试根本没有启动；[使用原构建产物正确重放 #40696002803](https://github.com/wpuu/kof/actions/runs/40696002803) 为严格 **0/9**，大多仍然没有采集到 120ms 按键。故“已经采集之后保留按键”的办法无法修复“本来就没有被采集”的问题，不能并入生产方案。
- [工作流 upload/download 名称静态检查 #40696092581](https://github.com/wpuu/kof/actions/runs/40696092581) 已 PASS，后续包含新工作流须继续运行该检查。

## 5. 真正的 DOM 事件与游戏读取分歧

[第一轮 DOM 诊断 #40696253610](https://github.com/wpuu/kof/actions/runs/40696253610) 和 [时间对齐诊断 #40696771661](https://github.com/wpuu/kof/actions/runs/40696771661)。

在多个无人工网络故障的失败例子：
- 真实 Chrome DOM `keydown(KeyW)`、`keyup(KeyW)` 均到达，间隔约 125–130ms，`document.visibilityState=visible`、`document.hasFocus()=true`，活动元素 `CANVAS`；
- 在按键持续期间 JS `setInterval` 实际有约 5–6 次 callback，**requestAnimationFrame 回调 0 次**，而 Rust 对应的非零输入读取 0 次；
- 会话也曾出现最长 1000–1900ms 的 JS 定时器间隔，但这些最长间隔未必覆盖实际短按窗口；时间对齐报告里的 `overlappingLongGaps=[]`，不可将最大值直接归因于按键被吞。

**能确定的是**：有些按键确实传到了浏览器事件层，却因为无更新帧／输入轮询错过实际游戏读取。它可能与无头 Chrome、SwiftShader、Bevy/Winit 调度有关，**不能从 CI 直接外推真实用户手机上也必然同样发生**。

## 6. 在进行的下一层真正尝试

- [测试专用 DOM keydown 边沿队列 Rust 接入补丁](../../lab/patch_matchbox_dom_edge_queue.mjs)：在真实浏览器键盘事件时先缓存 W/A/S/D 的按下 mask，Rust `read_local_inputs` 下次执行时消费；和前面的同帧 latch 配合。这不仅处理“已采集后同帧被覆盖”，还处理“按下期间 ReadInputs 未调用”。
- [DOM 队列/两端真实模拟/物理按下→应用延迟测量](../../lab/matchbox_dom_edge_queue_smoke.mjs)。
- [CI P0-014G](../../.github/workflows/p0-014g-dom-edge.yml) 进行 Rust/WASM 编译一次＋九场短按实测。最初两次因补丁精确源码 anchor 存在重复/转义错误在 Rust 编译前失败，均保留红灯并已修正。最终结果只能以之后的实际 CI 回读为准。
- **严格警告：**本补丁的 `OR` 位掩码队列不能代表正式拳皇游戏的按键顺序、松键、连续招式、搓招和组合输入，尤其不能作为发布系统。它只是测试“输入事件能否跨越浏览器无动画帧期间保存并传达”的可行性探针。

## 7. 未越过的门禁

- 单机/同机无头浏览器 CPU/GPU 资源与真正 Windows/华为/iPhone 游戏设备质量不同，必须在真机上单独测。
- **真实格斗产品**需要 60Hz 确定性模拟＋时序精确的 bounded 按键事件队列＋回滚预测。不能只按位 OR。
- 这里没有真实运营商 NAT/STUN/TURN 质量测量，没有连续 20 局真实格斗对抗，更没有合法 SNK/KOF ROM 分发或付费赛事权利。
- 与 Kawaks 1.45 同设备同线路对比尚未执行，不允许宣称“技术测试表格证明明显更好”。

**当前判断：质量尚不达标。下一步必须验证 DOM→Rust 边沿队列能否使 120ms 短按动作真正出现，且真实输入响应在可接受范围内；之后再考虑工程化改造和真实设备。**
