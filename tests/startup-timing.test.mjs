import assert from 'node:assert/strict'
import test from 'node:test'
import { startupPhases, createStartupHistory, createStartupCollector, startupProgress } from '../src/startup-timing.js'

test('navigation stages partition elapsed time including cached and missing timestamps', () => {
  for (const nav of [undefined, { domainLookupStart: 2, domainLookupEnd: 4, connectEnd: 10, requestStart: 12, responseStart: 20, responseEnd: 30, domInteractive: 40 }]) {
    const phases = startupPhases(nav, 60, 80)
    assert.equal(phases.reduce((sum, p) => sum + p.milliseconds, 0), 80)
    assert.ok(phases.every(p => p.milliseconds >= 0))
  }
})

test('refresh history survives reload, retains independent rounds and configurable retention', () => {
  let value = null; const storage = { getItem: () => value, setItem: (_, text) => { value = text } }
  const first = createStartupHistory(storage), record = id => ({ id: String(id), total: id + 1, at: id, phases: startupPhases({}, 0, id + 1) })
  first.record(record(1)); first.record(record(1))
  const second = createStartupHistory(storage); second.record(record(2))
  assert.deepEqual(second.getSnapshot().records.map(r => r.sequence), [1, 2])
  for (let i = 3; i < 60; i++) second.record(record(i))
  second.setLimit(20); assert.equal(second.getSnapshot().records.length, 20)
  assert.equal(createStartupHistory(storage).getSnapshot().records.at(-1).sequence, 59)
  const broken = createStartupHistory({ getItem() { throw Error('unavailable') }, setItem() { throw Error('quota') } })
  broken.record(record(0)); assert.equal(broken.getSnapshot().records.length, 1); assert.equal(broken.getSnapshot().storageFailed, true)
})

test('collector waits for list and current content commits as well as shell and load', () => {
  let listener, observerCallback, disconnected = 0, frames = [], calls = [], now = 10
  const measures = []
  const win = { document: { readyState: 'loading' }, performance: { timeOrigin: 1234, now: () => now, getEntriesByType: type => type === 'measure' ? measures : [] },
    PerformanceObserver: class { constructor(callback) { observerCallback = callback } observe(options) { assert.equal(options.type, 'measure') } disconnect() { disconnected++ } },
    addEventListener: (_, fn) => { listener = fn }, removeEventListener: (_, fn) => { assert.equal(fn, listener) },
    requestAnimationFrame: fn => { frames.push(fn); return frames.length }, cancelAnimationFrame() {} }
  const collector = createStartupCollector(win, { record: r => calls.push(r) })
  const phases = [], unsubscribe = collector.subscribe(() => phases.push(collector.getSnapshot().phase))
  collector.painted(); assert.equal(frames.length, 0)
  win.document.readyState = 'complete'; listener(); listener(); assert.equal(frames.length, 0, 'shell mount is not first-screen completion')
  const ready = stage => measures.push({ name: 'dsh:startup', startTime: 0, duration: now, detail: { version: 1, kind: 'phase', stage } })
  now = 30; ready('session-list'); observerCallback(); assert.equal(frames.length, 0, 'content is still loading')
  now = 40; ready('session-content'); observerCallback(); observerCallback(); assert.equal(frames.length, 1)
  frames.shift()(); now = 50; frames.shift()(); assert.equal(calls.length, 1); assert.equal(calls[0].total, 50)
  assert.equal(calls[0].criterion, 'session-first-screen')
  assert.equal(calls[0].phases.find(row => row.key === 'sessionLoad').milliseconds, 30)
  assert.equal(calls[0].phases.reduce((sum, row) => sum + row.milliseconds, 0), 50)
  assert.ok(disconnected > 0)
  assert.deepEqual(phases, ['list', 'content', 'paint', 'complete'])
  assert.equal(collector.getSnapshot().completedAt, calls[0].total)
  unsubscribe()
  collector.dispose()
  frames = []; const cancelled = createStartupCollector(win, { record: () => assert.fail('disposed') }); cancelled.painted(); cancelled.dispose();frames.shift()();frames.shift()()
})

test('progress reflects actual milestones and failed readiness never advances it', () => {
  const failed = { kind: 'phase', stage: 'session-list', state: 'failed', end: 1 }
  assert.equal(startupProgress(0, [failed]).phase, 'list')
  assert.equal(startupProgress(0, [{ ...failed, state: undefined }]).phase, 'content')
  assert.equal(startupProgress(undefined, []).steps, 0)
  assert.equal(startupProgress(1, [], 9).phase, 'complete')
})

test('hot reload reuses completed current navigation without leaving history pending or inflating its time', () => {
  let value
  const storage = { getItem: () => value, setItem: (_, text) => { value = text } }
  const partial = { id: '1', total: 10, at: 1, phases: [] }
  createStartupHistory(storage).record(partial)
  const full = { ...partial, total: 30, criterion: 'session-first-screen' }
  const updated = createStartupHistory(storage); updated.record(full)
  assert.equal(updated.getSnapshot().records.length, 1)
  assert.equal(updated.getSnapshot().records[0].total, 30)
  const reloaded = createStartupHistory(storage)
  assert.equal(reloaded.getSnapshot().pending, true)
  reloaded.record({ ...full, total: 999 })
  assert.equal(reloaded.getSnapshot().pending, false)
  assert.equal(reloaded.getSnapshot().records[0].total, 30)
  assert.equal(reloaded.getSnapshot().records[0].sequence, 1)
  const frames = []
  const measures = ['session-list', 'session-content'].map(stage => ({ name: 'dsh:startup', startTime: 0, duration: 20, detail: { version: 1, kind: 'phase', stage } }))
  const win = { document: { readyState: 'complete' }, performance: { timeOrigin: 1, now: () => 200, getEntriesByType: type => type === 'measure' ? measures : [] },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: fn => { frames.push(fn); return 1 }, cancelAnimationFrame() {} }
  const collector = createStartupCollector(win, reloaded)
  collector.painted(); frames.shift()(); frames.shift()()
  assert.equal(collector.getSnapshot().completedAt, 30, 'feedback reuses the original history endpoint after a hot reload')
  collector.dispose()
})

test('late collector consumes buffered empty-screen readiness and absent signals never finish', () => {
  const frames = [], saved = [], measures = []
  const win = { document: { readyState: 'complete' }, performance: { timeOrigin: 1, now: () => 100, getEntriesByType: type => type === 'measure' ? measures : [] },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: fn => { frames.push(fn); return 1 }, cancelAnimationFrame() {} }
  const first = createStartupCollector(win, { record: row => saved.push(row) })
  first.painted(); assert.equal(frames.length, 0); first.dispose()
  for (const stage of ['session-list', 'session-content']) measures.push({ name: 'dsh:startup', startTime: 0, duration: 0, detail: { version: 1, kind: 'phase', stage } })
  const second = createStartupCollector(win, { record: row => saved.push(row) })
  second.painted(); frames.shift()(); frames.shift()()
  assert.equal(saved.length, 1)
  assert.equal(saved[0].criterion, 'session-first-screen')
  second.dispose()
})
