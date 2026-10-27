import assert from 'node:assert/strict'
import test from 'node:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { installPreStepListenerMeters } from '../src/pre-step-listeners.js'

function fixture() {
  const hooks = [], cleanups = [], records = [], context = new AsyncLocalStorage()
  function on(name, listener, options) {
    for (const hook of hooks.filter(row => row.name === 'internal/listener')) {
      const replacement = hook.listener.call(this, name, listener, options)
      if (replacement) return replacement
    }
    const row = { name, listener, owner: this, options }
    hooks.push(row)
    const dispose = () => { const index = hooks.indexOf(row); if (index >= 0) hooks.splice(index, 1) }
    return dispose
  }
  const ctx = { on, effect: callback => cleanups.push(callback()), fiber: {} }
  const cooperate = installPreStepListenerMeters(ctx, context, (position, data) => records.push({ position, data }))
  const scope = name => ({ on, fiber: { entry: { options: { name } } } })
  const invoke = async (payload, bottom) => {
    const listeners = hooks.filter(row => row.name === 'agent/pre-step')
    const at = index => index === listeners.length ? bottom() : listeners[index].listener.call(listeners[index].owner, payload, () => at(index + 1))
    return at(0)
  }
  return { scope, cooperate, records, hooks, invoke, dispose: () => { cleanups.reverse().forEach(callback => callback()); context.disable() } }
}

test('new listener meters exclude downstream time and preserve context, options and decision identity', async t => {
  let now = 100
  t.mock.method(Date, 'now', () => now)
  const f = fixture(), owner = f.scope('@deepseek-ai/dsh-tool-skill'), options = { prepend: true }, result = { kind: 'enter' }
  owner.on('agent/pre-step', async function (_payload, next) {
    assert.strictEqual(this, owner)
    now += 5
    const decision = await next()
    now += 7
    return decision
  }, options)
  const payload = { agent: { id: 'fixture' }, turn: 1, step: 2 }
  assert.strictEqual(await f.invoke(payload, async () => { now += 100; return result }), result)
  assert.strictEqual(f.hooks.find(row => row.name === 'agent/pre-step').options, options)
  assert.deepEqual(f.records.map(row => [row.data.plugin, row.data.operation, row.data.endTime - row.data.startTime]), [
    ['@deepseek-ai/dsh-tool-skill', 'skill-preparation', 5], ['@deepseek-ai/dsh-tool-skill', 'skill-preparation', 7],
  ])
  assert.ok(f.records.every(row => row.position.agent === payload.agent && row.position.step === 2))
  f.dispose()
  const count = f.records.length
  assert.strictEqual(await f.invoke(payload, async () => result), result)
  assert.equal(f.records.length, count, 'Disposed meters delegate directly even while their owner remains loaded')
})

test('cooperative providers do not produce duplicate legacy intervals and failures retain their identity', async t => {
  let now = 100
  t.mock.method(Date, 'now', () => now)
  const f = fixture(), owner = f.scope('@deepseek-ai/dsh-agent-instructions'), failure = new Error('fixture failure')
  const stop = owner.on('agent/pre-step', async (_payload, next) => {
    await next(); now += 20; f.cooperate('@deepseek-ai/dsh-agent-instructions'); return 'result'
  })
  assert.equal(await f.invoke({ agent: {}, turn: 1, step: 1 }, async () => 'result'), 'result')
  assert.deepEqual(f.records, [])
  stop()
  owner.on('agent/pre-step', async () => { now += 12; throw failure })
  await assert.rejects(f.invoke({ agent: {}, turn: 1, step: 1 }, async () => 'unused'), error => error === failure)
  assert.equal(f.records[0].data.failed, true)
  assert.equal(f.records[0].data.endTime - f.records[0].data.startTime, 12)
  f.dispose()
})

test('file module identities use package ids without retaining workspace paths or duplicate cooperative work', async t => {
  let now = 100
  t.mock.method(Date, 'now', () => now)
  const f = fixture(), scope = f.scope('file:///private/workspace/custom/lib/index.js')
  scope.fiber.entry.options.id = 'dsh-jev-context-gate'
  scope.on('agent/pre-step', async () => { now += 20; f.cooperate('dsh-jev-context-gate'); return 'result' })
  assert.equal(await f.invoke({ agent: {}, turn: 1, step: 1 }, async () => 'unused'), 'result')
  assert.deepEqual(f.records, [])
  f.dispose()
})
