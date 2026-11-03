import assert from 'node:assert/strict'
import test from 'node:test'
import { startupMeasuredDetails, startupReadiness } from '../src/startup-details.js'
import { createStartupCollector, createStartupHistory } from '../src/startup-timing.js'

const entry = (stage, outcome, reason, end = 30) => ({ name: 'dsh:startup', startTime: 0, duration: end,
  detail: { version: 1, kind: 'phase', stage, ...(outcome === undefined ? {} : { outcome }), ...(reason === undefined ? {} : { reason }) } })

test('native and legacy committed outcomes and both non-visible reasons persist through independent refresh history', () => {
  for (const entries of [
    [entry('session-list'), entry('session-content')],
    [entry('session-list', 'committed'), entry('session-content', 'committed')],
    [entry('session-list', 'not-visible', 'sidebar-collapsed'), entry('session-content', 'committed')],
    [entry('session-list', 'committed'), entry('session-content', 'not-visible', 'initial-main-panel')],
    [entry('session-list', 'not-visible', 'sidebar-collapsed'), entry('session-content', 'not-visible', 'initial-main-panel')],
  ]) {
    let saved, now = 40
    const storage = { getItem: () => saved, setItem: (_, value) => { saved = value } }
    const history = createStartupHistory(storage), frames = []
    const win = { document: { readyState: 'complete' }, performance: { timeOrigin: 100, now: () => now, getEntriesByType: type => type === 'measure' ? entries : [] },
      addEventListener() {}, removeEventListener() {}, requestAnimationFrame: fn => { frames.push(fn); return frames.length }, cancelAnimationFrame() {} }
    const collector = createStartupCollector(win, history)
    collector.painted(); assert.equal(collector.getSnapshot().phase, 'paint')
    frames.shift()(); now = 56; frames.shift()()
    const record = history.getSnapshot().records[0]
    assert.equal(record.total, 56)
    assert.equal(collector.getSnapshot().completedAt, record.total)
    assert.equal(record.phases.reduce((sum, row) => sum + row.milliseconds, 0), record.total)
    const expected = entries.filter(row => row.detail.outcome === 'not-visible').map(row => ({ stage: row.detail.stage, reason: row.detail.reason }))
    assert.deepEqual(collector.getSnapshot().visibility, expected)
    const restored = createStartupHistory(storage).getSnapshot().records[0]
    assert.deepEqual(restored.measures, JSON.parse(JSON.stringify(record.measures)))
    assert.deepEqual(Object.values(startupReadiness(restored.measures)).filter(row => row.outcome === 'not-visible').map(row => ({ stage: row.stage, reason: row.reason })), expected)
    collector.dispose()
  }
})

test('non-visible without a reason and unknown outcomes never satisfy readiness or discard valid sibling rows', () => {
  const rows = [entry('session-list', 'not-visible'), entry('session-content', 'unexpected', 'x'), entry('session-list', 'committed')]
  const measures = startupMeasuredDetails({ getEntriesByType: () => rows }, 50)
  assert.equal(measures.length, 1)
  assert.equal(startupReadiness(measures)['session-content'], undefined)
  assert.equal(startupReadiness(measures)['session-list'].outcome, 'committed')
})

test('first finite surface result wins; later user switches do not replace non-visibility decisions', () => {
  const measures = startupMeasuredDetails({ getEntriesByType: () => [entry('session-content', 'not-visible', 'initial-main-panel'), entry('session-content', 'committed', undefined, 5000)] }, 6000)
  assert.equal(startupReadiness(measures)['session-content'].outcome, 'not-visible')
  assert.equal(startupReadiness(measures)['session-content'].end, 30)
})
