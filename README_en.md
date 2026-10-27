# DSH Performance Statistics

[简体中文](README.md) · MIT

An independent performance statistics plugin for DeepSeek Harness. Click the statistics pill below the composer for a timing pie, exact stage readings, individual auxiliary model calls, first-output latency, output speed and token usage. Durations above one second use seconds with up to three decimal places; shorter durations use milliseconds.

## Install and migrate

Targets the public DSH 0.2.1 plugin APIs; verified with 0.2.1-rc.3. Install this repository through the DSH plugin manager or supported CLI:

```sh
dsh plugin --profile web add github:vb2250158/dsh-performance-statistics#v0.1.4
```

Enable **Performance statistics**, reload the page, send a message, and open the statistics pill after the turn ends. Expand auxiliary call cards or select a pie slice or legend to filter stages.

When migrating, upgrade `dsh-chat-enhancement` to **0.3.81 or newer** at the same time. Older versions that contain statistics compete for the same projection and composer entry and must not run alongside this plugin. Chat enhancement is otherwise optional. Jev purpose and rule labels require `dsh-jev-context-gate >=0.1.37`.

No historical log conversion is needed. The plugin reads legacy `plugin:dsh-chat-enhancement/timing` records, retains the `chatSessionTiming` projection and optional `chatStageTiming` service, and writes new `plugin:dsh-performance-statistics/timing` records. Disabling it releases observers, service and UI without deleting existing records.

## Measurements

The stage breakdown covers input and prompt preparation, model selection, preprocessing, request preparation, context checks and finalization, auxiliary requests, first-token wait, reasoning/answer/tool-argument output, stream and message commit, tool dispatch/checks/execution/postprocessing, result commit, step transitions, turn stopping, compaction, Rabi hooks and retries.

Each auxiliary call shows its plugin, purpose, configured rule names and IDs, route, start time, total duration, first-token wait, time after the first token, and failure or cancellation state. Tool and hook names appear in child pies.

Each millisecond belongs to one pie stage. Nested measurements take priority and parallel tool intervals contribute their union. Child pies partition the same exclusive elapsed time; children and unrecorded time sum to their parent. Whole-log totals cover completed turns; active turns appear when they finish. First-output wait starts at turn start, includes preparation and reasoning fragments, and excludes time before enqueueing and browser painting.

Selecting a slice or legend appends its child pie below; selecting a plugin shows its operations. Parent pies remain visible, changing an ancestor clears its previous descendants, and tables are removed. Durations and percentages share one position; measurement descriptions appear below names.

Projection version 4 replays recorded operation labels. Historical enclosing-only intervals remain unidentified. Finer cooperative preprocessing labels use the optional public `agentPreStepTiming` service and the [host instrumentation patch](host-patches/pre-step-timing.patch). Jev-owned operations require Jev 0.1.41 or later. Native probability API requests are measured separately as auxiliary calls, including model, purpose and rules; non-streaming replies have no fabricated first-token timestamp. The patch instruments instructions, skills, session references, time context and optional tmux queries without changing waterfall decisions or the Agent loop.

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

Inside an active Agent stage, non-model tasks can use `timing.run({ plugin: 'my-plugin', operation: 'catalog-snapshot' }, () => loadCatalog())`. Run the original task directly when the service is absent or no stage is active. This async API preserves results and errors without recording task arguments or returned contents. Check `timing?.run` when supporting older statistics providers.

Labels travel through async context independently of provider options. Iteration preserves chunks, cancellation and errors. Public global events observe Agent-local model calls without requiring a root model service. Records use the actual Session instance's public `append` compatibility entry to avoid private-member mismatches across installed Session classes.

Extracted from [dsh-chat-enhancement](https://github.com/vb2250158/dsh-chat-enhancement) under its MIT license.

Pre-step providers can record their own work after delegation, including listeners outside the enclosing async context:

```js
const decision = await next()
const work = () => prepareInput(decision)
return ctx.get('agentPreStepTiming')?.run(
  { agent, turn, step }, { plugin: 'my-plugin', operation: 'input-loading' }, work,
) ?? work()
```

The original task runs when the optional service is absent. Only operation names, timestamps and outcomes are recorded.

Non-streaming auxiliary requests can use `timing.request({ plugin, operation, provider, model, transport: 'native-decisions' }, task)`. It uses the active session position, records the entire request duration and retains neither request nor response contents or an inferred first-token timestamp.

Older hosts also use the public `internal/listener` registration interception for Agents created after this plugin starts. Meters exclude downstream `next()` waits, suppress duplicate cooperative readings, and delegate directly after disposal. Existing listener registries are neither inspected nor rewritten; already registered callbacks cannot be retroactively measured. After a hot install, refresh preset declarations before collecting timings in new sessions. The optional host patch supplies finer operation labels.

After a hot install, existing preset revisions retain their registered listeners. An authenticated Connection POST to `/api/dsh-performance-statistics/refresh-presets` refreshes preset declarations through the public Fiber lifecycle. Configuration remains unchanged; existing Agents retain their revisions, and later sessions use the new revision. A failed refresh returns 503; inspect preset activation diagnostics before creating another session. Historical measurements cannot be recovered.
