import * as React from 'react'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { createStartupHistory, createStartupCollector } from './startup-timing.js'
import { StatisticsPie, statisticsDuration, stageColors } from './session-statistics-client.js'
import { startupIntervalPie, startupReadiness } from './startup-details.js'
import { StartupFeedback, startupFeedbackCss, startupVisibilityText } from './startup-feedback.js'

/** Early Core timings and plugin state intervals share the navigation clock, not CPU samples. */
function StartupMeasured({ record, phase, t }) {
  const [stage, setStage] = React.useState(), [plugin, setPlugin] = React.useState(), [state, setState] = React.useState()
  const h = React.createElement
  let start = 0
  for (const row of record.phases) { if (row.key === phase) break; start += row.milliseconds }
  const end = start + (record.phases.find(row => row.key === phase)?.milliseconds ?? 0)
  const measured = (record.measures ?? []).filter(row => row.outcome !== 'not-visible' && row.start < end && row.end > start)
    .map(row => ({ ...row, start: Math.max(start, row.start), end: Math.min(end, row.end) }))
  const phases = startupIntervalPie(start, end, measured.filter(row => row.kind === 'phase').map(row => ({ ...row, key: row.stage })))
  const pluginRows = measured.filter(row => row.kind === 'plugin' && row.plugin && (!stage || row.stage === stage))
  const group = (rows, key) => {
    const groups = new Map()
    for (const row of rows) groups.set(row[key], (groups.get(row[key]) ?? 0) + row.end - row.start)
    return [...groups].map(([key, milliseconds]) => ({ key, milliseconds })).sort((a, b) => b.milliseconds - a.milliseconds)
  }
  const pie = (rows, selected, select, title, cumulative = false) => {
    const total = rows.reduce((sum, row) => sum + row.milliseconds, 0)
    return h('section', { className: 'dsh-session-statistics-section' }, h('h3', null, title),
      h('p', { className: 'dsh-session-statistics-note' }, t(cumulative ? 'pluginTimingScope' : 'measuredScope')),
      total > 0 && h(StatisticsPie, { total, selected, select, t, level: 1, label: title,
        phases: rows.map((row, index) => ({ ...row, label: ['boot-ready', 'prefetch', 'plugins', 'mount', 'react-mount', 'shell-commit', 'session-list', 'session-content', 'unmeasured', 'loading', 'pending', 'initializing', 'active', 'failed'].includes(row.key) ? t(`boot_${row.key}`) : row.key,
          description: t(row.key === 'unmeasured' ? 'unmeasuredScope' : cumulative ? 'pluginTimingScope' : 'measuredScope'),
          ratio: row.milliseconds / total, color: stageColors[index % stageColors.length] })) }))
  }
  return h('section', { 'data-startup-measured': '' },
    measured.length === 0 ? h('p', { className: 'dsh-session-statistics-note' }, t('noEarlyMeasurements'))
      : pie(phases, stage, key => { setStage(key); setPlugin(undefined); setState(undefined) }, t('measured')),
    stage && pluginRows.length > 0 && pie(group(pluginRows, 'plugin'), plugin, key => { setPlugin(key); setState(undefined) }, t('plugins'), true),
    plugin && pie(group(pluginRows.filter(row => row.plugin === plugin), 'state'), state, setState, plugin, true))
}

