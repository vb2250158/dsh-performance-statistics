import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionBreakdown } from '../src/session-breakdown.js'
import { exclusiveSessionWork } from '../src/session-timing.js'

test('nested work owns its interval while helper requests remain in their separate stage', () => {
  const result = exclusiveSessionWork([
    { kind: 'preStep', start: 0, end: 100 },
    { kind: 'preStep', start: 0, end: 90, operationId: 'outer' },
    { kind: 'preStep', start: 10, end: 60, operationId: 'inner' },
    { kind: 'auxiliaryModel', start: 20, end: 50, operationId: 'judge' },
  ], 0, 100)
  assert.deepEqual(result.phases, { preStep: 70, auxiliaryModel: 30 })
  assert.deepEqual(result.work.map(row => [row.operationId, row.milliseconds]), [['outer', 40], ['inner', 20], ['judge', 30]])
  const nodes = sessionBreakdown({ phases: result.phases, work: result.work.map(row => ({ ...row,
    plugin: row.operationId === 'judge' ? 'judge-plugin' : 'input-plugin', operation: row.operationId })) })
  const input = nodes.find(row => row.key === 'preStep')
  assert.equal(input.children[0].milliseconds, 60)
  assert.equal(input.children[1].missing, true)
  assert.equal(input.children[1].milliseconds, 10)
  assert.equal(input.children.reduce((sum, row) => sum + row.milliseconds, 0), input.milliseconds)
  assert.equal(input.children[0].children.reduce((sum, row) => sum + row.milliseconds, 0), 60)
})

test('parallel named work partitions the union and checkpoint order does not replace nested attribution', () => {
  const result = exclusiveSessionWork([
    { kind: 'preStep', start: 10, end: 50, operationId: 'child' },
    { kind: 'preStep', start: 10, end: 100, operationId: 'parent' },
    { kind: 'preStep', start: 40, end: 80, operationId: 'parallel' },
  ], 0, 100)
  assert.equal(result.phases.preStep, 90)
  assert.equal(result.work.reduce((sum, row) => sum + row.milliseconds, 0), 90)
  assert.equal(result.work.find(row => row.operationId === 'child').milliseconds, 30)
  assert.equal(result.work.find(row => row.operationId === 'parallel').milliseconds, 40)
  assert.equal(result.work.find(row => row.operationId === 'parent').milliseconds, 20)
})

test('old unlabelled logs do not fabricate children from overlapping operation durations', () => {
  assert.deepEqual(sessionBreakdown(undefined), [])
  const nodes = sessionBreakdown({ phases: { preStep: 100 }, operations: [{ kind: 'preStep', plugin: 'unmatched', startTime: 0, endTime: 100 }] })
  assert.deepEqual(nodes[0].children, [])
})
