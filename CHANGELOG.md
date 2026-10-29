# Changelog

## 0.1.15

- Show live Rabi hook stages, elapsed waiting and timeout limits in the statistics dialog. Expose failure stages, timeout/cancellation reasons, request IDs and measured stage timelines without adding progress to exclusive chart totals. Retain explicit missing-data labels for old records.

- 在统计弹窗直接显示进行中的 Rabi 钩子阶段、等待时间和超时上限；失败记录展示阶段、超时或取消原因、请求 ID 及已测时间线，进度不重复计入占比，旧记录明确标注未采集信息。

## 0.1.14

- Keep hook descriptions, status and expanded readings inside a consistently padded card. Add clear disclosure indicators, wrap long labels and use a single column for detailed readings on narrow screens.

## 0.1.13

- Retain a pre-step listener's own preparation and completion time when it measures only some internal operations. Subtract the union of measured intervals and downstream work, rather than omitting the whole listener. Preserve return values, error identity and exclusive chart totals. Independently verified with 29 focused regressions and an isolated production-loop Host smoke.

## 0.1.12

- Keep stacked charts in normal flow on narrow screens so scrolling never pins a pie over its legend or hook readings. Desktop charts retain their sticky layout. Verified keyboard expansion, 460-pixel viewport fit and light/dark screenshots with real public primitives.

## 0.1.11

- Use Hook-specific success and failure labels in invocation cards instead of model-stream completion labels. Verified in built-client interaction and light/dark browser checks.

## 0.1.10

- Inspect each Rabi lifecycle hook with elapsed time, HTTP status and uncertain, blocked or continued outcomes. Drill into connection discovery, identity checks, API requests and reported server steps; old logs explicitly show unavailable detail.
- Replay timing projection revision 7. Nested server and transport readings share the same exclusive interval, so child charts add up to their parent without inflating turn time. Malformed optional substeps do not discard a valid hook record.
- Verified with keyless timing replay, built-client DOM interaction, connection/lifecycle regression tests and isolated Host smoke.

## 0.1.9

- Keep candidate identities visible in score lists; descriptions remain optional hover text.

## 0.1.8

- Expanded candidate-selection calls show identities, relevance scores, ranks, actual selection outcomes and the rule parameters used for that invocation. Candidate lists expand in batches. Older logs explicitly report missing diagnostics; batch requests do not provide individual timings or written reasons.

## 0.1.7

- Show the live session title on the second dialog row, with scope and counts aligned to the right. Long titles wrap without hiding the counts.

## 0.1.6

- End retry attribution when the next request starts and replay existing logs with projection revision 5, preserving model wait and output as separate stages.

## 0.1.5

- Refresh retained preset declarations through an authenticated activation request so hot-installed preprocessing meters apply to subsequent sessions. Existing Agents retain their revisions and preset configuration is unchanged.

## 0.1.4 — 2026-10-27

- 使用公开监听注册钩子，为旧宿主新建 Agent 补采组件自身的预处理时间，扣除下游等待，不修改既有监听器列表。
- 新旧采集协同去重，卸载后已有包装直接委托原逻辑。
- Meter newly registered legacy pre-step listeners through the public registration hook, excluding downstream waits without editing existing registries.
- Suppress duplicate cooperative readings and preserve delegation after disposal.

## 0.1.3 — 2026-10-27

- 保留父饼图，选择环节后向下追加插件与操作子饼图，移除底部表格。
- 耗时和本级占比并排显示，口径合并到图例第二行。
- 投影版本 4 分配独占操作耗时，避免嵌套和并行请求重复计算；附带宿主预处理采集补丁。
- Keep parent pies and append plugin/operation pies on selection; remove tables.
- Place durations beside percentages and descriptions below labels.
- Partition exclusive operation time in projection version 4 and ship optional host preprocessing instrumentation.

## 0.1.2 — 2026-10-27

- 选择阶段时展示该阶段内记录的操作、辅助模型与钩子，避免继续显示无关的全会话明细。
- 明确标出没有插件或子步骤归属的阶段耗时，历史日志不推测来源；投影版本 3 从原日志回放。
- 新增可选 `chatStageTiming.run`，供插件记录非模型子步骤，保留结果、错误与卸载行为。
- Stage selection shows recorded internal operations, nested auxiliary requests and hooks instead of unrelated whole-session totals.
- Identify missing plugin/substep attribution without inferring historical details; projection version 3 replays stored records.
- Add optional `chatStageTiming.run` for non-model tasks while preserving results, failures and disposal.
## 0.1.1 — 2026-10-26

- 全部耗时统一自动选择单位：超过 1 秒显示秒，最多保留三位小数；1 秒及以下显示毫秒。
- Automatically format every duration: seconds with up to three decimal places above one second, milliseconds otherwise.

## 0.1.0 — 2026-10-26

- 从聊天增强提取为独立插件，包含阶段饼图、逐次辅助模型明细与完整日志投影。
- 保留旧计时记录、投影和可选服务兼容；新记录使用独立命名空间。
- 提供中英文界面与文档，以及算法、流生命周期、DOM 和真实 Host 循环验证。

- Extract detailed timing charts, auxiliary call cards and whole-log projection into an independent plugin.
- Read historical records and preserve projection/service compatibility; write a dedicated record namespace.
- Include Chinese/English UI and documentation, algorithm/lifecycle/DOM tests and a production-loop Host smoke.
