import assert from 'node:assert/strict'
import test from 'node:test'
import { refreshPresetMeters, installPresetRefresh } from '../src/preset-refresh.js'

test('refresh changes only healthy preset declarations and preserves their config', async () => {
  const config = { id: 'standard', plugins: [{ name: 'example' }] }, seen = []
  const entry = { options: { name: '@deepseek-ai/dsh-agent-preset', config }, fiber: { restart: async () => seen.push('restart') } }
  const ctx = { loader: { entries: () => [entry, { options: { name: 'another-plugin' } }, { options: { ...entry.options, disabled: true } }] },
    agentPresets: { resolve: async id => seen.push(id) } }
  assert.deepEqual(await refreshPresetMeters(ctx), { refreshed: ['standard'] })
  assert.deepEqual(seen, ['standard', 'restart', 'standard'])
  assert.strictEqual(entry.options.config, config)
  ctx.agentPresets.resolve = async () => { throw Error('broken') }
  await assert.rejects(refreshPresetMeters(ctx), /broken/)
  assert.equal(seen.length, 3)
})

test('authenticated request hook delegates other routes and shares concurrent refreshes', async () => {
  let handler, runs = 0, finish
  const ctx = { inject: (_keys, apply) => apply(ctx), on: (event, callback) => { assert.equal(event, 'connection/request'); handler = callback },
    get: () => undefined, loader: { entries: () => [{ options: { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard' } },
      fiber: { restart: () => { runs++; return new Promise(done => { finish = done }) } } }] }, agentPresets: { resolve: async () => {} } }
  installPresetRefresh(ctx)
  const response = () => ({ writeHead(status) { this.status = status }, end(value) { this.value = JSON.parse(value) } })
  let delegated = false
  await handler({ url: '/api/another' }, response(), () => { delegated = true })
  assert.equal(delegated, true)
  const invalid = response()
  await handler({ url: '/api/dsh-performance-statistics/refresh-presets', method: 'GET' }, invalid)
  assert.equal(invalid.status, 405)
  const request = { url: '/api/dsh-performance-statistics/refresh-presets', method: 'POST' }, a = response(), b = response()
  const one = handler(request, a), two = handler(request, b)
  await new Promise(done => setImmediate(done))
  assert.equal(runs, 1)
  finish(); await Promise.all([one, two])
  assert.equal(a.status, 200); assert.deepEqual(a.value, { refreshed: ['standard'] }); assert.deepEqual(b.value, a.value)
  ctx.agentPresets.resolve = async () => { throw Error('private configuration') }
  const failed = response(); await handler(request, failed)
  assert.equal(failed.status, 503); assert.deepEqual(failed.value, { code: 'preset-refresh-failed' })
})
