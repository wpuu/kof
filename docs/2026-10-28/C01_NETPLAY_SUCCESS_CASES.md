# C01｜成功联机案例、社区反馈和 GitHub 复用可行性审计

- 编号：2026-10-28/C01
- 关联仓库：https://github.com/wpuu/kof
- 研究时间：2026-10-28（北京时间）
- 状态：**公开资料和源代码许可调研已完成；本次没有部署、克隆、运行这些新增候选项目，也没有声称它们在中国运营商网络通过测试。**
- 目标：找“已经有用户、已经实现回滚、能用于网页/手机或模拟器”的实际案例，避免为了比 Kawaks 1.45 更好而从零重复研发。

## 执行摘要

**路线不是二选一：**

- **经典 KOF / 街机体验对标：**Fightcade + SNK 自己的 Steam KOF 98 UM FE 回滚版，辅以 RetroArch、Slippi、RMG-K 的模拟器保存/回滚实践。这些证明具体网络模型和版本一致性的重要性，**并不自动授权我们收费使用 SNK 内容**。
- **原创网页 + 手机联机的可复用技术候选：**GGRS (Rust rollback) + Matchbox (Rust WASM/WebRTC signaling/socket) + Extreme Bevy 示例代码，先以可自由使用的原创角色验证。此组合不是可直接给现有 JS Neon Fist 安装的 npm 插件，跨语言整合成本需单独测试。
- **用户体验商业标杆：**Tough Love Arena 已经多年公开网页可玩，并在 2026-08-26 发布 Steam 版，支持浏览器跨平台与 rollback，免费网页版 + 付费游戏/外观是真实存在的商业设计；**没有财务数据能证明它赚钱。**

## 已验证案例矩阵

