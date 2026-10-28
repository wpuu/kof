# C08｜P0-013D：非零输入对齐的 90ms±20ms 抖动＋五包丢失十轮验收

日期：2026-10-28（北京时间）  
关联：[Issue #7](https://github.com/wpuu/kof/issues/7)、[上阶段 C07](C07_P0_013_GGRS_IMPAIRMENT_PASS.md)。

**执行状态：已提交改造代码、CI 已启动；最终通过率以真实运行日志回收为准，本文初始状态不宣称通过。**

## 一、为什么要有这一轮

[C07 #40674731228](https://github.com/wpuu/kof/actions/runs/40674731228) 证明 GGRS＋Matchbox 原创方块例子能在一台 GitHub runner 上两独立 Chrome 进程间真实联机，0/45/90ms 人工发送延迟＋4/5 包丢失四组短测均同帧位置/速度一致。但“数据通道发送包已丢失”**不等于**“丢掉了玩家确实按键后的关键操作输入”；一次短测也不能证明高可靠性。

## 二、交付物

- [非零输入 CI 代码注入](../../lab/patch_matchbox_nonzero_input_probe.mjs)：先调用 P0-013 旧版量化状态探针，在临时 Bevy/GGRS 上游副本中增加 `wasm-bindgen` JS 回调。
- [真实浏览器与丢包注入脚本](../../lab/matchbox_nonzero_input_web_smoke.mjs)：采用两个独立 Chrome 进程、自托管信令、直接包拦截；仅在 Rust 引擎首先采集到 HOST **非零键盘 mask** 后，立即允许 HOST 侧丢包。
- [10x 构建/测试工作流](../../.github/workflows/p0-013d-nonzero-10x.yml)：静态预检 → 优化 WASM 与 Matchbox server **只编译一次** → `wasm-bindgen` → 上传 SHA-256 完整性校验的短期 CI artifact → 十个独立测试任务。失败仍保留原始日志，不能删除不利样本。
- [真实 CI #40689108165](https://github.com/wpuu/kof/actions/runs/40689108165)。

## 三、实验严格口径

1. 锁定 Matchbox 源 `9ed2495cd48c007f7a19e95dd5fcd64434b4879a` 和当前 Bevy/GGRS 依赖锁文件，避免把不同代码版本的不同表现当作网络改进。
2. 每轮两套独立 Chrome 进入同一网页房间；浏览器后台引擎 `read_local_inputs` 捕获非零键盘 mask 时同步通知测试脚本，记录第一个本地 `handle/frame/mask`。
3. 接收端在正式 `move_cube_system` 应用非零 `inputs[p.handle].0.inp` 时经 wasm-bindgen 回调，按 `player handle 0/1` 记录非零输入实际用于 GGRS 物理模拟。两个浏览器都要求看见两个角色各至少一次非零模拟输入。
4. HOST 只能从“本地非零输入被真实采集”时开始丢掉其后 **5 次**不可靠 GGRS DataChannel 发送；只说“后续数据包”不说每包一定对应一个非零帧，因为 GGRS 可批量编码/冗余。
5. 延迟为每方向 **90 ms 人工发送等待，加减最多 20 ms 的可复现伪随机抖动**；它是独立测试层添加的发送时序，不是现实端到端 Ping。
6. 各端真实移动成立、同一模拟帧状态（量化位置/速度）一致、丢包次数精确、实际延迟发送数大于零、非零输入回调与双端角色应用均出现且无必要资源错误，才把该轮判 PASS。
7. 十次相互独立的 CI runner，**不假设任何一轮 PASS**。若有 FAIL，记录哪一种条件不满足，是浏览器焦点/键盘、Rust wasm-bindgen 导入、数据通道、状态哈希还是资源环境；不能只重跑绿灯来遮掩。

## 四、目前无法声称的事项

- 未逐包解码 GGRS 内部编码，故目前仅证明故障发生在**非零按键采集之后**；还不能证明丢掉的五包全都携带对应非零操作帧。若需确证必须对 GGRS 消息格式作测试专用解码或在 Rust 发送前绑定帧序列。
- 仅在 CI Ubuntu x86 的 Chrome 上测同机网络，不能用此实验推导现实 China Telecom/Unicom/Mobile 运营商质量、NAT/TURN 成功率、iPhone Safari 或华为 Android Chrome。
- 当前官方 Bevy 样例是移动方块、`f32` 浮点物理，并非具有《拳皇98》命中冻结/招式帧/硬直/格挡的正式格斗引擎。格斗游戏及 ROM 商业授权独立。
- 没有连续 20 局、玩家可感知输入延迟 p95、重连、断线、观战安全或可信付费赛果验收。作废/中止不是可玩性胜利。

## 五、下一阶段门禁

取得真实 10x 结果后才做决策：
- 如果全部 GO：增加更严格“故障包绑定非零帧”验证、随机乱序、长局和跨设备；
- 如果部分 FAIL：保存全部失败与最小复现，先修测试准确性或协议恢复缺陷，重跑**全部 10 轮**而不 cherry-pick；
- 如果根本无法生成 WASM 或出现 JS/WASM 桥接错误：把具体构建日志、依赖、错误码放入 Issue #7，先修构建而不是报告网络质量。

技术路线继续是：**GGRS＋Matchbox 优先作为原创网页格斗原型的联网基座，现有 JS V2 保留作独立对照，不提供无授权 KOF ROM 或有价天数竞猜。**
