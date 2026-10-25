# 浏览器 P2P 诊断页

文件：[p2p_probe.html](p2p_probe.html)（纯静态，无 KOF 内容，无第三方 ROM，无支付）。默认只使用 STUN；可自定义 STUN 地址以排除特定 STUN 服务在网络中不可达的问题。**不能通过此页面测出真实游戏输入延迟或 60 FPS。**

## PC 使用
1. 克隆 `wpuu/kof`，在仓库目录执行 `python -m http.server 8080 --directory lab`（Python 版本命令也可能是 `py -m http.server 8080 -d lab`）。
2. 在 Windows 浏览器打开 `http://localhost:8080/p2p_probe.html`。
3. 测试两台设备时，建议通过 HTTPS 静态页面服务分发相同文件；部分浏览器的 WebRTC API 与剪贴板受安全上下文限制。局域网 HTTP 也可尝试，但不保证每个平台都支持。**尚未配置 GitHub Pages，也没有公开部署本文件**。

## 手动联机（两个浏览器）
1. 设备 A 选择“生成 Offer”，等待 STUN 收集完成，复制自己的 JSON。
2. 设备 B 将 A 的 JSON 贴入“对方信令”，选择“读取邀请并生成 Answer”，复制其 JSON。
3. 设备 A 将 B 的 Answer 贴入，点“应用 Answer 并连接”。
4. 等待 DataChannel open，记录 RTT p50/p95、应用层 3 秒超时数量及 ICE 类型。每组合重复至少 10 次；手机、电脑在异网时尤其有意义。
5. 失败时尝试另一 STUN 地址并记录变化；若均失败，需要独立评估 TURN 中继，不要把“网络快”当作 P2P 必然成功。

**隐私提醒：**ICE/SDP 信令可能含网络连接元信息。只通过可信方式和被测者交换，不要发到公开群、公开仓库或网页。页面没有向本项目服务器主动回传测试结果。它会和配置的 STUN 服务器发生必要网络请求。

## 检查边界
- 2026-10-25 已完成源文件 JS **语法检查** 与 GitHub 文本回读一致性。
- 自动 Chromium 无头页面加载测试未获得明确通过结果，不能认定浏览器功能已验收。
- 华为/苹果/Windows 真机、异网联通与实际延迟 **尚未测试**。
- 如需记录实测，填入 [P0 验收表](../docs/P0_ACCEPTANCE.md)。

此页面是临时实验工具，非商用网络质量监测服务。