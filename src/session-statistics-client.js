import * as React from 'react'
import { Modal, Pill, Button, IconGaugeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { sessionBreakdown } from './session-breakdown.js'
import { sessionStatisticsReading } from './session-statistics.js'

export const sessionStatisticsLocales = {
  zh: {
    breakdown: '{stage} · 处理明细', noChildren: '该项尚无已采集的子步骤。', missingWork: '内部明细未记录',
    stageSubtotal: '本级耗时', pluginScope: '该插件已记录操作的独占耗时；点选可继续查看子步骤。',
    transport: '请求方式', nativeDecision: '原生概率判定 API（整包返回，无流式首 token）', modelStream: '模型流',
    childrenHint: '点选环或图例，下方显示它的子饼图。', atThisLevel: '占本级 {value}',
    title: '会话统计', close: '关闭会话统计', open: '查看会话统计', counts: '{turns} 轮 · {steps} 步',
    stageOperations: '{stage}内部操作', stageTotal: '本阶段独占耗时：{value}。内部操作可能重叠，或已单列到其他饼图阶段，不能直接相加。',
    missingStageAttribution: '这段 {value} 尚未记录处理插件或子步骤名称，无法事后补算；不把外层阶段当成已细分的数据。',
    noStageOperations: '本阶段没有已记录的内部操作。', enclosingStage: '阶段总计',
    stageCoverage: '下方仅列出已采集的操作，不代表完整的插件执行清单。',
    scope: '全会话 · 已结束轮次', total: '轮次累计耗时', ttft: '模型步骤首 token', responseWait: '首个模型输出等待', speed: '输出速度',
    seconds: '{value} 秒', milliseconds: '{value} 毫秒', tps: '{value} tok/s', numberLocale: 'zh-CN',
    model: '模型', tools: '工具调用', compaction: '上下文压缩', unrecorded: '阶段明细未记录',
    pie: '各阶段耗时占比', phases: '环节明细', operations: '模型、工具与钩子明细', calls: '次数', failed: '失败', clear: '查看全部环节',
    pieScope: '按实际占用时间分配，同一毫秒只计入一个环节；嵌套测量优先于外层阶段，并行工具按时间并集计入。',
    oldScope: '旧日志按已有阶段边界还原，无法追溯当时未记录的内部调用。更新后的轮次会补记辅助模型、上下文检查和工具前后处理。',
    operationScope: '各次操作独立累计，可能并行或嵌套；本表不能相加作为轮次总耗时。',
    responseScope: '轮次开始到首个非空模型片段的平均时间，包含准备和推理片段，未包含入队前或浏览器渲染时间。',
    noStages: '阶段投影尚未加载，无法生成可靠占比。', incomplete: '有 {value} 个计时片段未结束，保留其所属阶段的实际时间。',
    chart: '耗时对比', relative: '相对轮次累计 {value}%', noTotal: '未提供轮次累计时间',
    overlap: '各项按同一时间尺度显示，可能重叠，不能直接相加。其他包含准备、等待、流程处理及未完成步骤；现有数据未细分原因。',
    metrics: '详细数据', metric: '指标', value: '数值', unit: '口径', totalScope: '匹配到结束事件的轮次累计；进行中的轮次结束后计入。',
    modelScope: '步骤开始到模型消息完成，扣除重叠的上下文压缩。', toolsScope: '每次工具调用到结果返回的累计；并行调用分别计时。',
    compactionScope: '已结束的压缩尝试累计，包含失败尝试。', unrecordedScope: '旧汇总没有阶段来源；需要完整阶段投影才能细分。',
    ttftScope: '步骤开始到首个非空输出的平均时间，样本 {value} 步。',
    speedScope: '同一批有输出 token 与解码计时的步骤：输出 token ÷ 解码秒数。',
    decode: '解码累计耗时', decodeScope: '有输出 token 统计的步骤，从首 token 到消息完成。',
    decodeTokens: '解码统计 token', tokens: 'Token 用量', input: '未缓存输入', cacheRead: '缓存读取', cacheWrite: '缓存写入', output: '输出',
    noStats: '完整日志统计尚不可用。', empty: '尚无已结束的轮次或步骤。', missing: '未提供',
    auxiliaryCalls: '辅助模型逐次明细', auxiliaryHelp: '这些请求由插件额外发起。展开可查看用途、规则、模型和每次请求的首 token 等待；不记录提示词或回复正文。',
    callPosition: '第 {turn} 轮 · 步骤 {step}', caller: '发起插件', task: '调用用途', rules: '关联规则', provider: '模型提供方', route: '模型',
    requestTime: '请求总耗时', firstTokenWait: '首 token 等待', streamTime: '首 token 后耗时', started: '开始时间', outcome: '调用结果',
    succeeded: '流正常结束', interrupted: '失败或中断', unlabelled: '调用方未标注用途', unavailableCaller: '调用方未标注插件', contextStage: '所在环节',
  },
  en: {
    breakdown: '{stage} · Breakdown', noChildren: 'No recorded substeps are available for this item.', missingWork: 'Internal details not recorded',
    stageSubtotal: 'Time at this level', pluginScope: 'Exclusive time of recorded operations in this plugin; select to inspect substeps.',
    transport: 'Request transport', nativeDecision: 'Native probability API (one response; no streamed first token)', modelStream: 'Model stream',
    childrenHint: 'Select a slice or legend to show its child pie below.', atThisLevel: '{value} of this level',
    title: 'Session statistics', close: 'Close session statistics', open: 'View session statistics', counts: '{turns} turns · {steps} steps',
    stageOperations: 'Operations inside {stage}', stageTotal: 'Exclusive stage time: {value}. Internal operations may overlap or belong to separate pie stages; do not add their durations.',
    missingStageAttribution: 'No processing plugin or substep name was recorded for this {value}; those details cannot be recovered from the enclosing stage.',
    noStageOperations: 'No internal operations were recorded for this stage.', enclosingStage: 'Enclosing stage total',
    stageCoverage: 'Only recorded operations are listed; this is not a complete list of executed plugins.',
    scope: 'Whole session · closed turns', total: 'Cumulative turn time', ttft: 'Model-step first token', responseWait: 'Wait for first model output', speed: 'Output speed',
    seconds: '{value} s', milliseconds: '{value} ms', tps: '{value} tok/s', numberLocale: 'en-US',
    model: 'Model', tools: 'Tool calls', compaction: 'Context compaction', unrecorded: 'Stage details unrecorded',
    pie: 'Time by stage', phases: 'Stage readings', operations: 'Model, tool and hook operations', calls: 'Calls', failed: 'Failed', clear: 'Show all stages',
    pieScope: 'Each millisecond belongs to one stage. Nested measurements take priority over enclosing stages; parallel tools contribute their interval union.',
    oldScope: 'Older logs reconstruct recorded stage boundaries; unrecorded internal calls cannot be recovered. New turns also measure auxiliary models, context checks and tool processing.',
    operationScope: 'Individual operations accumulate independently and may overlap. These readings cannot be added to obtain total turn time.',
    responseScope: 'Mean turn start to the first non-empty model fragment, including preparation and reasoning fragments; excludes time before enqueue and browser rendering.',
    noStages: 'Stage projection is not available yet; a reliable partition cannot be drawn.', incomplete: '{value} timing spans did not finish; their enclosing stage retains the elapsed time.',
    chart: 'Time comparison', relative: '{value}% of cumulative turn time', noTotal: 'Cumulative turn time unavailable',
    overlap: 'Bars share one time scale. Intervals may overlap and cannot be added directly. Other includes preparation, waiting, orchestration and incomplete steps; these causes are not measured separately.',
    metrics: 'Detailed readings', metric: 'Metric', value: 'Value', unit: 'Measurement', totalScope: 'Sum of matched closed turns; running turns contribute when they close.',
    modelScope: 'Step start to model-message completion, excluding overlapping compaction.', toolsScope: 'Sum of call-to-result intervals; parallel calls are timed separately.',
    compactionScope: 'Sum of completed compaction attempts, including failed attempts.', unrecordedScope: 'The older aggregate does not identify its stages; the complete stage projection supplies details.',
    ttftScope: 'Average step start to first non-empty output across {value} steps.',
    speedScope: 'Output tokens divided by decode seconds over the same timed steps.',
    decode: 'Cumulative decode time', decodeScope: 'First token to message completion for steps reporting output tokens.',
    decodeTokens: 'Decode sample tokens', tokens: 'Token usage', input: 'Uncached input', cacheRead: 'Cache reads', cacheWrite: 'Cache writes', output: 'Output',
    noStats: 'Whole-log statistics are not available yet.', empty: 'No closed turns or steps yet.', missing: 'Unavailable',
    auxiliaryCalls: 'Individual auxiliary model calls', auxiliaryHelp: 'These are additional plugin requests. Expand a call for its purpose, rules, model and first-token wait. Prompts and response contents are excluded.',
    callPosition: 'Turn {turn} · step {step}', caller: 'Calling plugin', task: 'Purpose', rules: 'Related rules', provider: 'Provider', route: 'Model',
    requestTime: 'Request duration', firstTokenWait: 'First-token wait', streamTime: 'After first token', started: 'Started at', outcome: 'Result',
    succeeded: 'Stream completed', interrupted: 'Failed or interrupted', unlabelled: 'Caller did not label its purpose', unavailableCaller: 'Caller did not identify its plugin', contextStage: 'Enclosing stage',
  },
}

const operationCopy = [
  ['input-rules', '输入规则处理', 'Input rule processing'],
  ['candidate-source', '候选内容读取与脚本执行', 'Candidate reads and scripts'],
  ['question-provider', '问题生成与脚本执行', 'Question generation and scripts'],
  ['projection-ready', '等待投影就绪', 'Projection readiness'],
  ['instructions-compose', '指令加载与整理', 'Instruction loading and assembly'],
  ['session-references', '引用会话读取与整理', 'Referenced session preparation'],
  ['time-context', '时间上下文整理', 'Time context preparation'],
  ['tmux-query', '终端位置查询', 'Terminal location query'],
  ['skill-snapshot', '技能目录扫描与快照', 'Skill catalog scan and snapshot'],
  ['skill-invocation', '指定技能读取与注入', 'Explicit skill loading and injection'],
  ['before', '输入规则判断', 'Input rule classification'], ['after', '回复规则检查', 'Response rule checks'],
  ['skill-catalog', '技能候选筛选', 'Skill candidate selection'], ['skill-injection', '技能注入检查', 'Skill injection checks'],
  ['tool-before', '工具执行前检查', 'Tool pre-execution checks'], ['tool-after', '工具结果检查', 'Tool-result checks'],
  ['external', '外部事件规则判断', 'External-event classification'], ['compaction', '上下文压缩', 'Context compaction'],
  ['session-title', '会话标题生成', 'Session title generation'],
]
const operationScopes = [
  ['skill-snapshot', '查找可用技能、生成目录快照并整理注入内容。', 'Discover available skills, capture their catalog and prepare its injection.'],
  ['skill-invocation', '读取用户指定的技能并准备注入。', 'Load explicitly invoked skills and prepare their injection.'],
  ['instructions-compose', '等待指令投影、读取并整理当前生效的工作区指令。', 'Await instruction projections and load and assemble current workspace instructions.'],
  ['candidate-source', '读取候选内容或执行候选提供脚本。', 'Read candidates or execute the candidate-source script.'],
  ['question-provider', '执行规则问题生成，包括配置的问题脚本。', 'Generate rule questions, including configured question scripts.'],
  ['input-rules', '输入规则处理，扣除已单独列出的子步骤与模型请求。', 'Input rule processing, excluding separately attributed substeps and model requests.'],
  ['projection-ready', '等待此组件依赖的会话投影就绪。', 'Wait for this component’s session projection.'],
  ['before', '执行输入规则判断，按本级实际占用时间分配。', 'Evaluate input rules, using exclusive time at this level.'],
  ['skill-catalog', '对技能候选进行相关性判定。', 'Evaluate the relevance of skill candidates.'],
]
for (const [key, zh, en] of operationScopes) {
  sessionStatisticsLocales.zh[`operationScope_${key}`] = zh
  sessionStatisticsLocales.en[`operationScope_${key}`] = en
}
for (const [key, zh, en] of operationCopy) {
  sessionStatisticsLocales.zh[`operation_${key}`] = zh
  sessionStatisticsLocales.en[`operation_${key}`] = en
}

const stageCopy = [
  ['turnPrepare', '输入、提示词与工具准备', 'Input, prompt and tool preparation', '轮次开始到步骤进入，扣除已单独测量的模型选择、预处理及辅助调用。', 'Turn start to step admission, excluding separately measured selection, preprocessing and auxiliary calls.'],
  ['modelSelection', '模型选择', 'Model selection', '模型路由与选择瀑布的实际耗时。', 'Measured model-selection waterfall.'],
  ['preStep', '输入预处理', 'Input preprocessing', '进入步骤前的输入处理，扣除独立测量的内部调用。', 'Pre-step input processing, excluding separately measured nested operations.'],
  ['requestPrepare', '请求准备与上下文提交', 'Request preparation and context commit', '步骤进入后准备调用、提交提示词与输入、冻结请求的时间。', 'Call preparation, prompt and input commit, and request freezing after step admission.'],
  ['contextCheck', '上下文检查', 'Context checks', '请求上下文处理瀑布，压缩单列。', 'Request-context waterfall, with compaction listed separately.'],
  ['contextReady', '上下文整理', 'Context finalization', '上下文检查完成后的恢复与整理瀑布。', 'Context restoration and finalization waterfall.'],
  ['modelWait', '模型首 token 等待', 'Model first-token wait', '已记录请求派发到首个非空片段；旧日志使用最近的请求上下文边界。', 'Recorded dispatch to first non-empty fragment; older logs use the nearest request-context boundary.'],
  ['modelCall', '模型请求（含输出）', 'Model request including output', '派发到流结束的累计请求时间，包含首 token 等待和输出。', 'Cumulative dispatch-to-stream-end time, including first-token wait and output.'],
  ['modelReasoning', '模型推理输出', 'Model reasoning stream', '推理片段首次出现到下一类片段或流完成。', 'First reasoning fragment until the next fragment category or stream finish.'],
  ['modelOutput', '模型正文输出', 'Model answer stream', '正文片段首次出现到下一类片段或流完成。', 'First answer fragment until the next fragment category or stream finish.'],
  ['modelToolPlan', '模型工具参数输出', 'Model tool-argument stream', '工具参数片段首次出现到下一类片段或流完成。', 'First tool-argument fragment until the next fragment category or stream finish.'],
  ['streamFinalize', '流结束与消息提交', 'Stream finalization and message commit', '流完成片段到持久化消息提交。', 'Stream finish to durable assistant-message commit.'],
  ['auxiliaryModel', '辅助模型调用', 'Auxiliary model calls', '预处理、回复检查或工具阶段内部的模型调用；不记录输入或输出内容。', 'Model calls inside preprocessing, response checks or tools; no prompt or response content is recorded.'],
  ['toolDispatch', '工具派发准备', 'Tool dispatch preparation', '模型消息提交到工具调用记录之间。', 'Assistant-message commit to tool-call publication.'],
  ['toolCall', '工具调用区间', 'Tool-call interval', '调用到结果的时间并集；新日志再细分检查、执行和后处理。', 'Union of call-to-result intervals; new logs also separate checks, execution and postprocessing.'],
  ['toolCheck', '工具前置检查', 'Tool pre-execution checks', '工具执行前策略与钩子瀑布。', 'Tool policy and pre-execution waterfall.'],
  ['toolExecute', '工具执行', 'Tool execution', '工具实际派发瀑布，扣除已单列的嵌套调用。', 'Tool-dispatch waterfall, excluding separately listed nested operations.'],
  ['toolPost', '工具结果后处理', 'Tool-result postprocessing', '工具结果检查、替换与补充上下文瀑布。', 'Tool-result validation, replacement and context-enrichment waterfall.'],
  ['resultCommit', '工具结果提交', 'Tool-result commit', '工具结果记录到步骤结束的处理。', 'Processing between tool-result publication and step end.'],
  ['stepTransition', '步骤收尾与切换', 'Step completion and transition', '步骤结束到下一步或轮次结束的区间。', 'Step end to the next step or turn end.'],
  ['turnStopping', '轮次收尾', 'Turn stopping', '轮次停止钩子开始到轮次结束。', 'Turn-stopping hook entry to turn end.'],
  ['compaction', '上下文压缩', 'Context compaction', '已完成压缩尝试的实际占用时间。', 'Elapsed time occupied by completed compaction attempts.'],
  ['rabiHook', 'Rabi 钩子请求', 'Rabi hook requests', '原生钩子调用到结果；操作明细按钩子点分别累计。', 'Native hook invocation to result, grouped by hook point in operation readings.'],
  ['retry', '失败处理与重试', 'Failure handling and retry', '已记录失败尝试后的错误处理与重试阶段。', 'Recorded failure handling and retry stage after an unsuccessful attempt.'],
]
for (const [key, zh, en, scopeZh, scopeEn] of stageCopy) {
  Object.assign(sessionStatisticsLocales.zh, { [`phase_${key}`]: zh, [`scope_${key}`]: scopeZh })
  Object.assign(sessionStatisticsLocales.en, { [`phase_${key}`]: en, [`scope_${key}`]: scopeEn })
}

const stageColors = ['var(--dsw-alias-link)', 'var(--dsw-alias-state-success-primary)', 'var(--dsw-alias-state-warn-primary)',
  'var(--dsw-alias-state-error-secondary)', 'var(--dsw-alias-label-secondary)',
  'color-mix(in oklab,var(--dsw-alias-link),var(--dsw-alias-state-success-primary) 50%)',
  'color-mix(in oklab,var(--dsw-alias-link),var(--dsw-alias-state-error-secondary) 50%)']
function stageColor(key) { return stageColors[stageCopy.findIndex(row => row[0] === key) % stageColors.length] }

export const sessionStatisticsCss = `
.dsh-session-statistics[role=dialog]{width:min(880px,100%);max-height:100%;font-variant-numeric:tabular-nums}
.dsh-session-statistics-content{min-height:0;overflow:auto;overscroll-behavior:contain}
.dsh-session-statistics-body{display:grid;gap:24px;min-width:0;color:var(--dsw-alias-label-primary)}
.dsh-session-statistics-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dsh-session-statistics-summary>div{display:grid;gap:8px;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;min-width:0}
.dsh-session-statistics-summary dt,.dsh-session-statistics-note{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6;margin:0}
.dsh-session-statistics-summary dd{font-size:24px;font-weight:600;line-height:1.3;margin:0;overflow-wrap:anywhere}
.dsh-session-statistics-section{display:grid;gap:14px;min-width:0}
.dsh-session-statistics-section h3{font-size:14px;font-weight:600;margin:0}
.dsh-session-statistics-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;line-height:1.6}
.dsh-session-statistics-table th{font-weight:500;color:var(--dsw-alias-label-secondary);text-align:left}
.dsh-session-statistics-table th,.dsh-session-statistics-table td{padding:10px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:top;overflow-wrap:anywhere}
.dsh-session-statistics-table th:first-child{width:25%}.dsh-session-statistics-table th:nth-child(2){width:24%}
.dsh-session-statistics-table td:last-child{color:var(--dsw-alias-label-secondary)}
.dsh-session-statistics-token-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0}
.dsh-session-statistics-token-grid div{display:grid;gap:6px;min-width:0}.dsh-session-statistics-token-grid dt{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-session-statistics-token-grid dd{font-size:16px;margin:0;overflow-wrap:anywhere}
.dsh-session-statistics-trigger{max-width:100%;gap:6px;font-variant-numeric:tabular-nums}.dsh-session-statistics-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-session-statistics-pie-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;align-items:start}
.dsh-session-statistics-pie{position:sticky;top:0;align-self:start;width:240px;max-width:100%;display:block;margin:auto;overflow:visible}
.dsh-session-statistics-pie circle[data-stage]{cursor:pointer;transition:opacity .12s}
.dsh-session-statistics-pie text{fill:var(--dsw-alias-label-primary);text-anchor:middle;font-size:22px;font-weight:600}
.dsh-session-statistics-pie .dsh-session-statistics-pie-label{fill:var(--dsw-alias-label-secondary);font-size:12px;font-weight:400}
.dsh-session-statistics-legend{display:grid;gap:6px;min-width:0}
.dsh-session-statistics-legend button{appearance:none;display:grid;grid-template-columns:9px minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid transparent;border-radius:8px;padding:8px;color:inherit;background:transparent;text-align:left;font:inherit;font-size:12px;cursor:pointer}
.dsh-session-statistics-legend button:hover,.dsh-session-statistics-legend button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.dsh-session-statistics-legend button:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:2px}
.dsh-session-statistics-swatch{width:9px;height:9px;border-radius:3px;background:var(--stage-color)}
.dsh-session-statistics-legend small{display:block;grid-column:2/-1;color:var(--dsw-alias-label-secondary);font-size:11px;margin-top:3px}
.dsh-session-statistics-operation{display:block;color:var(--dsw-alias-label-secondary);font-size:11px}
.dsh-session-statistics-table tr[data-selected=true]{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-session-statistics-call{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;min-width:0;overflow:hidden}
.dsh-session-statistics-call>button{width:100%;height:auto;justify-content:space-between;text-align:left;white-space:normal;padding:12px;gap:12px}
.dsh-session-statistics-call-heading{min-width:0;overflow-wrap:anywhere}.dsh-session-statistics-call-heading small{display:block;font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px}
.dsh-session-statistics-call-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0 12px 12px;margin:0;font-size:12px}
.dsh-session-statistics-call-metrics>div{min-width:0}.dsh-session-statistics-call-metrics dt{color:var(--dsw-alias-label-secondary);margin-bottom:4px}.dsh-session-statistics-call-metrics dd{margin:0;overflow-wrap:anywhere}
@media(max-width:650px){.dsh-session-statistics-pie-layout{grid-template-columns:minmax(0,1fr);gap:12px}.dsh-session-statistics-pie{width:200px}}
@media(max-width:540px){.dsh-session-statistics-summary{gap:8px}.dsh-session-statistics-summary>div{padding:10px}.dsh-session-statistics-summary dd{font-size:18px}.dsh-session-statistics-token-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-session-statistics-table th,.dsh-session-statistics-table td{padding:8px 4px}.dsh-session-statistics-table th:first-child{width:24%}.dsh-session-statistics-table th:nth-child(2){width:27%}}
`

function statisticsNumber(value, t, digits = 1) {
  return new Intl.NumberFormat(t('numberLocale'), { maximumFractionDigits: digits }).format(value)
}

function statisticsDuration(value, t) {
  if (value === undefined) return t('missing')
  return value > 1000
    ? t('seconds', { value: statisticsNumber(value / 1000, t, 3) })
    : t('milliseconds', { value: statisticsNumber(value, t, 2) })
}

const statisticsNode = React.createElement

function StatisticsPie({ phases, total, selected, select, t, level = 0, label = t('pie') }) {
  const h = statisticsNode, circumference = 2 * Math.PI * 82
  let offset = 0
  const percent = ratio => ratio > 0 && ratio < 0.001 ? '<0.1%' : `${statisticsNumber(ratio * 100, t)}%`
  const name = row => row.label ?? t(`phase_${row.key}`)
  const scope = row => row.description ?? t(`scope_${row.key}`)
  return h('div', { className: 'dsh-session-statistics-pie-layout', 'data-pie-level': level },
    h('svg', { className: 'dsh-session-statistics-pie', viewBox: '0 0 240 240', role: 'img', 'aria-label': label },
      h('circle', { cx: 120, cy: 120, r: 82, fill: 'none', strokeWidth: 36, stroke: 'var(--dsw-alias-interactive-bg-hover)' }),
      ...phases.map(row => {
        const start = offset; offset += row.ratio
        const label = `${name(row)}: ${statisticsDuration(row.milliseconds, t)} · ${percent(row.ratio)}`
        return h('circle', { key: row.key, cx: 120, cy: 120, r: 82, fill: 'none', strokeWidth: 36,
          stroke: row.color ?? stageColor(row.key), strokeDasharray: `${row.ratio * circumference} ${circumference}`,
          strokeDashoffset: -start * circumference, transform: 'rotate(-90 120 120)', 'data-stage': row.key,
          opacity: selected === undefined || selected === row.key ? 1 : 0.25, onClick: () => select(row.key) }, h('title', null, label))
      }),
      h('text', { x: 120, y: 116 }, statisticsDuration(total, t)),
      h('text', { x: 120, y: 142, className: 'dsh-session-statistics-pie-label' }, t(level === 0 ? 'total' : 'stageSubtotal'))),
    h('div', { className: 'dsh-session-statistics-legend' }, ...phases.map(row => h('button', {
      key: row.key, type: 'button', 'aria-pressed': selected === row.key, onClick: () => select(row.key),
      style: { '--stage-color': row.color ?? stageColor(row.key) }, 'data-stage-legend': row.key,
    }, h('span', { className: 'dsh-session-statistics-swatch', 'aria-hidden': true }),
    h('span', { className: 'dsh-session-statistics-legend-name' }, name(row)),
    h('span', { className: 'dsh-session-statistics-legend-value' }, `${statisticsDuration(row.milliseconds, t)} · ${percent(row.ratio)}`),
    h('small', { className: 'dsh-session-statistics-legend-scope' }, scope(row))))))
}

function AuxiliaryCall({ call, t }) {
  const [expanded, setExpanded] = React.useState(false), h = statisticsNode
  const purpose = call.operation ?? call.purpose
  const purposeText = operationCopy.some(row => row[0] === purpose) ? t(`operation_${purpose}`) : purpose ?? t('unlabelled')
  const ruleText = call.rules?.map(rule => rule.title && rule.title !== rule.id ? `${rule.title} (${rule.id})` : rule.id).join('、')
  const parent = call.parentKind === 'mainModel' ? 'modelCall' : call.parentKind
  const rows = [
    ['caller', call.plugin ?? t('unavailableCaller')], ['task', purposeText],
    ['rules', ruleText || t('missing')], ['contextStage', stageCopy.some(row => row[0] === parent) ? t(`phase_${parent}`) : t('missing')],
    ['provider', call.provider ?? t('missing')], ['route', call.model ?? call.detail ?? t('missing')],
    ['transport', t(call.transport === 'native-decisions' ? 'nativeDecision' : 'modelStream')],
    ['requestTime', statisticsDuration(call.endTime - call.startTime, t)],
    ['firstTokenWait', statisticsDuration(call.firstTokenTime === undefined ? undefined : call.firstTokenTime - call.startTime, t)],
    ['streamTime', statisticsDuration(call.firstTokenTime === undefined ? undefined : call.endTime - call.firstTokenTime, t)],
    ['started', new Intl.DateTimeFormat(t('numberLocale'), { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false }).format(call.startTime)],
    ['outcome', t(call.failed ? 'interrupted' : 'succeeded')],
  ]
  return h('div', { className: 'dsh-session-statistics-call', 'data-auxiliary-call': call.id },
    h(Button, { onClick: () => setExpanded(value => !value), 'aria-expanded': expanded, 'aria-controls': `stage-call-${call.id}` },
      h('span', { className: 'dsh-session-statistics-call-heading' }, `${expanded ? '▾' : '▸'} ${purposeText}`,
        h('small', null, [t('callPosition', { turn: call.turn, step: call.step }), ruleText, call.model ?? call.detail].filter(Boolean).join(' · '))),
      h('span', null, statisticsDuration(call.endTime - call.startTime, t))),
    expanded && h('dl', { id: `stage-call-${call.id}`, className: 'dsh-session-statistics-call-metrics' },
      ...rows.map(([key, value]) => h('div', { key }, h('dt', null, t(key)), h('dd', null, value)))))
}

function BreakdownPie({ node, selected, select, level, t }) {
  const h = statisticsNode, target = React.useRef(null)
  React.useEffect(() => { target.current.scrollIntoView({ block: 'start', behavior: 'auto' }) }, [node.key])
  const title = t('breakdown', { stage: breakdownLabel(node, t) })
  const phases = node.children.map((row, index) => ({ ...row, ratio: node.milliseconds > 0 ? row.milliseconds / node.milliseconds : 0,
    label: breakdownLabel(row, t), description: row.missing ? t('missingStageAttribution', { value: statisticsDuration(row.milliseconds, t) })
      : row.operation ? operationScopes.some(item => item[0] === row.operation) ? t('operationScope_' + row.operation) : t('pieScope')
        : t('pluginScope'), color: stageColors[index % stageColors.length] }))
  return h('section', { ref: target, className: 'dsh-session-statistics-section', 'data-breakdown': node.key },
    h('h3', null, title), h(StatisticsPie, { phases, total: node.milliseconds, selected, select, t, level, label: title }))
}

function breakdownLabel(node, t) {
  if (node.missing) return t('missingWork')
  if (node.operation && operationCopy.some(row => row[0] === node.operation)) return t('operation_' + node.operation)
  return node.label ?? node.operation ?? node.plugin ?? node.key
}

function StatisticsDetails({ stats, usage, stages, t }) {
  const [path, setPath] = React.useState([])
  const h = statisticsNode, reading = sessionStatisticsReading(stats, stages), tree = sessionBreakdown(stages)
  if (stats === undefined) return h('p', { className: 'dsh-session-statistics-note' }, t('noStats'))
  const choose = (level, key) => setPath(previous => previous[level] === key ? previous.slice(0, level) : [...previous.slice(0, level), key])
  const expanded = []
  let siblings = tree
  for (const key of path) {
    const node = siblings.find(row => row.key === key)
    if (!node) break
    expanded.push(node); siblings = node.children
  }
  const selectedCallIds = new Set(expanded.at(-1)?.callIds ?? [])
  const calls = (stages?.calls ?? []).filter(call => call.role === 'auxiliary' && selectedCallIds.has(call.id))
  return h('div', { className: 'dsh-session-statistics-body' },
    h('dl', { className: 'dsh-session-statistics-summary' }, ...[
      ['total', statisticsDuration(stats.turnMs, t)],
      [reading.responseWait === undefined ? 'ttft' : 'responseWait', statisticsDuration(reading.responseWait ?? reading.averageTtft, t)],
      ['speed', reading.speed === undefined ? t('missing') : t('tps', { value: statisticsNumber(reading.speed, t) })],
    ].map(([key, value]) => h('div', { key }, h('dt', null, t(key)), h('dd', null, value)))),
    h('section', { className: 'dsh-session-statistics-section' }, h('h3', null, t('pie')),
      h('p', { className: 'dsh-session-statistics-note' }, t('childrenHint')),
      reading.phases.length > 0 ? h(StatisticsPie, { phases: reading.phases, total: stages.closedMs, selected: path[0], select: key => choose(0, key), t })
        : h('p', { className: 'dsh-session-statistics-note' }, t(stages === undefined ? 'noStages' : 'empty')),
      h('p', { className: 'dsh-session-statistics-note' }, t('pieScope')),
      stages?.incompleteSpans > 0 && h('p', { className: 'dsh-session-statistics-note' }, t('incomplete', { value: stages.incompleteSpans }))),
    ...expanded.map((node, index) => node.children.length > 0
      ? h(BreakdownPie, { key: path.slice(0, index + 1).join('/'), node: { ...node, label: index === 0 ? t('phase_' + node.key) : node.label },
        level: index + 1, selected: path[index + 1], select: key => choose(index + 1, key), t })
      : h('p', { key: 'leaf-' + node.key, className: 'dsh-session-statistics-note', role: 'status' },
        node.missing || index === 0 ? t('missingStageAttribution', { value: statisticsDuration(node.milliseconds, t) }) : t('noChildren'))),
    calls.length > 0 && h('section', { className: 'dsh-session-statistics-section' }, h('h3', null, t('auxiliaryCalls')),
      ...calls.map(call => h(AuxiliaryCall, { key: call.id, call, t }))),
    usage !== undefined && h('section', { className: 'dsh-session-statistics-section' }, h('h3', null, t('tokens')),
      h('dl', { className: 'dsh-session-statistics-token-grid' }, ...[
        ['input', usage.uncachedInputTokens], ['cacheRead', usage.cacheReadTokens], ['cacheWrite', usage.cacheWriteTokens], ['output', usage.outputTokens],
      ].map(([key, value]) => h('div', { key }, h('dt', null, t(key)), h('dd', null, value === undefined ? t('missing') : statisticsNumber(value, t, 0)))))))
}

/** Replace only the activity entry; projection updates remain owned by the host. */
export function SessionStatisticsPill({ useProjection, t }) {
  const stats = useProjection('sessionStats')
  const usage = useProjection('tokenUsage')
  const stages = useProjection('chatSessionTiming')
  const [open, setOpen] = React.useState(false)
  const counts = stats === undefined ? t('title') : t('counts', { turns: stats.turns, steps: stats.steps })
  const label = stats?.turnMs === undefined ? counts : `${counts} · ${statisticsDuration(stats.turnMs, t)}`
  return React.createElement(React.Fragment, null,
    React.createElement(Pill, { className: 'dsh-session-statistics-trigger', onClick: () => setOpen(true), active: open,
      'data-composer-stat': 'activity', 'aria-label': `${t('open')} · ${label}`, 'aria-haspopup': 'dialog', 'aria-expanded': open },
    React.createElement(IconGaugeOutlineRegular), React.createElement('span', null, label)),
    React.createElement(Modal, { open, onClose: () => setOpen(false), title: t('title'), closeLabel: t('close'),
      description: `${t('scope')} · ${counts}`, className: 'dsh-session-statistics', contentClassName: 'dsh-session-statistics-content' },
    open && React.createElement(StatisticsDetails, { stats, usage, stages, t })))
}

/** Install a reversible, theme-aware replacement through the public composer slot. */
export function installSessionStatistics(ctx) {
  ctx.effect(() => ctx.locale.register('performance-statistics', sessionStatisticsLocales))
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = sessionStatisticsCss
    document.head.appendChild(style)
    return () => style.remove()
  })
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'activity', priority: -100, order: 0, locale: 'performance-statistics',
  }, SessionStatisticsPill))
}
