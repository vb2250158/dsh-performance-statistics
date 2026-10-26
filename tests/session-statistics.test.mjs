import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionStatisticsReading } from '../src/session-statistics.js'

test('reads host measurements without inventing a partition for overlapping activities', () => {
  const result = sessionStatisticsReading({ turnMs: 1000, llmMs: 700, toolMs: 1500, otherMs: 100,
    ttftMs: 600, ttftSteps: 2, decodeMs: 400, decodeTokens: 80 })
  assert.equal(result.scale, 1500)
  assert.equal(result.averageTtft, 300)
  assert.equal(result.speed, 200)
  assert.equal(result.timings.find(row => row.key === 'unrecorded').milliseconds, 100)
  assert.equal(result.timings.find(row => row.key === 'compaction').milliseconds, undefined)
})

test('missing projection and absent samples stay unavailable rather than becoming zero latency', () => {
  assert.deepEqual(sessionStatisticsReading(undefined), { timings: [], phases: [], averageTtft: undefined, responseWait: undefined, speed: undefined, scale: 0 })
  const result = sessionStatisticsReading({ llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 })
  assert.equal(result.averageTtft, undefined)
  assert.equal(result.speed, undefined)
  assert.equal(result.timings.find(row => row.key === 'unrecorded').milliseconds, undefined)
})