| ID | 项目/网址 | 证明什么 | 源代码/商用适用性 | 对 wpuu/kof 的建议 |
|---|---|---|---|---|
| A1 | Fightcade https://www.fightcade.com/about ; 原型源码 https://github.com/fightcadeorg/fightcade-fbneo | KOF 等经典街机游戏在 FBNeo/GGPO 上有真实长期线上对战社区，属于最贴近目标的成功参考 | GGPO 组件 MIT；**FBNeo 自身许可证明确禁止为它获利/接受项目捐赠，且无 ROM 分发权**；不能原样复制进收费平台 | **首要对标**；分析回滚、存档、版本/BIOS 同步和失败诊断，做体验对照，不直接复用收费 FBNeo |
| A2 | SNK KOF '98 Ultimate Match Final Edition https://www.snk-corp.co.jp/cn/press/2021/122101/ | **SNK 官方 2021-12-21**将 Steam 98 UM FE 升级 rollback + 9 人大厅 + 观战；Code Mystics 的官方更新史 | 专有商业游戏，和 1998 街机原版并非同一内容；无源代码直接复用许可 | **正版官方性能/UX 基准**：可在用户已合法购买的副本上作同网络对照，不复制代码、ROM、素材 |
| A3 | GGPO SDK https://github.com/pond3r/ggpo ; 开发指南 https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md | MIT C++ 回滚 SDK（包括 VectorWar 示例），要求确定性模拟、帧存档、恢复、无渲染重演 | MIT，可依许可商用；但其现有桌面 Socket/C++ SDK 不等于浏览器/WebRTC 现成可用 | **学习及可能复用算法，适合原生授权模拟器**；不要将它当成现成网页软件 |
| A4 | GGRS https://github.com/gschup/ggrs | Rust 成熟 GGPO 风格 rollback 库，支持 WASM 与 Matchbox，提供同步测试/观战示例 | MIT 或 Apache-2.0，适合合法商用；仍要自己做确定性游戏引擎 | **优先技术候选**，对比现有 V2 的 confirmed frame、prediction、save/load 和 catch-up |
| A5 | Matchbox https://github.com/johanhelsing/matchbox ; 示例 https://github.com/johanhelsing/matchbox/tree/main/examples/bevy_ggrs | 为 Rust WASM/原生提供 WebRTC 不可靠与可靠通道、信令服务器、GGRS socket；公开浏览器 2/4 人实例 | MIT 或 Apache-2.0；需 self-host 信令，真实 STUN/TURN 穿透要测 | **优先复用 WebRTC 连接/匹配层**，不必自己再设计基本信令协议 |
| A6 | Extreme Bevy https://github.com/johanhelsing/extreme_bevy ; 作者演示 https://helsing.studio/extreme | 使用 Bevy + GGRS + Matchbox 实现网页 P2P 回滚动作游戏，附教程和源码 | 仓库声明 CC0 **但角色 sprites 是例外**：源项目作者尚未确认能够将参考游戏精灵素材按 CC0 重授权 | **最佳小规模上手样板**：复制架构/获授权代码，不复用有疑义的 sprites |
| A7 | Tough Love Arena https://toughlovearena.com/ ; Steam https://store.steampowered.com/app/1807330/Tough_Love_Arena/ | 免费网页即玩、rollback、移动端操作及 Steam 跨平台，2026-08-26 发行付费版；官方持续更新 | 可看到部分官方 GitHub 组件，但**整个游戏及素材未被证明全部开源可商用** | **产品标杆**：测试真实移动端 UI、房间链接、在线体验、免费＋付费转换，不直接复制专有游戏 |
| A8 | Slippi https://slippi.gg/ ; Wiki https://github.com/project-slippi/slippi-wiki/blob/master/GETTING_STARTED.md | 在既有 Melee 模拟器中实现回滚、匹配和录像的长期实际项目 | 公开一些 launcher/emulator 组件，但 Wiki 说明 matchmaking 服务端是私有仓库 | **模拟器接入设计参考**；不可当作完整开源可部署后端 |
| A9 | RetroArch https://docs.libretro.com/development/retroarch/netplay/ | 完整技术文档公开解释序列化存档、全帧输入历史、可靠有序 TCP、延迟过大时暂停同步，支持多人观战 | 多组件/核心各自许可证复杂；ROM 权利独立 | **重点学习“落后必须等数据，不能静默丢帧”机制**，不是一键可商用 KOF 网页引擎 |
| A10 | RMG-K https://github.com/Jay-Day/RMG-K | 2026 年将 GekkoNet rollback 接入 N64 模拟器，提供 P2P 连接码、帧延迟等；GitHub 有持续 release | GPL-3.0、桌面 N64 而非 Neo Geo，商用派生要严格履行 GPL/依赖许可 | **证明旧模拟器可加 rollback，但无法直接移植到 Kawaks/Neo Geo 浏览器** |
| A11 | Fish Folk: Jumpy https://github.com/fishfolk/jumpy | Rust/Bevy 游戏提供浏览器 demo、2-4 人在线方向，GGRS 社区将其列为使用项目 | 应单独逐项检查它的源码及素材许可，勿预设整包商用 | **较大型游戏参考**，但先不复制游戏资产 |
| A12 | Gamercade https://gamercade.io/faq/ | 公开说明项目网络层使用 GGRS P2P rollback；证明 Rust/GGRS 的实际产品化 | 平台和模块许可证需要另核查 | 商业平台类对照，不优先于 Matchbox 示例 |

### 需要排除或降级的项目