/** Resource diagnostics use summed request durations, separately from exclusive navigation time. */
function StartupResources({ record, phase, t }) {
  const [kind, selectKind] = React.useState(), [resource, selectResource] = React.useState(), [shown, show] = React.useState(40)
  const h = React.createElement
  let start = 0
  for (const row of record.phases) { if (row.key === phase) break; start += row.milliseconds }
  const end = start + (record.phases.find(row => row.key === phase)?.milliseconds ?? 0)
  const resources = (record.resources ?? []).filter(row => row.start < end && row.end > start)
    .map(row => ({ ...row, milliseconds: Math.min(end, row.end) - Math.max(start, row.start) }))
  const groups = new Map()
  for (const row of resources) groups.set(row.type, (groups.get(row.type) ?? 0) + row.milliseconds)
  const total = resources.reduce((sum, row) => sum + row.milliseconds, 0)
  const pieRows = rows => rows.map((row, index) => ({ ...row, ratio: total > 0 ? row.milliseconds / total : 0,
    description: t('resourceScope'), color: stageColors[index % stageColors.length] }))
  const filtered = resources.filter(row => row.type === kind).sort((a, b) => b.milliseconds - a.milliseconds)
  const visible = filtered.slice(0, shown)
  const remaining = filtered.slice(shown).reduce((sum, row) => sum + row.milliseconds, 0)
  if (remaining > 0) visible.push({ key: 'remaining', label: t('remainingResources'), milliseconds: remaining })
  const item = filtered.find(row => row.key === resource)
  return h('section', { className: 'dsh-session-statistics-section', 'data-startup-resources': '' },
    h('h3', null, t('resources')),
    h('p', { className: 'dsh-session-statistics-note' }, t(record.resources ? 'resourceScope' : 'oldDetails')),
    total > 0 && h(StatisticsPie, { total, phases: pieRows([...groups].map(([key, milliseconds]) => ({ key, label: key, milliseconds })).sort((a, b) => b.milliseconds - a.milliseconds)),
      selected: kind, select: key => { selectKind(key); selectResource(undefined); show(40) }, t, level: 1, label: t('resources') }),
    kind && filtered.length > 0 && h('section', { className: 'dsh-session-statistics-section' },
      h('h3', null, kind),
      h(StatisticsPie, { total: groups.get(kind), t, level: 2, label: kind, selected: resource, select: selectResource,
        phases: pieRows(visible).map(row => ({ ...row, ratio: row.milliseconds / groups.get(kind) })) }),
      filtered.length > shown && h(Button, { onClick: () => show(shown + 40) }, t('moreResources', { shown, total: filtered.length }))),
    item && h('section', { className: 'dsh-session-statistics-section', 'data-startup-resource': item.key },
      h('h4', { style: { overflowWrap: 'anywhere' } }, item.label),
      h('p', null, `${t('requestWait')}: ${item.request === undefined ? '—' : statisticsDuration(item.request, t)} · ${t('download')}: ${item.download === undefined ? '—' : statisticsDuration(item.download, t)}`),
      h('p', null, `${t('transferred')}: ${item.bytes ?? '—'} B · ${t('decoded')}: ${item.decodedBytes ?? '—'} B`),
      h('p', { className: 'dsh-session-statistics-note' }, t('resourceAvailability'))))
}

