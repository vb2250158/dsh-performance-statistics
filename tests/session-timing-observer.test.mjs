import assert from 'node:assert/strict'
import test from 'node:test'
import { installSessionTimingObserver } from '../src/session-timing-observer.js'

function fixture() {
  const events = new Map(), cleanups = [], records = [], warnings = [], services = new Map()
  function on(owner, name, callback, options = {}) {
    const entry = { owner, callback }, rows = events.get(name) ?? []
    options.prepend ? rows.unshift(entry) : rows.push(entry)
    events.set(name, rows)
    const stop = () => { const index = rows.indexOf(entry); if (index >= 0) rows.splice(index, 1) }
    cleanups.push(stop)
    return stop
  }
  const makeAgent = id => ({ id, session: { id }, ctx: { on: (...args) => on(id, ...args) } })
  const agents = [makeAgent('a'), makeAgent('b')]
  const ctx = { on: (...args) => on(undefined, ...args), effect: fn => cleanups.push(fn()),
    provide(name, value) { services.set(name, value); return () => services.delete(name) }, get: name => services.get(name),
    agents: { list: () => agents }, logger: { warn: (...args) => warnings.push(args) } }
  const invoke = (name, args, fallback) => {
    const agent = args[0]?.agent
    const rows = (events.get(name) ?? []).filter(row => row.owner === undefined || row.owner === agent?.id)
    const at = index => index === rows.length ? fallback() : rows[index].callback(...args, () => at(index + 1))
    return at(0)
  }
  const append = (session, type, data) => records.push({ session: session.id, type, data })
  return { ctx, agents, records, warnings, invoke, append, dispose: () => cleanups.reverse().forEach(fn => typeof fn === 'function' && fn()) }
}

test('meters concurrent pre-step helper models in the correct sessions without retaining private content', async () => {
  const f = fixture()
  installSessionTimingObserver(f.ctx, f.append)
  const chunk = { type: 'text-delta', text: 'private-output' }
  await Promise.all(f.agents.map(agent => f.invoke('agent/pre-step', [{ agent, turn: 0, step: 1 }], async () => {
    const stream = f.invoke('llm/stream', [{ provider: 'fixture', model: 'judge', messages: ['private-input'] }], async function* () {
      await Promise.resolve(); yield chunk
    })
    for await (const received of stream) assert.strictEqual(received, chunk)
    return { kind: 'enter', messages: [] }
  })))
  const calls = f.records.filter(row => row.data.kind === 'auxiliaryModel' && row.data.phase === 'end')
  assert.deepEqual(calls.map(row => row.session).sort(), ['a', 'b'])
  assert.ok(calls.every(row => row.data.role === 'auxiliary' && row.data.firstTokenTime >= row.data.startTime))
  assert.doesNotMatch(JSON.stringify(f.records), /private-input|private-output|messages|arguments/)
  const outside = f.invoke('llm/stream', [{ sessionId: 'a', provider: 'fixture', model: 'main' }], async function* () { yield chunk })
  for await (const value of outside) assert.strictEqual(value, chunk)
  assert.equal(f.records.at(-1).data.role, 'main')
  f.dispose()
})

test('caller labels survive lazy iteration and each helper request retains its own rule and latency', async () => {
  const f = fixture(); installSessionTimingObserver(f.ctx, f.append)
  const chunk = { type: 'text-delta', text: 'private-result' }, rule = { id: 'skills', title: 'Skill relevance' }
  const operation = { plugin: 'fixture-gate', operation: 'skill-catalog', rules: [rule] }
  await f.invoke('agent/pre-step', [{ agent: f.agents[0], turn: 0, step: 1 }], async () => {
    const stream = f.ctx.get('chatStageTiming').stream(operation, () => f.invoke('llm/stream', [{ provider: 'fixture', model: 'judge' }], async function* () { yield chunk }))
    for await (const value of stream) assert.strictEqual(value, chunk)
  })
  const call = f.records.find(row => row.data.phase === 'end' && row.data.role === 'auxiliary').data
  assert.equal(call.plugin, operation.plugin); assert.equal(call.operation, operation.operation)
  assert.deepEqual(call.rules, [rule]); assert.equal(call.parentKind, 'preStep')
  assert.equal(call.provider, 'fixture'); assert.equal(call.model, 'judge')
  assert.doesNotMatch(JSON.stringify(f.records), /private-result/)
  f.dispose(); assert.equal(f.ctx.get('chatStageTiming'), undefined)
})

test('streaming is incremental, cancellation closes the source, and upstream errors keep their identity', async () => {
  const f = fixture(); installSessionTimingObserver(f.ctx, f.append)
  const agent = f.agents[0]
  await f.invoke('agent/resolve-model', [{ agent, turn: 0, step: 1 }], async () => ({}))
  let produced = 0, closed = false
  const stream = f.invoke('llm/stream', [{ sessionId: 'a', provider: 'fixture', model: 'main' }], async function* () {
    try { produced++; yield { type: 'text-delta', text: 'one' }; produced++; yield { type: 'text-delta', text: 'two' } }
    finally { closed = true }
  })
  for await (const value of stream) { assert.equal(value.text, 'one'); assert.equal(produced, 1); break }
  assert.equal(closed, true)
  assert.equal(f.records.at(-1).data.failed, true)
  const failure = new Error('fixture failure')
  const failed = f.invoke('llm/stream', [{ sessionId: 'a', provider: 'fixture', model: 'main' }], async function* () { throw failure })
  await assert.rejects(async () => { for await (const value of failed) void value }, error => error === failure)
  const terminal = { type: 'finish', reason: { kind: 'error', failure: { code: 'FIXTURE' } } }
  for await (const value of f.invoke('llm/stream', [{ sessionId: 'a', provider: 'fixture', model: 'main' }], async function* () { yield terminal })) assert.strictEqual(value, terminal)
  assert.equal(f.records.at(-1).data.failed, true)
  f.dispose()
})

test('tool outcomes and logging failures do not change delegated execution', async () => {
  const f = fixture(); let attempts = 0
  installSessionTimingObserver(f.ctx, () => { attempts++; throw new Error('fixture recording failure') })
  const agent = f.agents[0], result = { success: true }
  await f.invoke('agent/resolve-model', [{ agent, turn: 0, step: 1 }], async () => ({}))
  const actual = await f.invoke('tools/post-execute', [{ agent, name: 'shell', arguments: 'private' }, result], async () => result)
  assert.strictEqual(actual, result)
  assert.equal(attempts, 4)
  assert.equal(f.warnings.length, 1)
  f.dispose()
})

test('normalized tool failures and policy denials are counted without replacing the outcome', async () => {
  const f = fixture(); installSessionTimingObserver(f.ctx, f.append)
  const agent = f.agents[0]
  await f.invoke('agent/resolve-model', [{ agent, turn: 0, step: 1 }], async () => ({}))
  for (const [name, outcome] of [['tools/execute', { isError: true }], ['tools/pre-execute', { kind: 'deny' }]]) {
    assert.strictEqual(await f.invoke(name, [{ agent, name: 'shell' }], async () => outcome), outcome)
    assert.equal(f.records.at(-1).data.failed, true)
  }
  f.dispose()
})

test('disposing an agent removes its scoped timers before the plugin itself unloads', async () => {
  const f = fixture(); installSessionTimingObserver(f.ctx, f.append)
  const agent = f.agents[0]
  await f.invoke('agent/disposed', [{ agent }], () => {})
  await f.invoke('agent/pre-step', [{ agent, turn: 0, step: 1 }], async () => ({}))
  assert.equal(f.records.length, 0)
  f.dispose()
})