1. **EmulatorJS（现行官方）** https://emulatorjs.org/docs/faq/：官方 FAQ 明确表示 **Netplay 尚未支持**。搜索到的某些旧 fork/docs 写过联网服务器配置，不能据此认定当前主线具备可部署的回滚联机功能。可用作浏览器模拟器/触摸 UI 的技术调查，但不应选择为已解决联网的底座。
2. **Neon Fist** https://github.com/developerrutu/neon-fist：我们的 CI 证实它的初始联网能动，但原版丢一个关键输入帧就可能同帧不同步；4 帧冗余恢复了短丢包，却在 90ms/方向发送延迟＋4 连丢重复试验中仍有失同步。它是**原型，不是市场验证成功的稳定产品**，不能和 Fightcade/GGRS 产品经验等量齐观。
3. **RMG-K N64**不支持直接运行 KOF 98 Neo Geo 版，不能因为同为模拟器就声称可无成本替换。
4. **旧 Kaillera/Kawaks 1.45**：从用户真实测试观察到卡顿和不同步，属于我们要超越的本地对照对象，不能将“P2P”一词当成解决方案。

## 社区/社媒发现：直接对应改进方向

- **2026-06 Fightcade / KOF98 Reddit 用户反馈** https://www.reddit.com/r/fightcade/comments/1uej7hh/kof98_always_desyncs/ ：报告在高带宽环境 30 秒内仍失同步，回复强调训练模式/UniBIOS 与默认 BIOS 不同可能造成分歧。这是**单个社区对话，不是系统性故障统计**。开发要求应是开局强制校验核心版本、BIOS、地区选项、作弊配置、游戏镜像指纹及快照初态，而不只看 Ping。
- **2026-03 Fightcade Reddit 连线质量讨论** https://www.reddit.com/r/fightcade/comments/1ruz376/struggling_to_keep_my_opponent_from_experiencing/ ：一方认为自己流畅、另一方却不断回滚；评论讨论丢包和抖动。双方体验/延迟/回滚应分别采集，不能只看主机端。
- **2026-06 格斗社区讨论旧 delay netcode** https://www.reddit.com/r/Fighters/comments/1ufucs5/what_was_playing_online_like_before_rollback/ ：玩家指出旧延迟算法在低时延线路尚可，一旦跨距离便明显变差。社区观点支持采用成熟 rollback，但不是任何线路 0 延迟的证明。
- **B站 2023：游聚 vs 畅玩平台节奏/延迟对比** https://www.bilibili.com/video/BV1cW4y1Z7jt/ 和 https://www.bilibili.com/video/BV1zu411b7vU/ ：玩家确实比较打击节奏、发招/收招与卡顿。用户感知与模拟器本体的帧数/输入缓冲有关，不能只测网络 RTT。这些是历史用户视频，不代表 2026 年平台运营状况。
- **2026-02 抖音 KOF97 赛事关注** https://www.douyin.com/video/7605081904102132992 说明经典格斗的赛事内容仍有人讨论；**不证明这些观众会为新平台会员付费**。
- **Tough Love Arena Steam 2026** https://store.steampowered.com/app/1807330/Tough_Love_Arena/ ：浏览器免费＋Steam 11.99 美元（检索时页面标价）且附额外权益，已有真实用户评价；浏览器玩家数量/营收未知，不夸大商业效果。

## 版权/许可极重要的区分

1. **Fightcade 是可参考的成功项目，不是可直接复制销售的许可。** https://github.com/finalburnneo/FBNeo/blob/master/src/license.txt 明确限制通过其代码获利和筹集项目捐赠，并禁止无权分发的 ROM；即使 GGPO 自身 MIT，也不改变混合产物的限制。
2. **GGRS＋Matchbox＋GGPO SDK 为可合法复用网络基础提供选择**，但游戏角色、模型、音效、ROM、版权商标仍分别核实。
3. **Extreme Bevy 素材例外**：CC0 代码例子不等于所有精灵图可用。建议制作原创极简色块动作样板。
4. **Tough Love Arena、Steam KOF 98UM FE 是商业产品，不是全部公开的原始游戏代码**。
5. 用户在境外部署、个人经营、网页不让玩家手动下载 ROM，均不构成绕开 KOF 版权的方法。

## 针对当前 wpuu/kof V2 的直接决策建议

### P0-012：先并行比较成熟引擎，再决定是否继续自研整个协议

