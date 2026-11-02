import assert from 'node:assert/strict'
import test from 'node:test'
import { startupPhases, createStartupHistory, createStartupCollector } from '../src/startup-timing.js'

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

test('collector waits for shell and load, uses two frames and cancels on disposal', () => {
  let listener, frames = [], calls = [], now = 10
  const win = { document: { readyState: 'loading' }, performance: { timeOrigin: 1234, now: () => now, getEntriesByType: () => [{}] },
    addEventListener: (_, fn) => { listener = fn }, removeEventListener: (_, fn) => { assert.equal(fn, listener) },
    requestAnimationFrame: fn => { frames.push(fn); return frames.length }, cancelAnimationFrame() {} }
  const collector = createStartupCollector(win, { record: r => calls.push(r) })
  collector.painted(); assert.equal(frames.length, 0)
  win.document.readyState = 'complete'; listener(); listener(); assert.equal(frames.length, 1)
  frames.shift()(); now = 50; frames.shift()(); assert.equal(calls.length, 1); assert.equal(calls[0].total, 50)
  collector.dispose()
  frames = []; const cancelled = createStartupCollector(win, { record: () => assert.fail('disposed') }); cancelled.painted(); cancelled.dispose();frames.shift()();frames.shift()()
})
