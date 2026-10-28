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

test('explicit pre-step position covers callers outside the enclosing async context', async () => {
  const f = fixture(); installSessionTimingObserver(f.ctx, f.append)
  const result = { kind: 'enter' }, failure = new Error('task failure')
  const timing = f.ctx.get('agentPreStepTiming')
  await Promise.all(f.agents.map((agent, index) => timing.run({ agent, turn: index, step: 3 },
    { plugin: 'input-owner', operation: 'skill-snapshot' }, async () => result)))
  const rows = f.records.filter(row => row.data.phase === 'end')
  assert.deepEqual(rows.map(row => [row.session, row.data.turn, row.data.step]), [['a', 0, 3], ['b', 1, 3]])
  assert.ok(rows.every(row => row.data.kind === 'preStep' && row.data.operation === 'skill-snapshot'))
  await assert.rejects(timing.run({ agent: f.agents[0], turn: 2, step: 1 },
    { plugin: 'input-owner', operation: 'failure' }, async () => { throw failure }), error => error === failure)
  assert.equal(f.records.at(-1).data.failed, true)
  f.dispose(); assert.equal(f.ctx.get('agentPreStepTiming'), undefined)
})

test('selection invocation ids survive native and ordinary helper request timing', async () => {
  const f = fixture(); installSessionTimingObserver(f.ctx, f.append)
  const timing = f.ctx.get('chatStageTiming')
  await f.ctx.get('agentPreStepTiming').run({ agent: f.agents[0], turn: 1, step: 1 }, { plugin: 'gate', operation: 'before' },
    () => timing.request({ plugin: 'gate', operation: 'skill-catalog', provider: 'fixture', model: 'local', selectionId: 'selection-one' }, async () => 'ok'))
  assert.ok(f.records.some(row => row.data.role === 'auxiliary' && row.data.selectionId === 'selection-one' && row.data.phase === 'end'))
  f.dispose()
})

test('non-streaming native decisions are auxiliary requests with their own route and enclosing stage', async () => {
  const f = fixture(); installSessionTimingObserver(f.ctx, f.append)
  const result = { probabilities: { yes: 1 } }, failure = new Error('native failure')
  const service = f.ctx.get('chatStageTiming'), metadata = { plugin: 'native-gate', operation: 'before',
    provider: 'fixture', model: 'native', transport: 'native-decisions', rules: [{ id: 'input' }] }
  await f.ctx.get('agentPreStepTiming').run({ agent: f.agents[0], turn: 4, step: 1 },
    { plugin: 'native-gate', operation: 'input-rules' }, async () => {
      assert.strictEqual(await service.request(metadata, async () => result), result)
      await assert.rejects(service.request(metadata, async () => { throw failure }), error => error === failure)
    })
  const calls = f.records.filter(row => row.data.phase === 'end' && row.data.role === 'auxiliary').map(row => row.data)
  assert.deepEqual(calls.map(row => [row.kind, row.parentKind, row.transport, row.failed]), [
    ['auxiliaryModel', 'preStep', 'native-decisions', false], ['auxiliaryModel', 'preStep', 'native-decisions', true],
  ])
  assert.ok(calls.every(row => row.provider === 'fixture' && row.model === 'native' && row.firstTokenTime === undefined))
  assert.doesNotMatch(JSON.stringify(f.records), /probabilities/)
  f.dispose()
})

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
  const operation = { plugin: 'fixture-gate', operation: 'skill-catalog', rules: [rule], selectionId: 'ordinary-selection' }
  await f.invoke('agent/pre-step', [{ agent: f.agents[0], turn: 0, step: 1 }], async () => {
    const stream = f.ctx.get('chatStageTiming').stream(operation, () => f.invoke('llm/stream', [{ provider: 'fixture', model: 'judge' }], async function* () { yield chunk }))
    for await (const value of stream) assert.strictEqual(value, chunk)
  })
  const call = f.records.find(row => row.data.phase === 'end' && row.data.role === 'auxiliary').data
  assert.equal(call.plugin, operation.plugin); assert.equal(call.operation, operation.operation)
  assert.equal(call.selectionId, 'ordinary-selection')
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

test('optional task timing records named preprocessing work and preserves task results and failures', async () => {
  const f = fixture(); installSessionTimingObserver(f.ctx, f.append)
  const timing = f.ctx.get('chatStageTiming'), result = { kind: 'enter' }, failure = new Error('fixture failure')
  assert.strictEqual(await timing.run({ plugin: 'fixture' }, async () => result), result)
  assert.equal(f.records.length, 0, 'Unscoped work does not attach itself to another session')
  const agent = f.agents[0]
  await f.invoke('agent/pre-step', [{ agent, turn: 1, step: 2 }], async () => {
    assert.strictEqual(await timing.run({ plugin: 'fixture', operation: 'catalog-snapshot' }, async () => result), result)
    await assert.rejects(timing.run({ plugin: 'fixture', operation: 'candidate-load' }, async () => { throw failure }), error => error === failure)
  })
  const tasks = f.records.filter(row => row.data.phase === 'end' && row.data.plugin === 'fixture').map(row => row.data)
  assert.deepEqual(tasks.map(row => [row.operation, row.kind, row.parentKind, row.failed]), [
    ['catalog-snapshot', 'preStep', 'preStep', false], ['candidate-load', 'preStep', 'preStep', true],
  ])
  f.dispose()
})
