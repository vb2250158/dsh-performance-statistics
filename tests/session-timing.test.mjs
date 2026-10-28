import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { readFileSync } from 'node:fs'
import { sessionBreakdown } from '../src/session-breakdown.js'
import { createSessionTimingProjection, exclusiveSessionTimings, SESSION_TIMING_RECORD, LEGACY_SESSION_TIMING_RECORD } from '../src/session-timing.js'

const require = process.env.DSH_SOURCE_ROOT
  ? createRequire(join(process.env.DSH_SOURCE_ROOT, 'packages/session/session-projection/package.json'))
  : createRequire(import.meta.url)
const { z } = require('zod'), { runFirstTokenTime } = require('@deepseek-ai/dsh-llm')
const projection = createSessionTimingProjection(z, runFirstTokenTime)
let seq = 0
const event = (type, time, data = {}) => ({ type, time, seq: seq++, data: { turn: 0, step: 1, ...data } })
const span = (kind, startTime, endTime, extra = {}) => ({ ...event(SESSION_TIMING_RECORD, endTime, {
  id: `${kind}-${startTime}`, phase: 'end', kind, startTime, endTime, ...extra }), ignorable: true })
const message = (time, first, type = 'text-chunks') => event('assistant/message', time, {
  stream: [{ type, time0: first, index: 0, dt: [], texts: ['fixture'] }, { type: 'chunk', time, chunk: { type: 'finish' } }],
})
const fold = events => events.reduce((state, row) => projection.stateSchema.parse(projection.apply(state, row)), projection.init())
const total = view => Object.values(view.phases).reduce((sum, value) => sum + value, 0)

test('Hook event, connection and server pies partition one interval and retain old and malformed diagnostic records', () => {
  const invoked = (handlerId, point, time) => ({ ...event('plugin:dsh-rabiroute-agent/hook-invoked', time, { handlerId, point }), ignorable: true })
  const result = (handlerId, durationMs, time, timings) => ({ ...event('plugin:dsh-rabiroute-agent/hook-result', time,
    { handlerId, durationMs, outcome: 'passed', statusCode: 200, uncertain: false, timings }), ignorable: true })
  const { view } = fold([event('turn/start', 0), invoked('old', 'SessionStart', 10), result('old', 100, 110),
    invoked('new', 'Stop', 200), result('new', 800, 1000, [
      { path: ['host-discovery'], startMs: 0, durationMs: 100 },
      { path: ['manager-request'], startMs: 100, durationMs: 700 },
      { path: ['manager-request', 'plan-followup'], startMs: 200, durationMs: 500 },
      { path: ['invalid'], startMs: -5, durationMs: 100 }, null,
    ]), event('turn/end', 1010)])
  assert.equal(view.closedMs, 1010); assert.equal(total(view), 1010); assert.equal(view.phases.rabiHook, 900)
  const hook = sessionBreakdown(view).find(row => row.key === 'rabiHook').children[0]
  const stop = hook.children.find(row => row.key === 'Stop')
  assert.equal(stop.milliseconds, 800)
  assert.deepEqual(stop.children.map(row => [row.key, row.milliseconds]), [['host-discovery', 100], ['manager-request', 700]])
  assert.deepEqual(stop.children[1].children.map(row => [row.key, row.milliseconds]), [['plan-followup', 500], ['unrecorded', 200]])
  assert.equal(hook.children.find(row => row.key === 'SessionStart').children.length, 0)
  assert.equal(view.operations.filter(row => row.statusCode === 200).length, 2)
  assert.equal(view.operations.some(row => row.operation === 'invalid'), false)
  assert.deepEqual(view.work.filter(row => row.kind === 'rabiHook').map(row => ({ path: row.operationPath, milliseconds: row.milliseconds })),
    JSON.parse(readFileSync(new URL('./expected/rabi-hook-timing.json', import.meta.url), 'utf8')))
  const check = node => { if (node.children.length) { assert.equal(node.children.reduce((sum, row) => sum + row.milliseconds, 0), node.milliseconds); node.children.forEach(check) } }
  check(hook)
})

