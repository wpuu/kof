# P0-005｜双独立浏览器真实游戏联机与同帧哈希验证（2026-10-27）

## 结论

**P0-005 达到“同机两浏览器游戏联机”验收门槛。仍不是实际异网与真机验收。**

固定的上游游戏源码：`developerrutu/neon-fist@c28ffb7e7e81ed8f9cec274772c43c30d2876d42`；Chrome 155；GitHub Actions Ubuntu 临时 runner。

测试脚本为 `lab/neon_two_peer_smoke.mjs`，工作流：

- `.github/workflows/p0-two-peer.yml`
- `.github/workflows/p0-peer-delay.yml`

测试脚本通过 UI `NETPLAY`、`HOST`、`JOIN`、`ACCEPT` 交换游戏实际生成的 Base64 SDP。两端使用独立 Chromium browser context，游戏各自在客户端运行，两个真实 DataChannel 建立并每帧交换输入包。**不是单个浏览器自带的 loopbackTest**。

为保证 CI 不依赖外部 STUN 访问，页面响应中的 `iceServers` 仅在 CI 测试时改为空（host-only ICE）；不改变上游仓库内容、不涉及公网部署。该测试不能覆盖 NAT 穿透或 TURN。

## 测试结果（有远程 Actions 证据）

| 测试 | 桌面浏览器互联 | 桌面 ↔ 模拟移动触屏 | 原始证据 |
|---|---|---|---|
| 不额外增加延迟 | PASS | PASS | [Actions #40460229281](https://github.com/wpuu/kof/actions/runs/40460229281) |
| 45ms 每方向额外发送延迟 | PASS | PASS | [Actions #40460492651](https://github.com/wpuu/kof/actions/runs/40460492651) |
| 90ms 每方向额外发送延迟 | PASS | PASS | [Actions #40460492651](https://github.com/wpuu/kof/actions/runs/40460492651) |
| 在相同模拟游戏帧暂停，比较两侧游戏状态哈希 | PASS（两种设备模式） | PASS（两种设备模式） | [基线同帧 #40460819794](https://github.com/wpuu/kof/actions/runs/40460819794)、[延迟同帧 #40460819965](https://github.com/wpuu/kof/actions/runs/40460819965) |

用例还核实：
1. Host 按键控制 P1，两端都看到 P1 移动。
2. Guest 按键或模拟触摸控制 P2，两端都看到 P2 移动。
3. 两端 `Net.active`、`remoteFrame` 证明 DataChannel 持续收到**游戏输入**。
4. 在指定的未来帧，两端分别暂停，只有 frame 相等才判断状态 hash 是否一致；三个延迟组均找到两端同帧且哈希一致的样本，未发现同帧哈希不一致的采样。
5. 同机 45ms 场景观察到回滚计数有时严重不对称（如 0 与 30）；90ms 场景两端都有回滚（例如 30 与 33）。这不等于缺陷，值得长期记录。

## 压力测试方法和局限

- 通过 Playwright `context.addInitScript` 包装 `RTCDataChannel.prototype.send`，只延迟 `fight` 通道的 9 字节游戏输入。为避免上游重复使用的 9 字节缓冲区在计时器等待期间被覆盖，先 `ArrayBuffer.slice(0)` 再延迟。
- 45/90ms 是**人为增加的单方向输入发送延迟**。不是路由 RTT 测量，不包含互联网抖动、丢包、链路排队、设备解码或输入采集延迟。
- 仅进行了若干秒完整输入同步/渲染，尚未完成 20 场连续实战、实际胜负结算和多人长期稳定性。
- 同帧哈希使用原游戏 `NEON.hashGameState(Game,P1,P2)`：能检查该函数包含的核心状态，不意味着检查了所有渲染、音频或局部 UI 状态。
- “模拟移动触屏”是 Chromium 的 `isMobile/hasTouch` 模拟，**不是 iPhone Safari 或华为 Android 真机**。
- 参赛者信用、反作弊、P2P 结果提交，以及有价权益结算仍未通过安全/法律审查；不允许付费上线。

## 下一步技术优先事项

**P0-006：**增加可复现的输入丢包和随机延迟抖动情景，要求真实双端游戏仍能持续并在同帧下保持一致。需要特别调查上游 9 字节 `[frame, mask, checksum]` 输入包是否具有丢失帧恢复能力；当前发送使用 `ordered:false, maxRetransmits:0`，不能假定 UDP 数据自动可靠传达。

**P0-002：**实际 Windows、华为、iPhone 以及跨运营商和 STUN/TURN 联通率，仍没有真机权限和测试证据。

状态：**P0-005 已完成，P0-006 待执行。**
