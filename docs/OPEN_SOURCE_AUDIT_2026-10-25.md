# 浏览器格斗开源项目复审 — 2026-10-25

## 审查方法与限度
2026-10-25 只读获取 GitHub 仓库元数据、README、LICENSE、package.json、联网与管理路由源码；官方技术文档交叉核验。没有成功克隆源代码到本地运行，也**没有真实浏览器双机/手机联机验收**。以下“已实现”都须区分*仓库声明*与*源码观察*。

## 1. Neon Fist — 优先试验基座，但暂不允许公开部署/收费
仓库：https://github.com/developerrutu/neon-fist

- GitHub 元数据：2026-08-14 创建，2026-08-14 最后推送；审查时只有 1 个初始提交，0 star。缺少外部玩家验证。
- LICENSE 为 MIT，允许在保留许可声明条件下修改和商用**仓库本身拥有权利的代码**。但 package.json 里写的是 `"license": "ISC"`，与仓库 LICENSE **不一致**；商用前修正许可证元数据并排查素材来源。
- 代码：`public/index.html` 为单页 Canvas 2D 游戏，有 touch mask、WebRTC `RTCPeerConnection` 和回滚调度代码；存在可研究的技术骨架。
- `public/index.html` 第 1719 行 ICE 只配置 `stun:stun.l.google.com:19302`，没有 TURN 中继；遇到 P2P 失败的网络可能直接连接不上。STUN 可用性、国内可达性也未实测。
- `src/server/liveopsRoutes.js` 的 `/admin/config/publish`、`/admin/config/kill`、`/admin/sunset` 等管理写入路由缺少认证中间件；README 亦公开承认。**禁止将管理接口裸露在公网。**
- `src/server/signaling.js` 以客户端在 `hello` 中自报 `playerId` / `elo`，并以两端提交一致的 `winnerId` 与 `stateHash` 标记结果 `verified`：这仅说明双方申报一致，**不是服务端重演或能防止两端串通的比赛真实性验证**。不能用此结果驱动有价权益结算。
- README 宣称 `npm start` 可起服务；实际 package.json **没有 start 脚本**，有 `npm run server` 和 `npm run dev`。验证时应按真实 scripts 操作。
- README 宣称 277 项断言与确定性测试；本轮没有在可运行环境验证此数量及通过结果。不能称为已通过。
- README 公开其局限：数据存储内存态、SQL 未在真实 PostgreSQL 执行、缺少身份界面、单角色、单区域匹配。
- 初步结论：适合**本地/隔离的 P0 技术验证**，不适合直接作为商用生产系统。

证据：
- [仓库及 README](https://github.com/developerrutu/neon-fist)
- [许可证](https://github.com/developerrutu/neon-fist/blob/main/LICENSE)
- [实际 package.json](https://github.com/developerrutu/neon-fist/blob/main/package.json)
- [游戏客户端](https://github.com/developerrutu/neon-fist/blob/main/public/index.html)
- [服务器信令与结果](https://github.com/developerrutu/neon-fist/blob/main/src/server/signaling.js)
- [管理/商城 API](https://github.com/developerrutu/neon-fist/blob/main/src/server/liveopsRoutes.js)

## 2. Aether Clash — 可参考多角色/触控，但素材不得直接商用
https://github.com/bangtutorial/aether-clash

- GitHub 数据：2026-09-30 创建；仓库 LICENSE MIT。
- **关键：**`LICENSE-ASSETS.md` 明确规定角色设计、像素图、音视频、场景等素材是 **CC BY-NC 4.0**，未经另外许可不可商业使用。字体 SIL OFL 另计。
- README 可支持单机/双人本地/CPU 等浏览器与手机玩法；本轮**没有证据确认其具有可复用的线上 WebRTC/回滚联机系统**。
- 判定：可参考 UI/触摸代码；**不得整体复制原游戏作为收费版**。欲商用须更换素材或联系权利人另取授权。

证据：[LICENSE-ASSETS](https://github.com/bangtutorial/aether-clash/blob/main/LICENSE-ASSETS.md) · [README](https://github.com/bangtutorial/aether-clash)

## 3. Tough Love Arena — 商业和技术标杆，不是可随意复制的游戏仓库
- 官网 https://toughlovearena.com/ ：浏览器即玩、免费、回滚格斗。
- 官方更新日志：2026-08-26 正式 1.0；2026-10-21 仍更新。
- 其 GitHub 组织 https://github.com/toughlovearena ：公开了一些网站、握手、匹配、打包和部署组件的 MIT 代码。**这些组件仓库开源，不等于整套游戏源代码、角色与音乐均获得 MIT 授权。**
- 2026 Steam 付费版与网页免费版共存、提供高级外观，是“免费浏览器游戏＋自愿付费内容”的实际产品参考；无可信公开数据证明项目净利润或会员转化率。
- 判定：参考产品体验和服务拆分；不复制专有游戏内容。

来源：[官方](https://about.toughlovearena.com/) · [更新日志](https://about.toughlovearena.com/log/) · [GitHub 组织](https://github.com/toughlovearena)

## 4. 其他候选
- [someusername6/rollback-netcode](https://github.com/someusername6/rollback-netcode)：MIT TypeScript WebRTC 回滚库，README 自述仍在积极开发、API 可能变化；是**网络模块候选**，不是现成格斗游戏。
- [ikemen-engine/Ikemen-GO](https://github.com/ikemen-engine/Ikemen-GO)：有成熟格斗逻辑和资源生态，但主要是 Go 原生引擎；**不能直接假定能在 iOS/Android 浏览器原样运行**。引擎授权不涵盖 KOF 人物包/音乐/ROM。
- [Godot 4 Web 官方文档](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)：支持 WebAssembly/WebGL 2.0，移动端性能及 Safari 兼容有约束，且 Web 支持特定网络 API；需真机测试。

## 结论（仅技术选型）
- **P0 选 Neon Fist 作隔离验证基座，提取核心格斗/回滚设计，而非直接上线。**
- 可参考 Aether Clash 的触控方案，但不要复制其非商业素材。
- 以 Tough Love Arena 作为商业体验标杆，研究为何用户愿意付费外观/桌面版。
- 若 Neon Fist 在真机/异网失败，改用更稳定的原创引擎组合；拒绝因为已投入时间而强行继续。

**静态审查 ≠ 可用性验收 ≠ 安全审计 ≠ 商业许可证完整核验。**