test('candidate diagnostics join by invocation id without changing elapsed timings or accepting malformed rows', () => {
  const selection = id => ({ ...event('plugin:dsh-jev-context-gate/catalog-selection', 45, { id, ruleId: 'skills', ruleTitle: 'Skills',
    operation: 'skill-catalog', mode: 'top', value: 1, threshold: 0.5, action: 'prune',
    candidates: [{ name: 'kept', score: 0.9, rank: 1, selected: true }, { name: 'removed', score: 0.1, rank: 2, selected: false }] }), ignorable: true })
  const events = [event('turn/start', 0), span('auxiliaryModel', 10, 40, { role: 'auxiliary', selectionId: 'one' }), selection('one'),
    { ...selection('bad'), data: { ...selection('bad').data, candidates: [{ name: 'invalid', score: 9, rank: 1, selected: true }] } },
    { ...selection('wrong-turn'), data: { ...selection('wrong-turn').data, turn: 4 } }, event('turn/end', 50)]
  const view = fold(events).view
  assert.equal(view.calls[0].selectionId, 'one')
  assert.deepEqual(view.selections.map(row => row.id), ['one'])
  assert.deepEqual(view.selections, JSON.parse(readFileSync(new URL('./expected/candidate-selection.json', import.meta.url), 'utf8')))
  assert.equal(view.closedMs, 50)
  assert.equal(total(view), 50)
  assert.equal(fold([event('turn/start', 0), event('turn/end', 50)]).view.selections.length, 0)
})

test('recorded preprocessing replays into named child pies and a separate native request', () => {
  const { view } = fold([event('turn/start', 0),
    span('preStep', 10, 50, { id: 'skills', plugin: 'skills', operation: 'skill-snapshot' }),
    span('auxiliaryModel', 40, 70, { id: 'native', role: 'auxiliary', transport: 'native-decisions',
      plugin: 'dsh-jev-context-gate', operation: 'before', provider: 'fixture', model: 'native' }),
    span('preStep', 80, 90, { id: 'instructions', plugin: 'instructions', operation: 'instructions-compose' }),
    span('preStep', 1, 99, { id: 'stage' }), event('turn/end', 100)])
  const snapshot = { closedMs: view.closedMs, phases: view.phases,
    calls: view.calls.map(({ plugin, operation, transport, role }) => ({ plugin, operation, transport, role })),
    pies: sessionBreakdown(view).map(node => ({ key: node.key, milliseconds: node.milliseconds,
      children: node.children.map(child => ({ key: child.key, milliseconds: child.milliseconds,
        operations: child.children.map(operation => operation.key) })) })) }
  assert.deepEqual(snapshot, JSON.parse(readFileSync(new URL('./expected/preprocessing-pies.json', import.meta.url), 'utf8')))
})

test('legacy and standalone records contribute to one projection without rewriting history', () => {
  const legacy = { ...span('auxiliaryModel', 10, 40, { role: 'auxiliary', detail: 'legacy/judge' }), type: LEGACY_SESSION_TIMING_RECORD }
  const current = span('auxiliaryModel', 45, 85, { role: 'auxiliary', detail: 'current/judge' })
  const before = JSON.stringify([legacy, current])
  const state = fold([event('turn/start', 0), legacy, current, event('turn/end', 100)])
  assert.equal(state.view.measuredSpans, 2)
  assert.equal(state.view.phases.auxiliaryModel, 70)
  assert.equal(state.view.calls.length, 2)
  assert.equal(total(state.view), 100)
  assert.equal(JSON.stringify([legacy, current]), before)
  assert.notEqual(SESSION_TIMING_RECORD, LEGACY_SESSION_TIMING_RECORD)
})

test('a retry ends at the next request and never absorbs its model wait or answer', () => {
  const start = (id, time) => ({ ...event(SESSION_TIMING_RECORD, time, {
    id, kind: 'modelCall', role: 'main', phase: 'start', startTime: time }), ignorable: true })
  const attempt = event('assistant/attempt', 40, { stream: [] })
  const { view } = fold([event('turn/start', 0), event('step/start', 10), event('request/context', 10), start('first', 20),
    span('modelCall', 20, 40, { id: 'first', role: 'main', failed: true }), attempt,
    span('retry', 40, 50), event('request/context', 51), start('second', 52),
    span('modelCall', 52, 100, { id: 'second', role: 'main', firstTokenTime: 90 }), message(100, 90), event('turn/end', 100)])
  assert.equal(view.phases.retry, 11)
  assert.equal(view.phases.modelWait, 58)
  assert.equal(view.phases.modelOutput, 10)
  assert.equal(total(view), 100)
  const legacy = fold([event('turn/start', 0), event('step/start', 10), event('request/context', 20), attempt,
    event('request/context', 50), message(100, 90), event('turn/end', 100)]).view
  assert.equal(legacy.phases.retry, 10)
  assert.equal(legacy.phases.modelWait, 60)
  assert.equal(legacy.phases.modelOutput, 10)
  assert.equal(total(legacy), 100)
  const measured = fold([event('turn/start', 0), event('step/start', 10), event('request/context', 10), start('first', 20),
    span('modelCall', 20, 40, { id: 'first', role: 'main', failed: true }), attempt, start('second', 50),
    span('modelCall', 50, 100, { id: 'second', role: 'main', firstTokenTime: 90 }), message(100, 90), event('turn/end', 100)]).view
  assert.equal(measured.phases.retry, 10)
  assert.equal(measured.phases.modelWait, 60)
  assert.equal(measured.phases.modelOutput, 10)
  assert.equal(total(measured), 100)
})

