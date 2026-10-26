# DSH Performance Statistics

[简体中文](README.md) · MIT

An independent performance statistics plugin for DeepSeek Harness. Click the statistics pill below the composer for a timing pie, exact stage readings, individual auxiliary model calls, first-output latency, output speed and token usage. Durations above one second use seconds with up to three decimal places; shorter durations use milliseconds.

## Install and migrate

Targets the public DSH 0.2.1 plugin APIs; verified with 0.2.1-rc.3. Install this repository through the DSH plugin manager or supported CLI:

```sh
dsh plugin --profile web add github:vb2250158/dsh-performance-statistics#v0.1.1
```

Enable **Performance statistics**, reload the page, send a message, and open the statistics pill after the turn ends. Expand auxiliary call cards or select a pie slice or legend to filter stages.

When migrating, upgrade `dsh-chat-enhancement` to **0.3.81 or newer** at the same time. Older versions that contain statistics compete for the same projection and composer entry and must not run alongside this plugin. Chat enhancement is otherwise optional. Jev purpose and rule labels require `dsh-jev-context-gate >=0.1.37`.

No historical log conversion is needed. The plugin reads legacy `plugin:dsh-chat-enhancement/timing` records, retains the `chatSessionTiming` projection and optional `chatStageTiming` service, and writes new `plugin:dsh-performance-statistics/timing` records. Disabling it releases observers, service and UI without deleting existing records.

## Measurements

The stage breakdown covers input and prompt preparation, model selection, preprocessing, request preparation, context checks and finalization, auxiliary requests, first-token wait, reasoning/answer/tool-argument output, stream and message commit, tool dispatch/checks/execution/postprocessing, result commit, step transitions, turn stopping, compaction, Rabi hooks and retries.

Each auxiliary call shows its plugin, purpose, configured rule names and IDs, route, start time, total duration, first-token wait, time after the first token, and failure or cancellation state. Tool and hook names appear in the independent operation table.

Each millisecond belongs to one pie stage. Nested measurements take priority and parallel tool intervals contribute their union. Independent operation totals can overlap and must not be summed as turn time. Whole-log totals cover completed turns; active turns appear when they finish. First-output wait starts at turn start, includes preparation and reasoning fragments, and excludes time before enqueueing and browser painting.

Old logs can reconstruct only existing event boundaries. Unrecorded internal calls cannot be recovered; unlabelled callers remain unlabelled. Some preprocessing can still have only an enclosing stage until the corresponding plugin supplies finer timing. Purposes are never inferred from prompt contents.

## Privacy

Local informational records contain only timestamps, model routes, plugin/tool/hook names, configured rule names and IDs, and outcome states. Statistics do not retain prompts, tool arguments, replies or credentials, buffer model streams, or upload telemetry. DSH separately owns its normal conversation logging. Review custom labels before sharing logs.

## Development

`src/` contains sources and `lib/` contains reproducible Git-shipped artifacts. Building requires no additional bundler. Run integration checks against a built DSH checkout:

```sh
node scripts/build.mjs
DSH_SOURCE_ROOT=/path/to/deepseek-harness node --test tests/*.test.mjs
DSH_SOURCE_ROOT=/path/to/deepseek-harness node tests/session-timing.host-smoke.mjs
```

In PowerShell set `$env:DSH_SOURCE_ROOT='C:/path/to/deepseek-harness'`. The DOM test uses the checkout's React, JSDOM and public primitives. The Host smoke runs the production Agent loop with a synthetic model, requiring no paid API. Checks cover concurrent sessions, cancellation and failures, legacy records, replay, exclusive attribution, interaction and disposal.

Plugins can optionally label calls through the existing service:

```js
const timing = ctx.get('chatStageTiming')
const options = { provider, model, messages, signal }
const stream = timing
  ? timing.stream({ plugin: 'my-plugin', operation: 'before', rules: [{ id: 'rule-id', title: 'Rule label' }] }, () => ctx.llm.stream(options))
  : ctx.llm.stream(options)
for await (const chunk of stream) { /* consume normally */ }
```

Labels travel through async context independently of provider options. Iteration preserves chunks, cancellation and errors. Public global events observe Agent-local model calls without requiring a root model service. Records use the actual Session instance's public `append` compatibility entry to avoid private-member mismatches across installed Session classes.

Extracted from [dsh-chat-enhancement](https://github.com/vb2250158/dsh-chat-enhancement) under its MIT license.