export const startupLocales = {
  zh: { title: '启动性能', run: '第 {value} 次', pending: '正在等待首屏加载完成…', range: '刷新记录', retained: '保留最近 {value} 次',
    feedbackTitle: '正在启动初始化', feedbackComplete: '首屏会话已就绪', feedbackElapsed: '已用 {value} 秒', feedbackSteps: '首屏准备 {value} / 4', feedbackClosing: '{value} 秒后收起', feedbackHide: '收起',
    feedback_initialize: '正在初始化界面与插件', feedback_list: '正在加载首屏会话列表', feedback_content: '正在准备当前会话内容', feedback_paint: '首屏就绪判定已完成，正在完成绘制', feedback_complete: '首屏会话加载完成，性能统计已结束',
    visibleComplete: '当前首屏已就绪', feedbackCompleteLimited: '当前可见首屏已就绪，本次性能统计已结束', visibleTotal: '当前首屏就绪耗时',
    visibilityListCollapsed: '会话列表数据已就绪；侧栏折叠，首屏未展开',
    visibilityInitialPanel: '初始为其他面板，DSH 主会话内容不适用；不表示该面板内容已加载完成',
    visibilityOther: '{surface}首屏未展示：{reason}', visibilityList: '会话列表', visibilityContent: '主会话内容',
    sessionLoad: '首屏准备与就绪判定', 'boot_session-list': '首屏会话列表', 'boot_session-content': '当前会话首批内容',
    loadingSessions: '本次首屏会话尚未加载完成，统计仍在进行；需要宿主提供列表和内容的成功提交计时点。',
    legacyScope: '旧记录仅统计到应用外壳挂载，未包含首屏会话加载；无法补算。', legacyTotal: '应用外壳耗时（旧口径）',
    measured: '启动内部阶段', plugins: '逐插件启动区间', measuredScope: '已采集阶段与本环节的交集；重叠时优先显示较短区间，每毫秒只分配一次。',
    pluginTimingScope: '插件状态区间包含依赖等待与异步工作，并行区间分别累计；不是 CPU 采样，合计可能超过实际启动耗时。',
    unmeasuredScope: '此区间尚无更细的计时点，不能据此判断执行内容。', noEarlyMeasurements: '本次未采集启动内核明细；需要配套的早期计时点，历史记录无法补算。',
    'boot_boot-ready': '等待启动注入就绪', boot_prefetch: '预加载启动资源', boot_plugins: '插件加载与激活', boot_mount: '界面挂载调用', 'boot_react-mount': 'React 应用首次提交', 'boot_shell-commit': '挂载返回到外壳提交',
    boot_unmeasured: '未采集的启动区间', boot_loading: '加载与初始化观测区间', boot_pending: '等待依赖', boot_initializing: '初始化', boot_active: '加载到激活完成（整体）', boot_failed: '加载到激活失败（整体）',
    resources: '本阶段资源请求明细', resourceScope: '按请求与本阶段重叠的时间展示；请求可能并行，此图累计可大于阶段耗时，不代表 CPU 占用或阻塞原因。点选类型继续查看资源。',
    oldDetails: '这条历史记录未采集内部明细；更新后刷新页面可记录。', moreResources: '继续显示资源（{shown} / {total}）',
    remainingResources: '尚未展开的资源', requestWait: '请求到首字节', download: '下载', transferred: '传输大小', decoded: '解码后大小',
    resourceAvailability: '零传输量可能来自缓存或浏览器权限限制；资源请求不含完整地址、查询参数或内容。',
    scope: '从本次导航到首屏列表与主会话内容的显示或不展示判定后两帧；折叠侧栏及初始其他面板分别说明，不代表自定义面板内容已加载。记录保存在当前浏览器，不累计多次刷新。',
    missing: '浏览器存储不可用，本次数据仍可查看，刷新后可能丢失。',
    navigation: '导航与重定向', dns: '域名解析', connect: '建立连接', requestQueue: '请求准备', server: '文档首字节等待',
    document: '文档接收', parse: 'HTML 解析', client: '客户端启动与界面挂载', paint: '页面加载与首屏绘制',
    phaseScope: '相邻浏览器时间点之间的独占区间；缓存命中时部分阶段为零。', total: '首屏加载耗时' },
  en: { title: 'Startup performance', run: 'Load {value}', pending: 'Waiting for the first screen…', range: 'Load history', retained: 'Keep latest {value} loads',
    feedbackTitle: 'Starting up', feedbackComplete: 'Initial sessions ready', feedbackElapsed: '{value} s elapsed', feedbackSteps: 'Screen preparation {value} / 4', feedbackClosing: 'Closes in {value} s', feedbackHide: 'Hide',
    feedback_initialize: 'Initializing the interface and plugins', feedback_list: 'Loading the initial session list', feedback_content: 'Preparing current session content', feedback_paint: 'Readiness resolved; finishing first-screen paint', feedback_complete: 'Initial sessions loaded; performance measurement complete',
    visibleComplete: 'Current screen ready', feedbackCompleteLimited: 'Current visible screen ready; performance measurement complete', visibleTotal: 'Current screen readiness time',
    visibilityListCollapsed: 'Session list data ready; sidebar collapsed, list not displayed',
    visibilityInitialPanel: 'Another panel is initially active; DSH main-session content does not apply. This does not measure that panel’s content loading.',
    visibilityOther: '{surface} not displayed: {reason}', visibilityList: 'Session list', visibilityContent: 'Main-session content',
    sessionLoad: 'First-screen readiness resolution', 'boot_session-list': 'Initial session list', 'boot_session-content': 'Current session initial content',
    loadingSessions: 'Initial sessions are not ready; measurement is still pending. Core must report successful list and content commits.',
    legacyScope: 'This older record ends at shell mount and excludes initial session loading. Missing time cannot be reconstructed.', legacyTotal: 'Shell time (old endpoint)',
    measured: 'Internal startup stages', plugins: 'Individual plugin intervals', measuredScope: 'Measured intervals clipped to this stage. Shorter overlapping intervals take precedence; each millisecond is allocated once.',
    pluginTimingScope: 'Plugin state intervals include dependency waits and asynchronous work. Concurrent intervals are summed separately, not CPU samples; totals may exceed elapsed startup time.',
    unmeasuredScope: 'No finer timing was recorded for this interval; its work cannot be inferred.', noEarlyMeasurements: 'Early boot timings were not captured. The matching Core instrumentation is required; old loads cannot be reconstructed.',
    'boot_boot-ready': 'Wait for boot injection', boot_prefetch: 'Prefetch startup resources', boot_plugins: 'Plugin loading and activation', boot_mount: 'Renderer mount call', 'boot_react-mount': 'First React application commit', 'boot_shell-commit': 'Mount return to shell commit',
    boot_unmeasured: 'Unmeasured startup interval', boot_loading: 'Observed loading and initialization', boot_pending: 'Dependency wait', boot_initializing: 'Initialization', boot_active: 'Loading through activation (whole interval)', boot_failed: 'Loading through failure (whole interval)',
    resources: 'Resources overlapping this stage', resourceScope: 'Request time overlapping this stage. Requests may run concurrently, so the sum may exceed stage time. This is not CPU usage or proof of blocking. Select a type to inspect resources.',
    oldDetails: 'Details were not captured for this load. Reload after updating to record them.', moreResources: 'Show more resources ({shown} / {total})',
    remainingResources: 'Resources not yet expanded', requestWait: 'Request to first byte', download: 'Download', transferred: 'Transferred', decoded: 'Decoded',
    resourceAvailability: 'Zero transfer size may mean caching or browser restrictions. Full URLs, query parameters and content are not stored.',
    scope: 'Navigation through two frames after initial list and main-session display or non-visibility decisions. Collapsed sidebar and other initial panels are identified separately; custom-panel content loading is not measured. Stored per load in this browser.',
    missing: 'Browser storage is unavailable. The current measurement remains visible but may be lost on refresh.',
    navigation: 'Navigation and redirects', dns: 'DNS lookup', connect: 'Connection', requestQueue: 'Request preparation', server: 'Document first byte wait',
    document: 'Document transfer', parse: 'HTML parsing', client: 'Client startup and shell mount', paint: 'Page load and first-screen paint',
    phaseScope: 'Exclusive intervals between browser timestamps. Cached stages may take zero time.', total: 'First-screen load time' },
}

