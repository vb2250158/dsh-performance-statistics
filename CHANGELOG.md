# Changelog

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
