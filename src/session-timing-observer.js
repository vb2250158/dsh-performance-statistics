/** Record timings through public waterfalls without changing their decisions or buffering streams. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { SESSION_TIMING_RECORD } from './session-timing.js'

/** Install scoped stage meters and retain only names, timestamps and outcomes in the log. */
export function installSessionTimingObserver(ctx, appendPluginRecord = (session, type, data) => session.append(type, data, { ignorable: true })) {
  const context = new AsyncLocalStorage()
  const positions = new Map(), bindings = new Map()
  let warned = false
  // Callers supply operation names separately from model inputs and transport options.
  ctx.effect(() => ctx.provide('chatStageTiming', {
    stream(operation, createStream) {
      const store = { ...context.getStore(), operation }
      return (async function* () {
        let iterator, complete = false
        try {
          iterator = context.run(store, () => createStream()[Symbol.asyncIterator]())
          while (true) {
            const item = await context.run(store, () => iterator.next())
            if (item.done) { complete = true; break }
            yield item.value
          }
        } finally {
          if (!complete && iterator?.return !== undefined) await context.run(store, () => iterator.return())
        }
      })()
    },
  }))
  function record(position, value) {
    try { appendPluginRecord(position.agent.session, SESSION_TIMING_RECORD, { turn: position.turn, step: position.step, ...value }) }
    catch (error) {
      // Instrumentation failure must preserve the operation's original result or rejection.
      if (!warned) { warned = true; ctx.logger.warn('Session stage timing could not be recorded: %s', error instanceof Error ? error.message : String(error)) }
    }
  }
  async function measure(position, kind, detail, next, rejected) {
    const value = { id: randomUUID(), kind, startTime: Date.now(), ...(detail === undefined ? {} : { detail }) }
    record(position, { ...value, phase: 'start' })
    let failed = true
    try {
      const result = await context.run({ ...position, phase: kind }, next)
      failed = rejected?.(result) ?? false
      return result
    } finally { record(position, { ...value, phase: 'end', endTime: Math.max(value.startTime, Date.now()), failed }) }
  }
  function bind(agent) {
    if (bindings.has(agent)) return
    const disposers = []
    bindings.set(agent, disposers)
    for (const [event, kind] of [
      ['agent/resolve-model', 'modelSelection'], ['agent/pre-step', 'preStep'],
      ['agent/request-context', 'contextCheck'], ['agent/request-context-ready', 'contextReady'],
      ['agent/request-error', 'retry'],
    ]) disposers.push(agent.ctx.on(event, (payload, next) => {
      const position = { agent, turn: payload.turn, step: payload.step }
      positions.set(String(agent.id), position)
      return measure(position, kind, undefined, next)
    }, { prepend: true }))
    for (const [event, kind] of [['tools/pre-execute', 'toolCheck'], ['tools/execute', 'toolExecute'], ['tools/post-execute', 'toolPost']]) {
      disposers.push(agent.ctx.on(event, (...args) => {
        const exec = args[0], next = args.at(-1), position = positions.get(String(agent.id))
        return position === undefined ? next() : measure(position, kind, exec.name, next, result =>
          event === 'tools/execute' ? result.isError : event === 'tools/pre-execute'
            ? result.kind === 'deny' || result.kind === 'cancel' : args[1].isError || result.kind === 'block')
      }, { prepend: true }))
    }
    disposers.push(agent.ctx.on('agent/turn-stopping', () => {
      const position = positions.get(String(agent.id))
      if (position !== undefined) record(position, { id: randomUUID(), phase: 'start', kind: 'turnStopping', startTime: Date.now() })
    }, { prepend: true }))
  }
  ctx.on('agent/created', ({ agent }) => bind(agent), { global: true })
  ctx.on('agent/disposed', ({ agent }) => {
    for (const dispose of bindings.get(agent) ?? []) dispose()
    bindings.delete(agent)
    positions.delete(String(agent.id))
  }, { global: true })
  ctx.effect(() => () => {
    for (const disposers of bindings.values()) for (const dispose of disposers) dispose()
    bindings.clear(); positions.clear(); context.disable()
  })
  for (const agent of ctx.agents.list()) bind(agent)
  ctx.on('llm/stream', (options, next) => {
    const inherited = context.getStore()
    const position = options.sessionId === undefined ? inherited : positions.get(String(options.sessionId))
    if (position === undefined) return next()
    const operation = inherited?.operation
    const role = operation !== undefined || options.purpose !== undefined || inherited !== undefined && inherited.agent === position.agent ? 'auxiliary' : 'main'
    const kind = role === 'main' ? 'modelCall' : 'auxiliaryModel'
    const value = { id: randomUUID(), kind, role, startTime: Date.now(),
      detail: `${options.provider}/${options.model}`, provider: options.provider, model: options.model,
      ...(inherited?.phase === undefined ? {} : { parentKind: inherited.phase }),
      ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
      ...(operation === undefined ? {} : { plugin: operation.plugin,
        ...(operation.operation === undefined ? {} : { operation: operation.operation }),
        ...(operation.rules === undefined ? {} : { rules: operation.rules }) }) }
    const callContext = { ...position, phase: role === 'main' ? 'mainModel' : 'auxiliaryModel' }
    return (async function* () {
      record(position, { ...value, phase: 'start' })
      let firstTokenTime, finishReason, failed = true, complete = false, iterator
      try {
        const source = context.run(callContext, next)
        iterator = source[Symbol.asyncIterator]()
        while (true) {
          const item = await context.run(callContext, () => iterator.next())
          if (item.done) { complete = true; failed = finishReason === 'error' || finishReason === 'aborted'; break }
          const chunk = item.value
          if (chunk.type === 'finish') finishReason = chunk.reason.kind
          if (firstTokenTime === undefined && (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && chunk.text.length > 0) firstTokenTime = Date.now()
          yield chunk
        }
      } finally {
        try { if (!complete && iterator?.return !== undefined) await context.run(callContext, () => iterator.return()) }
        finally { record(position, { ...value, phase: 'end', endTime: Math.max(value.startTime, Date.now()), failed,
          ...(firstTokenTime === undefined ? {} : { firstTokenTime }) }) }
      }
    })()
  }, { prepend: true, global: true })
}