test('historical request reconstructs preparation, first-token wait and answer from durable boundaries', () => {
  const state = fold([event('turn/start', 0), event('step/start', 14460), event('request/context', 14461),
    message(17781, 17616), event('step/end', 17781), event('turn/end', 17781)])
  assert.deepEqual(state.view.phases, { turnPrepare: 14460, requestPrepare: 1, modelWait: 3155, modelOutput: 165 })
  assert.equal(state.view.firstOutputMs, 17616)
  assert.equal(state.view.firstOutputTurns, 1)
  assert.equal(state.view.measuredSpans, 0)
  assert.equal(total(state.view), state.view.closedMs)
})

test('preprocessing preserves named plugin work and attributes nested hooks without adding wall time', () => {
  const state = fold([event('turn/start', 0),
    { ...event(SESSION_TIMING_RECORD, 1, { id: 'pre-step', kind: 'preStep', phase: 'start', startTime: 1 }), ignorable: true },
    { ...event('plugin:dsh-rabiroute-agent/hook-invoked', 10, { handlerId: 'hook', point: 'UserPromptSubmit' }), ignorable: true },
    { ...event('plugin:dsh-rabiroute-agent/hook-result', 30, { handlerId: 'hook', durationMs: 20, outcome: 'ok' }), ignorable: true },
    span('preStep', 35, 90, { detail: 'fixture-preprocessor', plugin: 'fixture-preprocessor', operation: 'catalog-snapshot', parentKind: 'preStep' }),
    span('preStep', 1, 99), event('turn/end', 100)])
  const hook = state.view.operations.find(row => row.kind === 'rabiHook')
  assert.equal(hook.parentKind, 'preStep')
  assert.equal(hook.plugin, 'dsh-rabiroute-agent')
  assert.equal(hook.endTime - hook.startTime, 20)
  const plugin = state.view.operations.find(row => row.plugin === 'fixture-preprocessor')
  assert.equal(plugin.operation, 'catalog-snapshot')
  assert.equal(plugin.endTime - plugin.startTime, 55)
  assert.equal(state.view.calls.length, 0)
  assert.equal(total(state.view), 100)
})

test('nested auxiliary models and Rabi requests take time from preprocessing, never add to total', () => {
  const state = fold([event('turn/start', 0),
    span('auxiliaryModel', 10, 3010, { role: 'auxiliary', detail: 'fixture/judge' }),
    span('auxiliaryModel', 3020, 6020, { role: 'auxiliary', detail: 'fixture/judge' }),
    span('preStep', 5, 6100),
    { ...event('plugin:dsh-rabiroute-agent/hook-invoked', 6100, { handlerId: 'rabi', point: 'prompt-submitted' }), ignorable: true },
    { ...event('plugin:dsh-rabiroute-agent/hook-result', 6200, { handlerId: 'rabi', durationMs: 100, outcome: 'passed' }), ignorable: true },
    event('step/start', 6210), message(6310, 6300), event('step/end', 6310), event('turn/end', 6320)])
  assert.equal(state.view.phases.auxiliaryModel, 6000)
  assert.equal(state.view.phases.preStep, 95)
  assert.equal(state.view.phases.rabiHook, 100)
  assert.equal(total(state.view), 6320)
  assert.deepEqual(state.view.details.find(row => row.kind === 'auxiliaryModel'), {
    kind: 'auxiliaryModel', name: 'fixture/judge', milliseconds: 6000, calls: 2, failed: 0,
  })
})

test('parallel tools use their interval union while operation readings retain summed work', () => {
  const state = fold([event('turn/start', 0), event('step/start', 0), message(10, 5),
    event('tool/call', 10, { callId: 'a', name: 'shell' }), event('tool/call', 10, { callId: 'b', name: 'shell' }),
    span('toolCheck', 10, 20, { detail: 'shell' }), span('toolExecute', 20, 110, { detail: 'shell' }),
    event('tool/result', 110, { message: { source: { callId: 'a' } } }),
    event('tool/result', 110, { message: { source: { callId: 'b' } } }),
    event('step/end', 115), event('turn/end', 120)])
  assert.equal(total(state.view), 120)
  assert.equal(state.view.phases.toolCheck, 10)
  assert.equal(state.view.phases.toolExecute, 90)
  assert.equal(state.view.details.find(row => row.kind === 'toolCall').milliseconds, 200)
  assert.deepEqual(state.view.operations.filter(row => row.kind === 'toolCall').map(row => row.detail), ['shell', 'shell'])
})