/** Public settings section backed by the document-scoped collector and browser-local history. */
export function StartupSettings({ history, t }) {
  const state = React.useSyncExternalStore(history.subscribe, history.getSnapshot), [selected, select] = React.useState(null)
  const [open, setOpen] = React.useState(false), [limits, setLimits] = React.useState(false), [phase, setPhase] = React.useState()
  const record = state.records.find(r => r.id === selected) ?? state.records.at(-1), h = React.createElement
  const visibility = Object.values(startupReadiness(record?.measures ?? [])).filter(row => row.outcome === 'not-visible')
  return h('div', { className: 'dsh-session-statistics-body', 'data-startup-settings': '' },
    h('h2', null, t('title')),
    h('p', { className: 'dsh-session-statistics-note' }, t('scope')),
    h('div', { className: 'dsh-session-statistics-session-row' },
      h(Menu, { open, onClose: () => setOpen(false), selectedId: record?.id, portal: true,
        items: state.records.slice().reverse().map(r => ({ id: r.id, label: `${t('run', { value: r.sequence })} · ${new Date(r.at).toLocaleString()} · ${statisticsDuration(r.total, t)}` })),
        onSelect: id => { select(id); setOpen(false); setPhase(undefined) },
        anchor: h(Button, { onClick: () => setOpen(!open), 'aria-label': t('range'), 'aria-haspopup': 'menu', 'aria-expanded': open }, record ? t('run', { value: record.sequence }) + ' ▾' : t('pending')) }),
      h(Menu, { open: limits, onClose: () => setLimits(false), portal: true, selectedId: String(state.limit),
        items: [20, 50, 100].map(value => ({ id: String(value), label: t('retained', { value }) })), onSelect: value => { history.setLimit(Number(value)); setLimits(false) },
        anchor: h(Button, { onClick: () => setLimits(!limits) }, t('retained', { value: state.limit }) + ' ▾') })),
    state.storageFailed && h('p', { role: 'status' }, t('missing')),
    state.pending && h('p', { role: 'status' }, t('loadingSessions')),
    record && record.criterion !== 'session-first-screen' && h('p', { className: 'dsh-session-statistics-note' }, t('legacyScope')),
    ...visibility.map(row => h('p', { key: row.stage, className: 'dsh-session-statistics-note', 'data-startup-visibility': row.stage }, startupVisibilityText(row, t))),
    record ? h(StatisticsPie, { total: record.total, selected: phase, select: setPhase, t: (key, args) => t(key === 'total' ? record.criterion !== 'session-first-screen' ? 'legacyTotal' : visibility.length ? 'visibleTotal' : key : key, args), label: t('title'),
      phases: record.phases.filter(p => p.milliseconds > 0).map((p, index) => ({ ...p, color: stageColors[index % stageColors.length], label: t(p.key), description: t('phaseScope') })) }) : h('p', { role: 'status' }, t('pending')),
    record && phase && h(StartupMeasured, { key: 'measured-' + record.id + phase, record, phase, t }),
    record && phase && h(StartupResources, { key: 'resources-' + record.id + phase, record, phase, t }))
}

