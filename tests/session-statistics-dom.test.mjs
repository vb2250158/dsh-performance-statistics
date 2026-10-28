import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire, registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

test('built statistics modal renders an exclusive pie, selectable stages and exact operation readings', { skip: !process.env.DSH_SOURCE_ROOT }, async () => {
  const sourceRoot = process.env.DSH_SOURCE_ROOT
  const require = createRequire(resolve(sourceRoot, 'packages/client/ui-primitives/package.json'))
  const React = require('react'), { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost/' })
  dom.window.HTMLElement.prototype.scrollIntoView = function () {}
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  const hooks = registerHooks({
    resolve(specifier, context, next) { return specifier.endsWith('.css') ? { url: new URL(specifier, context.parentURL).href, shortCircuit: true } : next(specifier, context) },
    load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: 'export default new Proxy({}, { get: (_, key) => String(key) })', shortCircuit: true } : next(url, context) },
  })
  const root = require('react-dom/client').createRoot(document.getElementById('app'))
  const disposers = []
  try {

    const primitives = await import(pathToFileURL(resolve(sourceRoot, 'packages/client/ui-primitives/lib/index.js')).href)

    let entry
    vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
      document, Intl, setTimeout, clearTimeout, window: { __ModuleLoader__: { load(value) { entry = value } } },
    })
    const plugin = entry.factory(name => name === 'react' ? React : name === '@deepseek-ai/dsh-client-ui-goal' ? {} : primitives)

    const rows = [], dictionaries = new Map()
    await plugin.apply({ effect(fn) { disposers.push(fn()) }, locale: { register(id, value) { dictionaries.set(id, value); return () => {} } },
      remote: { async $mount() { return () => {} } }, get: () => ({}), configForms: { get: () => ({}) }, reflect: { provide: () => () => {}, get: () => ({ read() {} }) },
      slots: { inject(_key, fn) { fn() }, register(options, component) { rows.push({ options, component }); return () => {} } } })

    const activity = rows.find(row => row.options.name === 'conversation.composer.dock' && row.options.id === 'activity')
    assert.ok(activity)
    assert.ok(activity.options.priority < 0)
    const theme = await readFile(resolve(sourceRoot, 'packages/client/ui-theme/src/styles/design-platform.css'), 'utf8')
    const css = [...document.querySelectorAll('style')].find(style => style.textContent.includes('.dsh-session-statistics-summary')).textContent
    const tokens = [...new Set(css.match(/--dsw-alias-[a-z0-9-]+/g))]
    assert.deepEqual(tokens.filter(token => !theme.includes(`${token}:`)), [], 'All chart and dialog colors exist in the host theme')
    assert.equal(rows.filter(row => row.options.name === 'conversation.composer.dock' && row.options.id === 'usage').length, 0)
    const translate = language => (key, args = {}) => Object.entries(args).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), dictionaries.get(activity.options.locale)[language][key] ?? key)
    let stats = { turns: 1, steps: 1, turnMs: 17800, llmMs: 3300, toolMs: 1000, compactionMs: 999, otherMs: 14500,
      ttftMs: 3200, ttftSteps: 1, decodeMs: 1001, decodeTokens: 24 }
    const usage = { uncachedInputTokens: 31900, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 24 }
    let stages = { closedMs: 17800, turns: 1, firstOutputMs: 17700, firstOutputTurns: 1, measuredSpans: 2, incompleteSpans: 0,
      phases: { turnPrepare: 100, preStep: 2400, auxiliaryModel: 12000, modelWait: 3200, modelOutput: 100 },
      details: [{ kind: 'auxiliaryModel', name: 'fixture/judge', milliseconds: 12000, calls: 2, failed: 0 }],
      calls: [{ id: 'first', role: 'auxiliary', kind: 'auxiliaryModel', phase: 'end', turn: 0, step: 1,
        startTime: 100, endTime: 7100, firstTokenTime: 6100, provider: 'fixture', model: 'judge', plugin: 'dsh-jev-context-gate',
        operation: 'skill-catalog', parentKind: 'preStep', rules: [{ id: 'skill-rule', title: '技能选择规则' }], failed: false },
      { id: 'second', role: 'auxiliary', kind: 'auxiliaryModel', phase: 'end', turn: 0, step: 1,
        startTime: 7100, endTime: 12100, firstTokenTime: 11100, provider: 'fixture', model: 'judge', plugin: 'dsh-jev-context-gate',
        operation: 'before', parentKind: 'preStep', rules: [{ id: 'input-rule', title: '输入判断规则' }], failed: false }] }
    stages.work = [
      {kind:'preStep',plugin:'fixture-preprocessor',operation:'catalog-snapshot',operationId:'catalog',milliseconds:1600},
      {kind:'preStep',plugin:'fixture-context',operation:'context-ready',operationId:'context',milliseconds:800},
      {kind:'auxiliaryModel',plugin:'dsh-jev-context-gate',operation:'skill-catalog',operationId:'first',milliseconds:7000},
      {kind:'auxiliaryModel',plugin:'dsh-jev-context-gate',operation:'before',operationId:'second',milliseconds:5000},
    ]
    let t = translate('zh')
    let sessionTitle = '问候'
    const render = () => root.render(React.createElement(activity.component, { useProjection: name =>
      name === 'title' ? sessionTitle : name === 'sessionStats' ? stats : name === 'chatSessionTiming' ? stages : name === 'tokenUsage' ? usage : undefined, t }))
    await React.act(async () => render())

    const trigger = document.querySelector('[data-composer-stat="activity"]')
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.match(trigger.textContent, /17.8 秒/)
    trigger.focus()
    await React.act(async () => trigger.click())

    const dialog = document.querySelector('[role="dialog"]')
    assert.equal(dialog.querySelector('.dsh-session-statistics-session-title').textContent, '问候')
    assert.equal(dialog.querySelector('.dsh-session-statistics-session-counts').textContent, '全会话 · 已结束轮次 · 1 轮 · 1 步')
    sessionTitle = '更新后的会话标题'.repeat(20)
    await React.act(async () => render())
    assert.equal(dialog.querySelector('.dsh-session-statistics-session-title').textContent, sessionTitle)
    sessionTitle = null
    await React.act(async () => render())
    assert.equal(dialog.querySelector('.dsh-session-statistics-session-title').textContent, '未命名会话')
    assert.equal(dialog.getAttribute('aria-modal'), 'true')
    assert.match(dialog.textContent, /12 秒/)
    assert.match(dialog.textContent, /3.2 秒/)
    assert.equal(dialog.querySelectorAll('table').length, 0, 'Pies replace the old detail tables')
    assert.match(dialog.textContent, /31,900/)
    assert.doesNotMatch(dialog.textContent, /其他处理与等待/)
    assert.match(dialog.textContent, /同一毫秒只计入一个环节/)
    assert.match(dialog.textContent, /17.7 秒/)
    assert.equal(dialog.querySelectorAll('svg[role="img"]').length, 1)
    const fractions = () => [...dialog.querySelectorAll('[data-pie-level="0"] circle[data-stage]')].map(circle => Number(circle.getAttribute('stroke-dasharray').split(' ')[0]) / (2 * Math.PI * 82))
    assert.ok(Math.abs(fractions().reduce((sum, value) => sum + value, 0) - 1) < 0.000001)
    const rootLegend = key => dialog.querySelector('[data-pie-level="0"] [data-stage-legend="' + key + '"]')
    const waitLegend = rootLegend('modelWait')
    assert.match(waitLegend.querySelector('.dsh-session-statistics-legend-value').textContent, /3.2 秒.*18%/)
    assert.match(waitLegend.querySelector('.dsh-session-statistics-legend-scope').textContent, /已记录请求派发/)
    await React.act(async () => rootLegend('preStep').click())
    assert.equal(dialog.querySelectorAll('svg[role="img"]').length, 2, 'Selection appends a child pie while keeping the parent')
    assert.match(dialog.querySelector('[data-breakdown="preStep"]').textContent, /输入预处理.*处理明细/)
    assert.match(dialog.querySelector('[data-breakdown="preStep"]').textContent, /fixture-preprocessor.*1.6 秒.*66.7%/s)
    assert.equal(dialog.querySelectorAll('table').length, 0)
    await React.act(async () => dialog.querySelector('[data-pie-level="1"] [data-stage-legend="fixture-preprocessor"]').click())
    assert.equal(dialog.querySelectorAll('svg[role="img"]').length, 3)
    assert.match(dialog.querySelector('[data-pie-level="2"]').textContent, /catalog-snapshot/)
    await React.act(async () => rootLegend('auxiliaryModel').click())
    assert.equal(dialog.querySelectorAll('svg[role="img"]').length, 2, 'Changing an ancestor discards the previous descendant pies')
    await React.act(async () => dialog.querySelector('[data-pie-level="1"] [data-stage-legend="dsh-jev-context-gate"]').click())
    await React.act(async () => dialog.querySelector('[data-pie-level="2"] [data-stage-legend="skill-catalog"]').click())
    assert.equal(dialog.querySelectorAll('[data-auxiliary-call]').length, 1)
    const callButton = dialog.querySelector('[data-auxiliary-call="first"] button')
    assert.match(callButton.textContent, /技能候选筛选.*技能选择规则/s)
    await React.act(async () => callButton.click())
    assert.equal(callButton.getAttribute('aria-expanded'), 'true')
    const callDetails = dialog.querySelector('[data-auxiliary-call="first"]').textContent
    assert.match(callDetails, /本次调用未采集逐项评分/)
    stages.calls[0].selectionId = 'skills-one'
    stages.selections = [{ id: 'skills-one', ruleId: 'skill-rule', ruleTitle: '技能选择规则', mode: 'top', value: 2, threshold: 0.5, action: 'prune',
      candidates: Array.from({ length: 51 }, (_, i) => ({ name: `candidate-${i}`, score: (51 - i) / 51, rank: i + 1, selected: i < 2 })) },
    { id: 'different-invocation', ruleId: 'another', ruleTitle: '另一次筛选', mode: 'top', value: 1, threshold: 0.5,
      candidates: [{ name: 'unrelated-candidate', score: 1, rank: 1, selected: true }] }]
    stages.selections[0].candidates[0].label = 'A long description that must not replace the candidate name'
    await React.act(async () => render())
    const selection = dialog.querySelector('[data-candidate-selection="skills-one"]')
    assert.match(selection.textContent, /候选 51 项 · 保留 2 项 · 剔除 49 项/)
    assert.match(selection.textContent, /最低相关性分数: 50%/)
    assert.match(selection.textContent, /#1 candidate-0.*100% · 保留/)
    assert.doesNotMatch(selection.textContent, /A long description/)
    assert.doesNotMatch(selection.textContent, /unrelated-candidate/)
    assert.equal(selection.querySelectorAll('li').length, 50)
    await React.act(async () => selection.querySelector('button').click())
    assert.equal(selection.querySelectorAll('li').length, 51)
    assert.match(selection.textContent, /没有逐项文字理由/)
    stages.selections[0].action = 'inject-extra'
    await React.act(async () => render())
    assert.match(selection.textContent, /候选 51 项 · 选中 2 项 · 未选中 49 项/)
    assert.doesNotMatch(selection.textContent, /剔除/)
    assert.match(callDetails, /dsh-jev-context-gate/)
    assert.match(callDetails, /6 秒/)
    assert.match(callDetails, /1,000 毫秒/)
    assert.match(callDetails, /7 秒/)
    await React.act(async () => rootLegend('auxiliaryModel').click())
    assert.equal(dialog.querySelectorAll('svg[role="img"]').length, 1)
    assert.equal(dialog.querySelectorAll('[data-auxiliary-call]').length, 0)

    stages = { ...stages, phases: { rabiHook: 1000 }, closedMs: 1000, operations: [
      { id: 'old-hook', kind: 'rabiHook', hookId: 'old', operation: 'SessionStart', operationPath: ['SessionStart'],
        startTime: 0, endTime: 200, turn: 1, step: 1, statusCode: 200, outcome: 'passed' },
      { id: 'stop-hook', kind: 'rabiHook', hookId: 'stop', operation: 'Stop', operationPath: ['Stop'],
        startTime: 200, endTime: 1000, turn: 1, step: 1, statusCode: 503, outcome: 'failed', failed: true, uncertain: true },
      { id: 'stop-host', kind: 'rabiHook', hookId: 'stop', operationPath: ['Stop', 'host-discovery'], startTime: 200, endTime: 300 },
      { id: 'stop-server', kind: 'rabiHook', hookId: 'stop', operationPath: ['Stop', 'manager-request', 'plan-completion'], startTime: 300, endTime: 1000 },
    ], work: [
      { kind: 'rabiHook', plugin: 'dsh-rabiroute-agent', operationId: 'old-hook', operationPath: ['SessionStart'], milliseconds: 200 },
      { kind: 'rabiHook', plugin: 'dsh-rabiroute-agent', operationId: 'stop-host', operationPath: ['Stop', 'host-discovery'], milliseconds: 100 },
      { kind: 'rabiHook', plugin: 'dsh-rabiroute-agent', operationId: 'stop-server', operationPath: ['Stop', 'manager-request', 'plan-completion'], milliseconds: 700 },
    ] }
    await React.act(async () => render())
    await React.act(async () => rootLegend('rabiHook').click())
    assert.equal(dialog.querySelectorAll('[data-hook-call]').length, 2)
    assert.match(dialog.querySelector('[data-hook-call="old"]').textContent, /会话开始.*200 毫秒.*处理成功.*HTTP 状态: 200.*内部连接和后台步骤未采集/s)
    assert.match(dialog.querySelector('[data-hook-call="stop"]').textContent, /回复结束.*800 毫秒.*处理结果待核对.*HTTP 状态: 503/s)
    await React.act(async () => dialog.querySelector('[data-hook-call="stop"] button').click())
    assert.match(dialog.querySelector('[data-hook-call="stop"]').textContent, /查询 Host 状态.*100 毫秒.*Rabi 接口请求 \/ 计划完成检查与回传.*700 毫秒/s)
    assert.match(dialog.querySelector('[data-hook-call="stop"]').textContent, /父子步骤可能嵌套/)
    await React.act(async () => dialog.querySelector('[data-pie-level="1"] [data-stage-legend="dsh-rabiroute-agent"]').click())
    await React.act(async () => dialog.querySelector('[data-pie-level="2"] [data-stage-legend="Stop"]').click())
    assert.match(dialog.querySelector('[data-pie-level="3"]').textContent, /查询 Host 状态.*100 毫秒/s)
    await React.act(async () => dialog.querySelector('[data-pie-level="3"] [data-stage-legend="manager-request"]').click())
    assert.match(dialog.querySelector('[data-pie-level="4"]').textContent, /计划完成检查与回传.*700 毫秒/s)
    assert.equal(dialog.querySelectorAll('[data-hook-call]').length, 1)
    t = translate('en')
    await React.act(async () => render())
    assert.match(dialog.textContent, /Individual Rabi hooks/)
    assert.match(dialog.querySelector('[data-pie-level="4"]').textContent, /Plan completion checks and delivery/)
    t = translate('zh')
    stats = { ...stats, toolMs: 35600 }
    await React.act(async () => render())
    assert.ok(Math.abs(fractions().reduce((sum, value) => sum + value, 0) - 1) < 0.000001, 'Parallel work totals cannot inflate pie shares')
    await React.act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.ok(document.activeElement === trigger, 'Escape restores focus to the statistics trigger')
    stats = { ...stats, turnMs: undefined, otherMs: undefined, compactionMs: undefined, ttftSteps: 0, decodeMs: 0 }
    stages = undefined
    t = translate('en')
    await React.act(async () => render())
    await React.act(async () => document.querySelector('[data-composer-stat="activity"]').click())
    assert.match(document.querySelector('[role="dialog"]').textContent, /Unavailable/)
    assert.match(document.querySelector('[role="dialog"]').textContent, /Stage projection is not available yet/)
    assert.equal(document.querySelector('svg[role="img"]'), null)
    await React.act(async () => document.querySelector('[aria-label="Close session statistics"]').click())
    stats = undefined
    await React.act(async () => render())
    await React.act(async () => document.querySelector('[data-composer-stat="activity"]').click())
    assert.match(document.querySelector('[role="dialog"]').textContent, /Whole-log statistics are not available yet/)
  } finally {

    await React.act(async () => root.unmount())
    for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose()
    assert.equal(document.querySelectorAll('.dsh-session-statistics').length, 0)
    assert.ok(![...document.querySelectorAll('style')].some(style => style.textContent.includes('.dsh-session-statistics-summary')))
    hooks.deregister(); dom.window.close()
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