test('compaction, reasoning and stream finalization remain separate during model output', () => {
  const output = event('assistant/message', 110, { stream: [
    { type: 'reasoning-chunks', time0: 20, index: 0, dt: [], texts: ['r'] },
    { type: 'text-chunks', time0: 70, index: 1, dt: [], texts: ['a'] },
    { type: 'chunk', time: 100, chunk: { type: 'finish' } },
  ] })
  const state = fold([event('turn/start', 0), event('step/start', 0), event('compaction/start', 30, { compactionId: 'c' }),
    event('compaction/end', 50, { compactionId: 'c' }), output, event('step/end', 110), event('turn/end', 110)])
  assert.equal(state.view.phases.compaction, 20)
  assert.equal(state.view.phases.modelReasoning, 30)
  assert.equal(state.view.phases.modelOutput, 30)
  assert.equal(state.view.phases.streamFinalize, 10)
  assert.equal(total(state.view), 110)
})

test('dispatch timestamps separate request setup from provider wait', () => {
  const begin = { ...event(SESSION_TIMING_RECORD, 30, { id: 'main', phase: 'start', kind: 'modelCall', role: 'main', startTime: 30 }), ignorable: true }
  const state = fold([event('turn/start', 0), event('step/start', 10), event('request/context', 15), begin,
    span('modelCall', 30, 90, { id: 'main', role: 'main', firstTokenTime: 80, detail: 'fixture/main' }),
    message(100, 80), event('step/end', 100), event('turn/end', 100)])
  assert.equal(state.view.phases.requestPrepare, 20)
  assert.equal(state.view.phases.modelWait, 50)
  assert.equal(state.view.details[0].milliseconds, 60)
  assert.equal(total(state.view), 100)
})

test('two calls to the same model retain separate purposes, rules and first-token timestamps', () => {
  const first = span('auxiliaryModel', 10, 40, { id: 'first', role: 'auxiliary', provider: 'fixture', model: 'judge',
    firstTokenTime: 30, plugin: 'fixture-gate', operation: 'skill-catalog', rules: [{ id: 'skills', title: 'Skill selection' }] })
  const second = span('auxiliaryModel', 40, 80, { id: 'second', role: 'auxiliary', provider: 'fixture', model: 'judge',
    firstTokenTime: 70, plugin: 'fixture-gate', operation: 'before', rules: [{ id: 'input', title: 'Input classification' }] })
  const state = fold([event('turn/start', 0), first, second, event('turn/end', 100)])
  assert.equal(state.view.calls.length, 2)
  assert.equal(state.view.calls[0].firstTokenTime - state.view.calls[0].startTime, 20)
  assert.equal(state.view.calls[1].operation, 'before')
  assert.equal(state.view.calls[1].rules[0].id, 'input')
  assert.equal(total(state.view), 100)
  assert.deepEqual(projection.stateSchema.parse(JSON.parse(JSON.stringify(state))), state)
})

test('checkpoint replay, interrupted spans and malformed plugin records preserve real closed time', () => {
  const begin = { ...event(SESSION_TIMING_RECORD, 2, { id: 'pending', phase: 'start', kind: 'preStep', startTime: 2 }), ignorable: true }
  const before = fold([event('turn/start', 0), begin])
  const same = projection.apply(before, event('user/message', 3))
  assert.strictEqual(same, before)
  const restored = projection.stateSchema.parse(JSON.parse(JSON.stringify(before)))
  const bad = { ...span('toolExecute', 2, 4), data: { turn: 0, kind: 'unexpected' } }
  assert.strictEqual(projection.apply(restored, bad), restored)
  const end = event('turn/end', 10)
  const result = projection.apply(restored, end)
  assert.equal(result.view.incompleteSpans, 1)
  assert.equal(result.view.firstOutputTurns, 0)
  assert.equal(total(result.view), 10)
  assert.equal(projection.wire.summary, false)
  assert.strictEqual(projection.wire.view(before), before.view)
})

test('sweep stays proportional to spans rather than elapsed milliseconds', t => {
  const spans = [{ kind: 'turnPrepare', start: 0, end: 86400000 }]
  for (let i = 0; i < 10000; i++) spans.push({ kind: 'toolExecute', start: i * 100, end: i * 100 + 50 })
  const start = performance.now(), result = exclusiveSessionTimings(spans, 0, 86400000)
  t.diagnostic(`10001 intervals: ${(performance.now() - start).toFixed(1)} ms`)
  assert.equal(result.toolExecute, 500000)
  assert.equal(Object.values(result).reduce((sum, value) => sum + value, 0), 86400000)
})
