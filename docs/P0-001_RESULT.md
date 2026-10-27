# P0-001 — Neon Fist 隔离测试结果（2026-10-27）

**当前状态：部分通过 / 未达到生产上线标准。**

## 锁定对象

- 上游仓库：https://github.com/developerrutu/neon-fist
- 上游不可变提交：`c28ffb7e7e81ed8f9cec274772c43c30d2876d42`。
- 测试在 GitHub Actions 公共仓库 `wpuu/kof` 的一次性 Ubuntu runner 中执行；Node 22、Chrome 155。
- 没有使用 KOF 游戏 ROM、SNK 素材、任何真实付款/有价权益或用户本机设备。

## 真实执行结果

| 执行项目 | 真实结果 | 证据 |
|---|---|---|
| 上游 `npm ci --ignore-scripts` | 完成 | [Actions #40456437674](https://github.com/wpuu/kof/actions/runs/40456437674) |
| 上游 `npm test` | **277 passed, 0 failed**（上游已有的测试，不是独立验收全集） | [Actions #40456437674](https://github.com/wpuu/kof/actions/runs/40456437674) |
| 服务器和测试入口 `node --check` | 通过 | [Actions #40456437674](https://github.com/wpuu/kof/actions/runs/40456437674) |
| 无认证管理接口实际请求 | 本地 `POST /api/admin/config/kill` 在不提供管理员认证信息时返回 **HTTP 200** | [Actions #40456971677](https://github.com/wpuu/kof/actions/runs/40456971677) |
| PC Chromium 页面启动与比赛开始 | **PASS**；角色键盘移动，x 从 330 到 448.9，游戏帧 137→168 | [Actions #40457467796](https://github.com/wpuu/kof/actions/runs/40457467796) |
| 浏览器内 DEBUG FPS 抽样 | 桌面约 **60.01 FPS**（仅短时样本，非稳定帧率保证） | 同上 |
| 手机触屏浏览器模拟（非真机） | **PASS**；模拟触控使 P1 x 从 330 到 457.1，游戏帧 133→167；Chrome 模拟视口 390×844 | 同上 |
| 原游戏本地网络回环 | DataChannel active = true；remoteFrame=53，Game.frame=58 | 同上 |
| 90 ms 人工网络延迟下的回滚 | `DEBUG.rb=0`；**未证明真正触发恢复/重放。仍需专项测试** | 同上 |

## 新确认的安全阻断

源文件 `src/server/liveopsRoutes.js` 的管理路由 `/admin/config/publish`、`/admin/config/rollout`、`/admin/config/kill` 和 `/admin/sunset` 未设置可见认证/授权检查。此次已不只停留在静态猜测：在隔离的本地服务中，未登录 POST /api/admin/config/kill，能改变 stable 通道状态（HTTP 200）。**禁止将当前版本作为真实运营服务器直接暴露公网。**

后续修复必须覆盖：账户认证、管理员角色授权、拒绝时的 401/403、操作审计与日志保护、API 权限绕过测试；不能只给 UI 隐藏管理按钮。结果自报与简单 state hash 同意也不等于公正游戏裁判，更不能驱动有价天数结算。

## 已知源码/声明偏差

- 仓库 LICENSE 文件为 MIT，但 `package.json` 填写 ISC，许可证元数据需修正与素材级追溯。
- README 写 `npm start`，实际脚本只有 `npm test`、`npm run server` 和 `npm run dev`。
- ICE 默认只使用 Google STUN，未提供 TURN 中继策略；在大陆跨运营商/移动网的真实可达率未知。
- 浏览器页面 demo 60 FPS 数据仅来自 GitHub Actions 一次短时运行，并非 Android/iOS 真机或产品级连续负载测试。

## P0-001 下一步

1. 为无认证管理接口建立专项修复任务，先验证生产请求被拒绝，再允许进一步演示。
2. 使用隔离分支复测 Session/Auth 设计、结果校验与存储；更改代码必须附回归测试。
3. 细化有意触发 rollback 的浏览器自动化用例。当前仅验证 netplay 连接和远端输入有数据。
4. 继续 P0-002 异网和安卓/iPhone **真实硬件**测试。
5. 除纯技术测试外，游戏运行、收费和付费权益结算仍分别需要相应内容许可与法规评估。

**判定：测试环境可继续；公网收费产品 NO-GO。**
