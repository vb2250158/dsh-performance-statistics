import * as React from 'react'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { createStartupHistory, createStartupCollector } from './startup-timing.js'
import { StatisticsPie, statisticsDuration, stageColors } from './session-statistics-client.js'

export const startupLocales = {
  zh: { title: '启动性能', run: '第 {value} 次', pending: '正在等待首屏加载完成…', range: '刷新记录', retained: '保留最近 {value} 次',
    scope: '从本次导航开始，到页面加载完成、应用外壳挂载后两帧。记录保存在当前浏览器；不累计多次刷新。',
    missing: '浏览器存储不可用，本次数据仍可查看，刷新后可能丢失。',
    navigation: '导航与重定向', dns: '域名解析', connect: '建立连接', requestQueue: '请求准备', server: '文档首字节等待',
    document: '文档接收', parse: 'HTML 解析', client: '客户端启动与界面挂载', paint: '页面加载与首屏绘制',
    phaseScope: '相邻浏览器时间点之间的独占区间；缓存命中时部分阶段为零。', total: '首屏加载耗时' },
  en: { title: 'Startup performance', run: 'Load {value}', pending: 'Waiting for the first screen…', range: 'Load history', retained: 'Keep latest {value} loads',
    scope: 'Navigation start through page load and two frames after the application shell mounts. Stored in this browser; loads are not accumulated.',
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
    record ? h(StatisticsPie, { total: record.total, selected: phase, select: setPhase, t, label: t('title'),
      phases: record.phases.filter(p => p.milliseconds > 0).map((p, index) => ({ ...p, color: stageColors[index % stageColors.length], label: t(p.key), description: t('phaseScope') })) }) : h('p', { role: 'status' }, t('pending')))
}

/** Register the shell readiness probe and settings page as reversible public slot contributions. */
export function installStartupStatistics(ctx) {
  let storage
  try { storage = window.localStorage } catch (error) { storage = { getItem: () => { throw error }, setItem: () => { throw error } } }
  const history = createStartupHistory(storage), collector = createStartupCollector(window, history)
  ctx.effect(() => () => collector.dispose())
  ctx.effect(() => ctx.locale.register('startup-statistics', startupLocales))
  function Probe() { React.useLayoutEffect(() => { collector.painted() }, []); return null }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'startup-performance-probe' }, Probe))
  const startupT = ctx.locale.bind('startup-statistics'), sharedT = ctx.locale.bind('performance-statistics')
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'startup-performance', order: 80,
    locale: 'startup-statistics', label: () => startupT('title'), inject: () => ({ history }) },
  props => React.createElement(StartupSettings, { ...props, t: (key, args) => {
    const shared = ['seconds', 'milliseconds', 'numberLocale', 'stageSubtotal'].includes(key)
    return (shared ? sharedT : startupT)(key, args)
  } })))
}
