# P0-008｜输入延迟与连续丢包组合、重复试验（2026-10-27）

**状态：已完成受控故障特征测试，发现必须修复的产品级一致性缺陷。**

## 执行条件与边界

- 测试对象：`developerrutu/neon-fist@c28ffb7e7e81ed8f9cec274772c43c30d2876d42`，只在 CI 临时副本应用 [29B 历史输入冗余补丁](../lab/patch_neon_redundant_input.mjs)。
- 浏览器：GitHub Actions Ubuntu 临时 runner，两个独立 Chrome 155 browser context，各自运行真实游戏。
- 双方经 WebRTC DataChannel 实际同步 P1 / P2 输入。浏览器加载游戏时 ICE 配置仅测试性改成 host-only，同机可直连；不涉及真实运营商、NAT、TURN。
- 传输故障注入：使用 immutable Buffer 副本，在 `fight` 游戏输入包发送前人工排队 `45` 或 `90` 毫秒/方向，同时故意丢弃 HOST 的第一个连续 `1` 或 `4` 个非零输入包。**这些都是人为额外发送延迟和确定性丢包，不是现实网络的 RTT/丢包分布。**
- 双方运行到相同的目标模拟帧时暂停，比对 `hashGameState` 及 P1/P2 坐标；若同帧 hash 不等即记 `DIVERGED`。Green CI 表示**诊断执行成功**，不代表游戏质量成功。

## 初次组合诊断结果

证据：[GitHub Actions #40462383605](https://github.com/wpuu/kof/actions/runs/40462383605)。

| 每方向额外延迟 | 连续丢输入包数 | 桌面↔桌面 | 桌面↔触屏模拟 |
|---:|---:|---|---|
| 45ms | 1 | CONSISTENT | CONSISTENT |
| 90ms | 1 | CONSISTENT | CONSISTENT |
| 45ms | 4 | CONSISTENT | CONSISTENT |
| **90ms** | **4** | **DIVERGED** | CONSISTENT |

这已经证明不能把“90ms 单独通过”和“4 连丢单独通过”理解为“组合场景也一定通过”。

## 五次重复压力试验

证据：[GitHub Actions #40462568356](https://github.com/wpuu/kof/actions/runs/40462568356)。每次独立 runner，均用人工 90ms/方向额外发送延迟 + HOST 连续丢失四个非零输入包。每次测试桌面互联和模拟触屏互联。

| 重复编号 | 桌面↔桌面 | 桌面↔模拟触屏 |
|---|---|---|
| 1 | DIVERGED | DIVERGED |
| 2 | DIVERGED | CONSISTENT |
| 3 | DIVERGED | CONSISTENT |
| 4 | DIVERGED | DIVERGED |
| 5 | DIVERGED | CONSISTENT |
| **计数** | **5/5 同帧哈希不同** | **2/5 同帧哈希不同** |

总计十次短时测试，7 次同帧状态不一致。**这不是现实用户的失败概率，不具统计外推意义**。但它清楚证明当前只靠 4 帧历史冗余的方案，在这项模拟故障组合中不够稳健。

在部分失败记录中，P1.x 相差 3.2 或 6.4 像素，且同帧 hash 不同。游戏通常仍保持 DataChannel ACTIVE，不能只通过“两个客户端都在继续动”判为成功。

## 重要计数器说明

实验补丁记录 `historyCorrections` 与 `unrecoverablyLate`。当前 `unrecoverablyLate` 在每次收到超出回滚窗口的**重复历史帧**时也可能增加，并不只代表丢失的真实关键帧，某些日志超过 200 次。**绝不能把该计数器解释为丢包数量或严重故障次数**。后续需要区分“迟到但未变化的重复帧”和“关键输入冲突且已经超过回滚窗口的帧”，并对重复帧去重。

## 下一步优先工程

1. 设计输入 `ACK` 与缺失帧请求 / 选择性补发协议，维护短期帧历史和序列号；不只不断增加每帧冗余字节。
2. 确保协议版本兼容性和最大输入包/帧范围验证，防止错误客户端或恶意包导致资源异常。
3. 针对无法恢复的帧强制停止“可信计分”，让本局待复核或作废，不能悄悄以不同状态继续结算比赛。
4. 真正持续模拟具有变化的延迟、抖动和随机丢包，组合目标至少包括 30/60/100/150ms 实际模拟传输参数、1/4/5/8 包丢失、20 局连续过程和同帧 hash。
5. 取得 Windows、华为和 iPhone 不同网络的真人真机数据，才能评估是否具有畅玩空间式的网页与手机跨端体验。
6. 对所有内置比赛成绩、会员或有价权益，仍执行版权、游戏运营资质及相关法律门禁；这些实验不构成商业上线许可。

GitHub 工作流：[P0 组合压力](../.github/workflows/p0-combined-impairment.yml)｜[90ms+4 连丢五次重复](../.github/workflows/p0-90ms-repeat.yml)。主跟进任务：[Issue #5](https://github.com/wpuu/kof/issues/5)。

**阶段结论：P0 原型验证继续；可靠网络联机商业发布 NO-GO。**
