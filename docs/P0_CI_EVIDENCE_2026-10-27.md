# GitHub Actions P0 运行记录（2026-10-27）

## 可复核运行

| Run | 代码与范围 | 结果 |
|---|---|---|
| [40456437674](https://github.com/wpuu/kof/actions/runs/40456437674) | 上游固定 SHA、277 项原生断言、Node 语法 | PASS |
| [40456971677](https://github.com/wpuu/kof/actions/runs/40456971677) | 原生断言再次通过；隔离重现未认证管理接口可以关闭 stable 通道（HTTP 200） | 测试通过，**安全失败被确认** |
| [40456861962](https://github.com/wpuu/kof/actions/runs/40456861962) | P2P 浏览器测试首次：等待短暂的 UI 状态字符串 | FAIL；`Timed out: A open DataChannel` |
| [40457116251](https://github.com/wpuu/kof/actions/runs/40457116251) | 修复测试自身的 UI 状态竞争后，两个 Chromium context host-only P2P | PASS |
| [40457467796](https://github.com/wpuu/kof/actions/runs/40457467796) | 原游戏 Chromium 启动、桌面按键、移动端模拟触摸、原游戏本地 WebRTC 回环 | PASS；未证实 rollback 真正发生 |

## P2P 探针成功数据

- GitHub Actions Google Chrome 155.0.8059.39。
- 两个浏览器会话同在一个 runner，**不经过跨城或运营商**，STUN 留空（host-only）。
- 双方 `WebRTC=connected`、DataChannel 成功交互。
- 探针 A：5 次发送、4 次返回、0 次超时、4 个 RTT 样本；RTT 中位数显示 0 ms，p95 1 ms。
- 探针 B：5 次发送、4 次返回、0 次超时、4 个 RTT 样本；RTT 中位数显示 1 ms，p95 9 ms。
- 因测试只需确认“收到有效回复”，样本极少；**不能用于“玩家之间零延迟”的任何广告或承诺**。

## 重要区别

- `host-only` 同机成功 ≠ 家庭宽带和运营商 NAT 穿透成功。
- Chrome 移动模拟 ≠ iPhone Safari 或华为安卓真机。
- Neon Fist 内置 90 ms loopback 接收到远端帧 ≠ 证明 rollback 重演已成功；这次回滚计数 0。
- 测试修复的对象首先是**验证脚本**的瞬态状态监听，不意味着为了通过 CI 修改了真实游戏的联网算法。
- 所有 CI 都只使用测试账户与本地服务，**没有公开提供 SNK 或 KOF 游戏内容**。

## 版本化的可再运行入口

- `.github/workflows/p0-neon-fist.yml`
- `.github/workflows/p0-browser-smoke.yml`
- `.github/workflows/p0-neon-browser.yml`
- `lab/browser_smoke.mjs`
- `lab/neon_browser_smoke.mjs`
- `lab/p2p_probe.html`

真实设备的下一轮测试继续按 `docs/P0_ACCEPTANCE.md` 执行。