/** Register the shell readiness probe and settings page as reversible public slot contributions. */
export function installStartupStatistics(ctx) {
  let storage
  try { storage = window.localStorage } catch (error) { storage = { getItem: () => { throw error }, setItem: () => { throw error } } }
  const history = createStartupHistory(storage), collector = createStartupCollector(window, history)
  ctx.effect(() => () => collector.dispose())
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = startupFeedbackCss
    document.head.appendChild(style)
    return () => style.remove()
  })
  ctx.effect(() => ctx.locale.register('startup-statistics', startupLocales))
  function Probe() { React.useLayoutEffect(() => { collector.painted() }, []); return null }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'startup-performance-probe' }, Probe))
  const startupT = ctx.locale.bind('startup-statistics'), sharedT = ctx.locale.bind('performance-statistics')
  const now = () => window.performance.now()
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'startup-performance-feedback', locale: 'startup-statistics', inject: () => ({ collector, now }) },
    props => React.createElement(StartupFeedback, { ...props, t: startupT })))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'startup-performance', order: 80,
    locale: 'startup-statistics', label: () => startupT('title'), inject: () => ({ history }) },
  props => React.createElement(StartupSettings, { ...props, t: (key, args) => {
    const shared = ['seconds', 'milliseconds', 'numberLocale', 'stageSubtotal'].includes(key)
    return (shared ? sharedT : startupT)(key, args)
  } })))
}
