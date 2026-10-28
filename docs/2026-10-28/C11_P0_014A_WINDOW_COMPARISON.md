# C11｜P0-014A GGRS 预测窗口 12/16/20 真实浏览器对照计划与验收

日期：2026-10-28（北京时间）。**当前状态：测试和 CI 已提交、预检 PASS、完整 Rust/WASM 与九场游戏正在执行；最终数据尚未回收，不可提前宣称通过。**

## 实际问题与原始证据

- [P0-013D 首轮 10 次真实非零输入＋发送抖动＋5 连丢 CI #40689108165](https://github.com/wpuu/kof/actions/runs/40689108165)：严格 9/10 PASS，1 次实际看到玩家操作被采集但未进入 `move_cube_system`。
- [第二轮 #40689765737](https://github.com/wpuu/kof/actions/runs/40689765737)：10/10 PASS；合起来有一轮失败，不是 100% 可用证明。
- [P0-014 三场输入延迟复现 #40691032752](https://github.com/wpuu/kof/actions/runs/40691032752)：将键保持到模拟真正应用后，Host 采集→应用等待分别 **212、796、415 ms**，对反应敏感的格斗游戏不能接受。
- [C09、C10 原始详细记录](C10_P0_014_INPUT_STALL_DIAGNOSIS.md)。不能把相同游戏帧状态一致误解为玩家输入必定被应用。

## 上游确定性事实

锁定 `johanhelsing/matchbox@9ed2495cd48c007f7a19e95dd5fcd64434b4879a` 的官方 Bevy/GGRS demo 在 `examples/bevy_ggrs/src/main.rs` 中固定 `max_prediction_window=12`、`input_delay=2`，并且 `log_ggrs_events` 能读取 GGRS 事件。GGRS SDK 提供 `current_frame()`、`frames_ahead()`、`max_prediction()`、`WaitRecommendation`。前述三个输入延迟是旧静态配置下观测，并不能证明它们都由预测窗口导致。

## 本轮已经实际提交的可再现源码

- [CI-only GGRS 动态预测窗口与帧停滞日志补丁](../../lab/patch_matchbox_prediction_probe.mjs)：对固定 SHA 的临时 Rust 副本增加浏览器参数 `prediction_window`（仅 8 至 20 帧）、保持 `input_delay=2`，并记录 GGRS 当前帧、frames ahead、预测窗、WaitRecommendation 与同帧连续轮询数，不修改原作者仓库。
- [真实双 Chrome 按键→模拟应用测量](../../lab/matchbox_prediction_window_comparison.mjs)：两端均真正向 WASM 游戏采集非零输入，另一层钩子独立证明 GGRS 对两名玩家真的使用了非零输入。要求同一模拟帧量化状态一致、5 次指定发送包确实丢弃、网络故障确实施加。
- [完整矩阵 GitHub CI](../../.github/workflows/p0-014a-prediction-ab.yml)：先 JS 语法预检；**一个**固定 WASM/server 构建＋SHA256 校验 artifact；9 个独立 Chrome 对局（prediction window 12、16、20 × 原重复 seed 1、3、5）。
- [基线脚本](../../lab/matchbox_no_loss_baseline.mjs)：预留不丢包测试，用同一产物对照 0ms 和仅 90ms 发送延迟；不应重复编译昂贵 WASM。

## 硬约束与测试解释

- 固定人工发送等待 90ms/方向、抖动 ±20ms、HOST 真实非零输入被 Rust 采集后丢弃 5 个 GGRS 不可靠 DataChannel 发送包。注意这不是现实 RTT，也未证明每个丢失的包都只载了一个非零输入帧。
- 同时验证客户端原生 `ReadInputs` 非零采集事件、`move_cube_system` 确实将两名玩家的非零输入纳入模拟，避免“双方都不动且 Hash 相同”的假通过。
- **质量探索目标 250ms**：记录 local capture→GGRS applied 毫秒值。任何一方大于 250ms 必须记 Quality FAIL（即使两端状态一致）；该 250ms 是调研阶段的宽松否决线，**不是正式格斗体验指标或实际设备验收**。
- 比较时使用相同种子、相同 WASM、相同网络故障条件，预测窗口差异才有基本意义，但独立 CI 环境调度会造成噪声。必须有多次样本才能给出方向结论。
- 监测 `KOF_CI_STALL`、`KOF_CI_GGRS_EVENT`，保留是否由预测窗口触顶/时间同步事件引起的证据；不因日志里出现 WaitRecommendation 就武断归因所有输入等待。
- 输出分别记录完整模拟一致性（正确）、按键实际应用（正确）和输入及时性（体验）。**要么有可重复证据证明窗口调参改善，要么保持原值并研究本地输入排队/网络策略**。
- 不修改发布版本或接入未授权 KOF ROM、购买的会员天数押注、玩家隐私与真金支付；仍不宣称优于 Kawaks 1.45。

## 下一步

1. 回收 [P0-014A GitHub CI](https://github.com/wpuu/kof/actions/runs/40693239358) 编译及九场真实 Chrome 结果。
2. 对 12/16/20 分组计算双端采集→模拟应用中位数/p95（样本很少只能描述），同帧一致性、超过 250ms 的失败场次，以及是否实测 WaitRecommendation/停帧。
3. 完成零丢包与仅延迟基线（W12/16/20）后，再判断更大预测窗口是否真正降低停帧；如果高延迟下仍有 500–800ms 输入等待，优先改确定性本地按键事件缓冲与实际网络路径，不用无限调大预测窗口掩盖问题。
4. 真实 Windows、华为、iPhone Safari/Chrome 和不同运营商连 20 局之前，**商业 NO-GO**。
