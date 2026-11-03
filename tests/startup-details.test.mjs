import assert from 'node:assert/strict'
import test from 'node:test'
import { startupIntervalPie, startupResourceDetails, startupMeasuredDetails } from '../src/startup-details.js'
import { createStartupHistory } from '../src/startup-timing.js'

test('nested and parallel measurements partition a stage exactly and retain uncovered time', () => {
  const rows = startupIntervalPie(10, 110, [
    { key: 'outer', start: 20, end: 100 }, { key: 'inner', start: 30, end: 50 },
    { key: 'parallel', start: 40, end: 60 }, { key: 'outside', start: 200, end: 220 },
  ])
  assert.equal(rows.reduce((sum, row) => sum + row.milliseconds, 0), 100)
  assert.equal(rows.find(row => row.key === 'unmeasured').milliseconds, 20)
  assert.equal(rows.find(row => row.key === 'inner').milliseconds, 20)
  assert.equal(rows.find(row => row.key === 'parallel').milliseconds, 10)
})

test('resource capture removes secrets, preserves timings, excludes future requests and supports restricted timing', () => {
  const row = { startTime: 10, responseEnd: 50, requestStart: 12, responseStart: 30, transferSize: 100, decodedBodySize: 200, initiatorType: 'script' }
  const resources = startupResourceDetails({ getEntriesByType: () => [
    { ...row, name: 'https://user:password@host/app.js?token=secret#private' },
    { ...row, name: 'https://host/plugins/??dsh-example/client.js&rev=private' },
    { ...row, name: 'https://host/file?password=secret', requestStart: 0, responseStart: 0 },
    { ...row, name: 'https://host/future', startTime: 150, responseEnd: 180 },
  ] }, 100)
  assert.equal(resources.length, 3)
  assert.equal(resources[0].label, '/app.js')
  assert.equal(resources[1].label, 'dsh-example/client.js')
  assert.equal(resources[0].request, 18)
  assert.equal(resources[0].download, 20)
  assert.equal(resources[2].request, undefined)
  assert.doesNotMatch(JSON.stringify(resources), /secret|password|host|private/)
})

test('malformed optional resource detail does not discard valid history or sibling resources', () => {
  const record = { id: 'one', total: 5, at: 1, sequence: 1, phases: [], resources: [null,
    { key: 'good', label: 'client.js', type: 'script', start: 0, end: 3 }] }
  record.resources.push({ key: 'broken', label: 'bad', start: 'wrong' })
  const history = createStartupHistory({ getItem: () => JSON.stringify({ limit: 50, records: [record] }) })
  assert.equal(history.getSnapshot().records.length, 1)
  assert.equal(history.getSnapshot().records[0].resources.length, 1)
})

test('only compatible early boot measurements are captured, clipped and persisted across refreshes', () => {
  const phase = { name: 'dsh:startup', startTime: 5, duration: 30, detail: { version: 1, kind: 'phase', stage: 'plugins' } }
  const measures = startupMeasuredDetails({ getEntriesByType: () => [phase,
    { ...phase, detail: { version: 1, kind: 'plugin', stage: 'plugins', plugin: 'example', state: 'pending' } },
    { ...phase, name: 'other-application', detail: { secret: 'not saved' } },
    { ...phase, detail: { version: 2, kind: 'phase', stage: 'future' } },
    { ...phase, detail: { version: 1, kind: 'plugin', stage: 'plugins' } },
  ] }, 20)
  assert.equal(measures.length, 2)
  assert.equal(measures[0].end, 20)
  assert.equal(measures[1].state, 'pending')
  let value
  const storage = { getItem: () => value, setItem: (_, text) => { value = text } }
  createStartupHistory(storage).record({ id: 'navigation', total: 20, at: 0, phases: [], measures })
  assert.deepEqual(createStartupHistory(storage).getSnapshot().records[0].measures, JSON.parse(JSON.stringify(measures)))
})

test('shell commit tail is recorded only after a measured mount call has returned', () => {
  const mount = { name: 'dsh:startup', startTime: 10, duration: 20, detail: { version: 1, kind: 'phase', stage: 'mount' } }
  const perf = { getEntriesByType: () => [mount] }
  assert.equal(startupMeasuredDetails(perf, 60, 20).length, 1)
  const rows = startupMeasuredDetails(perf, 60, 50)
  assert.deepEqual(rows.at(-1), { key: 'shell-commit', kind: 'phase', stage: 'shell-commit', start: 30, end: 50 })
  assert.equal(startupMeasuredDetails({ getEntriesByType: () => [] }, 60, 50).length, 0)
})

test('native React commit replaces the legacy shell tail without hiding the measured interval', () => {
  const mount = { name: 'dsh:startup', startTime: 10, duration: 10, detail: { version: 1, kind: 'phase', stage: 'mount' } }
  const react = { name: 'dsh:startup', startTime: 15, duration: 25, detail: { version: 1, kind: 'phase', stage: 'react-mount' } }
  const rows = startupMeasuredDetails({ getEntriesByType: () => [mount, react] }, 50, 39)
  assert.equal(rows.filter(row => row.stage === 'react-mount').length, 1)
  assert.equal(rows.some(row => row.stage === 'shell-commit'), false)
  assert.deepEqual(rows.find(row => row.stage === 'react-mount'), { key: 'measure-1', kind: 'phase', stage: 'react-mount', plugin: undefined, state: undefined, start: 15, end: 40 })
  const pie = startupIntervalPie(0, 50, rows.map(row => ({ ...row, key: row.stage })))
  assert.equal(pie.reduce((sum, row) => sum + row.milliseconds, 0), 50)
  assert.equal(pie.find(row => row.key === 'react-mount').milliseconds, 20)
  assert.ok(startupMeasuredDetails({ getEntriesByType: () => [mount] }, 50, 39).some(row => row.stage === 'shell-commit'), 'Older Core versions retain the shell-probe fallback')
})