- **方案 A（现有投资保留）：**V2 JS 现有快速 INPUT + 可靠控制 DataChannel + 选择性 ACK。先修复已经确认的真实双浏览器 V2 游戏集成失败（此前 Actions #40541315755 双端被 fail-closed 标记 VOID/MALFORMED）。必须进入真实游戏层、验证双方完整状态、对 90ms＋4连丢持续测试；如果成熟方案明显更好则停止扩张 V2。
- **方案 B（成熟架构对照）：**锁定 GGRS/Matchbox/Bevy 版本，以 Matchbox 自带的 `examples/bevy_ggrs` 或 Extreme Bevy **代码**，不包含有疑义的 sprites，构建可运行的最简两角色测试页和自托管信令。注意 GGRS 部分托管示例声明配对服务目前离线，不能把线上 URL 能打开视为能联机；真实运行时需自托管匹配服务。
- **方案 C（后续 KOF 方向）：**只在取得合法内容使用方式或授权后，研究具有确定性快照/重演能力、商用许可明确的 Neo Geo 兼容内核。Fightcade FBNeo 由于其非商业条款，不作为未经另授权的收费内核。

### 可验收的比较（拟定工程目标，非现成市场保证）

1. 固定游戏帧 60Hz；通过合成延迟 0/30/60/90/120ms 与抖动/随机及连续丢包的场景。
2. 无异常时两个独立进程/浏览器都能对 P1/P2 方向、轻重攻击、防御、连招作出一致响应；同帧状态哈希一致。
3. 丢 1/4/5/8 帧都必须实现“同状态恢复”或**明确停止结果为无效局**；绝不把静默状态分叉称为 PASS。
4. 采集每一端游戏模拟FPS、p95帧时长、输入响应、回滚深度、补发延迟、不可恢复次数；同时记录 95% RTT/抖动。
5. **Kawaks 1.45 对照**：相同两台 PC、相同网络、相同按键设备、同一实验时段收集真实输赢/是否不同步/操作延迟；最终用户主观盲测，不能只比较不同游戏的帧率。
6. 真实 PC、华为、iPhone 和不同运营商 P2P/TURN，完成连续对战后才讨论公开试运营。

### 下一执行安排

优先新开不改动生产的 **P0-012 架构对比实验**：先做 GGRS＋Matchbox 官方可运行示例的源码依赖和构建复现，确认真实两浏览器、基础输入同步及快照恢复；然后再与本项目 V2 相同条件对比。仅在数据证明后选择继续自研 V2 或迁移。保留既有 V2 25/25 单测、真实 WebRTC 五包补回以及 V2-游戏桥接尚未通过等历史证据，不得冲掉。

**研究总结：业界确有成功实现。对于网页＋手机的原创格斗游戏，最值得投入一次独立验证的是 GGRS＋Matchbox；对于经典 KOF 的网络与手感，最值得对标 Fightcade＋官方 KOF98 UM FE。**

## 2021 官方 KOF 回滚测试的真实玩家规模（新增核查）

这次额外找到 SNK / Code Mystics 在 Steam 官方社区公告的活动报告：https://steamcommunity.com/app/222420/allnews/

- 2021-11-01 发布的第一轮回滚测试总结称一周合计**超过 23 万场**对局（不同测试期，不与后续数据相加当成一个周期）。
- 2021-12-06 发布的第二轮测试总结称：两次测试累计 **超过 4,000 名不同用户**参与，第二轮约 **4 天进行了 120,000 场**对局，前十名活跃用户贡献 4,326 场。这是当时官方公告的历史统计，**不代表 2026 年 DAU，也不证明新平台能复制这组用户规模**。

该数据补强了“KOF98 回滚不是只有 demo、确实曾经接受大量真实对局”的事实，也说明应当通过大量实战发现异常，而不是仅靠几轮同机 CI 就放行。
