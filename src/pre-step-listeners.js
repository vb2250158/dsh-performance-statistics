/** Own-work timings for listeners registered after the statistics provider starts. */
import { randomUUID } from 'node:crypto'

const operations = {
  '@deepseek-ai/dsh-tool-skill': 'skill-preparation',
  '@deepseek-ai/dsh-agent-instructions': 'instructions-compose',
  '@deepseek-ai/dsh-time-context': 'time-context',
  '@deepseek-ai/dsh-tmux-context': 'tmux-query',
  '@deepseek-ai/dsh-session-reference': 'session-references',
}

function owner(entry) {
  const name = entry?.options?.name
  if (typeof name !== 'string') return undefined
  if (!name.includes(':') && !name.includes('\\')) return name
  for (const plugin of Object.keys(operations)) {
    const short = plugin.split('/')[1].slice(4)
    if (name.includes('/' + short + '/') || name.includes('/dsh-' + short + '/')) return plugin
  }
  const id = entry.options.id
  return id === undefined ? undefined : /^dsh-[a-z0-9-]+$/.test(id) ? id : `plugin:${id}`
}

/** Intercept public listener registration without reading or replacing existing event registries.
 * @param ctx Owning plugin context.
 * @param context Async context shared with cooperative operation meters.
 * @param record Best-effort append of names and timestamps.
 * @returns Marks a listener as cooperatively measured, preventing duplicate readings.
 */
export function installPreStepListenerMeters(ctx, context, record) {
  let registering = false, active = true
  ctx.effect(() => () => { active = false })
  ctx.on('internal/listener', function (name, listener, options) {
    if (name !== 'agent/pre-step' || registering) return
    const plugin = owner(this.fiber.entry)
    if (plugin === undefined || plugin === 'dsh-performance-statistics') return
    const operation = operations[plugin] ?? 'pre-step-listener'
    registering = true
    try {
      return this.on(name, async function (payload, next) {
        if (!active) return listener.call(this, payload, next)
        const position = { agent: payload.agent, turn: payload.turn, step: payload.step }
        const meter = { plugin, cooperative: false }, intervals = []
        let start = Date.now(), delegated = 0, failed = true
        const finish = end => { if (start !== undefined && end > start) intervals.push([start, end]); start = undefined }
        const delegate = async () => {
          if (delegated++ === 0) finish(Date.now())
          try { return await next() }
          finally { if (--delegated === 0) start = Date.now() }
        }
        try {
          const result = await context.run({ ...context.getStore(), ...position, phase: 'preStep',
            operation: { plugin, operation }, listenerMeter: meter }, () => listener.call(this, payload, delegate))
          failed = false
          return result
        } finally {
          finish(Date.now())
          if (active && !meter.cooperative) for (const [startTime, endTime] of intervals) record(position, {
            id: randomUUID(), phase: 'end', kind: 'preStep', parentKind: 'preStep', plugin, operation, startTime, endTime, failed,
          })
        }
      }, options)
    } finally { registering = false }
  }, { global: true, prepend: true })
  return plugin => {
    const meter = context.getStore()?.listenerMeter
    if (meter?.plugin === plugin) meter.cooperative = true
  }
}
