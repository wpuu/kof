# KOF / Browser Fighting Platform — 项目研究基线

状态：**Research / P0 技术验证前**。首次写入：2026-10-25。

本仓库承接格斗游戏平台商业研究与技术验证，目标是低投入验证“**浏览器打开即玩、PC/手机跨端、P2P 回滚联机、格斗社区、赛事工具及会员服务**”。

## 当前路线
1. **P0：** 用无 KOF ROM、无第三方受限素材的测试格斗原型验证浏览器性能、P2P 与联机断线表现；按不同设备和网络测试。
2. **P1：** 基于获得合法授权的游戏，做约战、房间、赛程、战绩、观战辅助工具。首先验证真实用户留存和收费意愿。
3. **P2：** 若验证成立，再考虑自研原创格斗游戏、更多合法内容、付费会员与赛事商业化。
4. **未解除限制：** 未取得 KOF 授权前不分发 ROM/游戏资源；买来的天数用于比赛输赢、观众押注属于单独法律审查事项，**不能因设置 VIP 和天数就认为合规**。

## 已确认的产品原则
- “赔率 50%”=投入 100，净赢 50，连本金返还 **150**，不可理解为只返还 50。
- 采用 **方案 B**：赢家拿回本金，仅从输方池提取约定手续费后按赢家投入比例分配。手续费率未确定，也未批准上线。
- 只允许**整数天数**作为业务输入；零点几天不准下注，取整不允许向上增发。内部会计精度和尾差处理尚需设计验证。
- 会员有效期与天数余额分离；周资格为连续 7×24 小时；可单卖无赠送天数的资格。
- 非会员 **2 天天数兑换 24 小时使用**。兑换是否恢复预测资格：待确认。
- VIP 可以不同档位（铜/银/金等）每日领取不同资源，完成/赢得比赛的新增天数必须消耗有限资源。资源种类、发放量、消耗与奖励率均待定，**须按满额领取模拟成本**。
- 参与页倾向仅显示两侧人数，隐藏双方总天数；赛后公开结算依据。具体规则待法律审查。
- 不把无奖励的朋友互刷描述成“无限增发”：只转移已有天数时，总余额守恒。

## 文档
- [已确认决策与待定边界](docs/OWNER_DECISIONS.md)
- [第三方项目静态审查](docs/OPEN_SOURCE_AUDIT_2026-10-25.md)
- [跨端 P2P 验收合同](docs/P0_ACCEPTANCE.md)
- [商业与版权关口](docs/COMMERCIAL_LEGAL_GATES.md)
- [本轮交接与下一步](docs/STATUS_2026-10-25.md)

## 纪律
本轮只审外部仓库公开源码、许可证与官方资料。**没有宣称已在用户华为/iPhone/Windows 上实测，也没有上线服务、配置支付、添加 KOF ROM 或代理版权授权。**后续每完成有价值阶段，将证据和结论提交本仓库；未通过条件时明确记录阻塞与下一步。

*所有外部项目代码与素材必须按各自许可证核对；MIT 引擎许可不覆盖未经许可的第三方人物和音乐。*

## 执行任务
- [P0-001｜隔离复测 Neon Fist](https://github.com/wpuu/kof/issues/1)
- [P0-002｜PC、华为、iPhone 跨端真机实验](https://github.com/wpuu/kof/issues/2)

## 2026-10-27 最新执行成果
- [本轮实测状态与未完成项](docs/STATUS_2026-10-27.md)
- [原项目真实测试与实际安全问题](docs/P0-001_RESULT.md)
- [管理员接口安全补丁与 280 项通过证据](docs/P0-003_ADMIN_GUARD_RESULT.md)
- [全部 GitHub Actions 运行记录](docs/P0_CI_EVIDENCE_2026-10-27.md)
- [Issue #3 管理员 RBAC / 生产鉴权](https://github.com/wpuu/kof/issues/3)
- [Issue #4 自然网络回滚/同步专项](https://github.com/wpuu/kof/issues/4)

**注意：自动化浏览器/同机 P2P 成功 ≠ 安卓/iPhone 真机异网成功；受控恢复 ≠ 自然延迟环境的回滚能力验证。**

## 本轮联机突破（2026-10-27）
- [P0-005：两个独立浏览器真实游戏联机＋0/45/90ms 延迟同帧哈希](docs/P0-005_TWO_PEER_RESULT.md) — 已在 CI 通过，同机实验，不代表真实异网。
- [P0-006：丢 1 包原版不同步；29B 先前四帧冗余恢复丢 1—4 包，5 包仍不同步](docs/P0-006_PACKET_LOSS_RECOVERY_2026-10-27.md) — 已在 CI 复现与对照验证。
- [后续任务 #5：生产级输入 ACK／选择性补发及超限作废](https://github.com/wpuu/kof/issues/5) — 未执行完成。

### 2026-10-27 最新网络压力实验
- [P0-008：真实双端“延迟＋连续丢包”组合与 5 次重复实验](docs/P0-008_COMBINED_IMPAIRMENT_2026-10-27.md)
- [首次组合实验](https://github.com/wpuu/kof/actions/runs/40462383605)、[90ms+4 连丢五轮重复](https://github.com/wpuu/kof/actions/runs/40462568356)：桌面端五轮全部出现同帧状态不一致，模拟触屏五轮出现两次不一致（仅实验室样本，不是现实网络失败率）。
- 当前不得使用四帧冗余原型进行有价比赛、成绩结算或公开收费对战。需推进 [Issue #5](https://github.com/wpuu/kof/issues/5) 的可靠 ACK/选择性补发及不可恢复状态下的作废。

- [P0-009：下一开发阶段可靠输入 V2 技术规格（未实现）](docs/P0-009_RELIABLE_INPUT_PROTOCOL_DRAFT.md)。

## 2026-10-27 对照 Kawaks 1.45 的下一步联机方案
- [Kawaks 联机体验与现代回滚网络架构对照](docs/KAWAKS_NETPLAY_REPLACEMENT_PLAN_2026-10-27.md)
- [V2 独立协议实际测试结果：18/18通过](docs/P0-010_V2_CODEC_ACK_RESULTS_2026-10-27.md) — **不是游戏端联机验收**。
- [V2 输入数据包代码](src/netcode/v2_protocol.mjs) / [有限补发与ACK模块](src/netcode/v2_reliability.mjs)
- [V2 GitHub Actions](.github/workflows/p0-v2-protocol.yml) / [下一阶段 Issue #5](https://github.com/wpuu/kof/issues/5)

## 2026-10-28：成熟联网项目调研与独立对照任务
- [C01｜Fightcade / SNK 98UMFE / GGRS / Matchbox / Extreme Bevy / Tough Love Arena / Slippi / RMG-K，附 Reddit、B站社区反馈及许可证](docs/2026-10-28/C01_NETPLAY_SUCCESS_CASES.md)
- [P0-012｜比较 GGRS＋Matchbox 成熟浏览器回滚架构与现有 JS V2](https://github.com/wpuu/kof/issues/6)：按真实代码、同帧哈希、延迟/丢包和手机异网测量做选择，**不是立即替换所有现有代码**。
- 当前 V2 的 25/25 纯协议单测和同机五包补发已通过；**Neon Fist 真游戏集成 #40541315755 仍失败，双方进入 VOID/MALFORMED**。不得宣传为上线成功。
