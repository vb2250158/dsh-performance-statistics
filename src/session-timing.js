/** Exclusive closed-turn attribution from durable boundaries and optional measured spans. */
export const SESSION_TIMING_RECORD = 'plugin:dsh-performance-statistics/timing'
/** Read historical records without rewriting stored Sessions. */
export const LEGACY_SESSION_TIMING_RECORD = 'plugin:dsh-chat-enhancement/timing'

export const SESSION_TIMING_KINDS = [
  'turnPrepare', 'modelSelection', 'preStep', 'requestPrepare', 'contextCheck', 'contextReady',
  'modelWait', 'modelCall', 'modelReasoning', 'modelOutput', 'modelToolPlan', 'streamFinalize', 'auxiliaryModel',
  'toolDispatch', 'toolCall', 'toolCheck', 'toolExecute', 'toolPost', 'resultCommit',
  'stepTransition', 'turnStopping', 'compaction', 'rabiHook', 'retry',
]

const priorities = {
  turnPrepare: 1, requestPrepare: 1, toolDispatch: 1, resultCommit: 1, stepTransition: 1, turnStopping: 1,
  toolCall: 10, modelWait: 15, modelCall: 15, modelReasoning: 20, modelOutput: 20, modelToolPlan: 20, streamFinalize: 20,
  modelSelection: 30, preStep: 30, contextCheck: 35, contextReady: 35, retry: 35,
  toolCheck: 40, toolExecute: 40, toolPost: 40, rabiHook: 80, auxiliaryModel: 90, compaction: 100,
}

/** Validate this plugin's informational records when replaying stored JSON. */
export function sessionTimingRecordSchema(z) {
  const time = z.number().finite().nonnegative()
  return z.object({
    id: z.string(), phase: z.enum(['start', 'end']), kind: z.enum(SESSION_TIMING_KINDS),
    turn: z.number().int().nonnegative(), step: z.number().int().nonnegative(),
    startTime: time, endTime: time.optional(), firstTokenTime: time.optional(),
    detail: z.string().optional(), role: z.enum(['main', 'auxiliary']).optional(), failed: z.boolean().optional(),
    provider: z.string().optional(), model: z.string().optional(), parentKind: z.string().optional(), purpose: z.string().optional(),
    plugin: z.string().optional(), operation: z.string().optional(), rules: z.array(z.object({ id: z.string(), title: z.string().optional() })).optional(),
    transport: z.enum(['native-decisions']).optional(), selectionId: z.string().optional(),
  }).refine(value => value.phase !== 'end' || (value.endTime !== undefined && value.endTime >= value.startTime))
}

function addSpan(open, kind, start, end, operationId) {
  return end > start ? { ...open, spans: [...open.spans, { kind, start, end, ...(operationId === undefined ? {} : { operationId }) }] } : open
}

function move(open, kind, time) {
  return { ...addSpan(open, open.phase, open.cursor, time), phase: kind, cursor: time }
}

function detail(open, kind, name, milliseconds, failed = false) {
  const key = JSON.stringify([kind, name])
  const previous = open.details[key] ?? { kind, name, milliseconds: 0, calls: 0, failed: 0 }
  return { ...open, details: { ...open.details, [key]: { ...previous,
    milliseconds: previous.milliseconds + milliseconds, calls: previous.calls + 1, failed: previous.failed + Number(failed) } } }
}

/** Union parallel work and give nested measurements priority over their enclosing stage. */
export function exclusiveSessionTimings(spans, start, end) {
  return exclusiveSessionWork(spans, start, end).phases
}

/** Partition elapsed time by stage and innermost named operation in one sweep.
 * @param spans Measured intervals, optionally referring to operation records.
 * @param start Turn start timestamp.
 * @param end Turn end timestamp.
 * @returns Exclusive stage totals and operation intervals; unnamed time stays with its stage.
 */
export function exclusiveSessionWork(spans, start, end) {
  const edges = []
  for (const [index, span] of spans.entries()) {
    const left = Math.max(start, span.start), right = Math.min(end, span.end)
    if (right <= left) continue
    const value = { ...span, index }
    edges.push({ time: left, value, delta: 1 }, { time: right, value, delta: -1 })
  }
  edges.sort((a, b) => a.time - b.time)
  const active = new Map(), heaps = new Map(), live = new Set(), phases = {}, work = new Map()
  const later = (a, b) => a.start > b.start || a.start === b.start && (a.end < b.end || a.end === b.end && a.index > b.index)
  const push = (heap, value) => {
    heap.push(value)
    let index = heap.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (!later(heap[index], heap[parent])) break
      ;[heap[index], heap[parent]] = [heap[parent], heap[index]]
      index = parent
    }
  }
  const current = heap => {
    while (heap.length > 0 && !live.has(heap[0].index)) {
      const last = heap.pop()
      if (heap.length === 0) break
      heap[0] = last
      let index = 0
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1
        if (child + 1 < heap.length && later(heap[child + 1], heap[child])) child++
        if (!later(heap[child], heap[index])) break
        ;[heap[index], heap[child]] = [heap[child], heap[index]]
        index = child
      }
    }
    return heap[0]
  }
  let previous = start
  for (const edge of edges) {
    if (edge.time > previous) {
      let selected
      for (const [kind, count] of active) if (count > 0 && (selected === undefined || priorities[kind] > priorities[selected])) selected = kind
      if (selected !== undefined) {
        const milliseconds = edge.time - previous
        phases[selected] = (phases[selected] ?? 0) + milliseconds
        const operation = current(heaps.get(selected) ?? [])
        if (operation !== undefined) {
          const key = JSON.stringify([selected, operation.operationId])
          const row = work.get(key) ?? { kind: selected, operationId: operation.operationId, milliseconds: 0 }
          row.milliseconds += milliseconds
          work.set(key, row)
        }
      }
      previous = edge.time
    }
    const { value, delta } = edge
    active.set(value.kind, (active.get(value.kind) ?? 0) + delta)
    if (delta < 0) live.delete(value.index)
    else if (value.operationId !== undefined) {
      live.add(value.index)
      let heap = heaps.get(value.kind)
      if (heap === undefined) { heap = []; heaps.set(value.kind, heap) }
      push(heap, value)
    }
  }
  return { phases, work: [...work.values()] }
}

function streamSpans(open, event, runFirstTokenTime) {
  const step = open.step
  if (step === null || event.data.step !== step.number || event.data.turn !== open.turn) return open
  const milestones = []
  let finishTime
  for (const record of event.data.stream ?? []) {
    const kind = record.type === 'text-chunks' ? 'modelOutput' : record.type === 'reasoning-chunks' ? 'modelReasoning'
      : record.type === 'tool-call-chunks' ? 'modelToolPlan' : undefined
    if (kind !== undefined) {
      const time = runFirstTokenTime(record)
      if (time !== undefined) milestones.push({ time, kind })
    } else if (record.type === 'chunk' && record.chunk.type === 'finish') finishTime = record.time
  }
  milestones.sort((a, b) => a.time - b.time)
  if (open.firstOutputAt === null && milestones.length > 0) open = { ...open, firstOutputAt: milestones[0].time }
  const dispatch = step.dispatchAt ?? step.contextAt ?? step.start
  let next = addSpan(open, 'modelWait', dispatch, milestones[0]?.time ?? event.time)
  for (let i = 0; i < milestones.length; i++) {
    const point = milestones[i]
    next = addSpan(next, point.kind, point.time, milestones[i + 1]?.time ?? finishTime ?? event.time)
  }
  if (finishTime !== undefined) next = addSpan(next, 'streamFinalize', finishTime, event.time)
  return move(next, event.type === 'assistant/message' ? 'toolDispatch' : 'retry', event.time)
}

/** Fold the complete log once; the client receives only totals and operation names. */
export function createSessionTimingProjection(z, runFirstTokenTime) {
  const time = z.number().finite().nonnegative()
  const spanSchema = z.object({ kind: z.enum(SESSION_TIMING_KINDS), start: time, end: time, operationId: z.string().optional() })
  const detailSchema = z.object({ kind: z.enum(SESSION_TIMING_KINDS), name: z.string(), milliseconds: time,
    calls: time, failed: time })
  const recordSchema = sessionTimingRecordSchema(z)
  const selectionSchema = z.object({ id: z.string(), turn: time, step: time, ruleId: z.string(), ruleTitle: z.string(),
    operation: z.string(), mode: z.enum(['top', 'bottom', 'score-above', 'score-below']), value: z.number().finite(), action: z.enum(['prune', 'inject-extra']),
    threshold: z.number().finite().min(0).max(1).optional(),
    candidates: z.array(z.object({ name: z.string(), label: z.string().optional(), score: z.number().finite().min(0).max(1),
      rank: z.number().int().positive(), selected: z.boolean() })) })
  const workSchema = z.object({ kind: z.enum(SESSION_TIMING_KINDS), operationId: z.string(), milliseconds: time,
      plugin: z.string().optional(), operation: z.string().optional(), detail: z.string().optional(),
      provider: z.string().optional(), model: z.string().optional(), turn: time, step: time })
  const viewSchema = z.object({ closedMs: time, turns: time, firstOutputMs: time, firstOutputTurns: time, phases: z.record(z.string(), time),
    details: z.array(detailSchema), calls: z.array(recordSchema), operations: z.array(recordSchema), work: z.array(workSchema), selections: z.array(selectionSchema), measuredSpans: time, incompleteSpans: time })
  const hookStart = z.object({ handlerId: z.string(), point: z.string(), turn: z.number() })
  const hookEnd = z.object({ handlerId: z.string(), turn: z.number(), durationMs: time, outcome: z.string() })
  const openSchema = z.object({ turn: time, start: time, phase: z.enum(SESSION_TIMING_KINDS), cursor: time,
    step: z.object({ number: time, start: time, contextAt: time.optional(), dispatchAt: time.optional() }).nullable(), firstOutputAt: time.nullable(),
    spans: z.array(spanSchema), details: z.record(z.string(), detailSchema), calls: z.array(recordSchema), operations: z.array(recordSchema), measuredSpans: time,
    tools: z.record(z.string(), z.object({ start: time, name: z.string() })),
    compactions: z.record(z.string(), time), hooks: z.record(z.string(), z.object({ start: time, point: z.string(), parentKind: z.string().optional() })),
    pending: z.record(z.string(), recordSchema), selections: z.array(selectionSchema),
  })
  return {
    key: 'chatSessionTiming', stateVersion: 6,
    stateSchema: z.object({ view: viewSchema, open: openSchema.nullable(), details: z.record(z.string(), detailSchema) }),
    init: () => ({ view: { closedMs: 0, turns: 0, firstOutputMs: 0, firstOutputTurns: 0, phases: {}, details: [], calls: [], operations: [], work: [], selections: [], measuredSpans: 0, incompleteSpans: 0 }, open: null, details: {} }),
    apply(state, event) {
      if (event.type === 'turn/start') return { ...state, open: { turn: event.data.turn, start: event.time,
        phase: 'turnPrepare', cursor: event.time, step: null, firstOutputAt: null, spans: [], details: {}, calls: [], operations: [], measuredSpans: 0,
        tools: {}, compactions: {}, hooks: {}, pending: {}, selections: [] } }
      let open = state.open
      if (open === null) return state
      if (event.data?.turn !== undefined && event.data.turn !== open.turn) return state
      switch (event.type) {
        case 'plugin:dsh-jev-context-gate/catalog-selection': {
          const parsed = selectionSchema.safeParse(event.data)
          if (!parsed.success || event.ignorable !== true) return state
          open = { ...open, selections: [...open.selections, parsed.data] }
          break
        }
        case 'step/start':
          open = { ...move(open, 'requestPrepare', event.time), step: { number: event.data.step, start: event.time } }
          break
        case 'request/context':
          if (open.step === null) return state
          open = { ...move(open, 'requestPrepare', event.time),
            step: { number: open.step.number, start: open.step.start, contextAt: event.time } }
          break
        case 'assistant/message': case 'assistant/attempt':
          open = streamSpans(open, event, runFirstTokenTime)
          break
        case 'tool/call':
          open = { ...move(open, 'toolCall', event.time), tools: { ...open.tools,
            [event.data.callId]: { start: event.time, name: event.data.name } } }
          break
        case 'tool/result': {
          const id = event.data.message.source.callId, call = Object.hasOwn(open.tools, id) ? open.tools[id] : undefined
          if (call === undefined) return state
          open = detail(addSpan(open, 'toolCall', call.start, event.time, `tool-${id}`), 'toolCall', call.name, Math.max(0, event.time - call.start))
          open = { ...open, operations: [...open.operations, { id: `tool-${id}`, phase: 'end', kind: 'toolCall',
            turn: open.turn, step: open.step?.number ?? 0, startTime: call.start, endTime: event.time, detail: call.name }] }
          const tools = { ...open.tools }; delete tools[id]
          open = { ...open, tools }
          if (Object.keys(tools).length === 0) open = move(open, 'resultCommit', event.time)
          break
        }
        case 'step/end': open = { ...move(open, 'stepTransition', event.time), step: null }; break
        case 'compaction/start': open = { ...open, compactions: { ...open.compactions, [event.data.compactionId]: event.time } }; break
        case 'compaction/end': {
          const id = event.data.compactionId, start = Object.hasOwn(open.compactions, id) ? open.compactions[id] : undefined
          if (start === undefined) return state
          const compactions = { ...open.compactions }; delete compactions[id]
          open = { ...addSpan(open, 'compaction', start, event.time), compactions }
          break
        }
        case LEGACY_SESSION_TIMING_RECORD:
        case SESSION_TIMING_RECORD: {
          const parsed = recordSchema.safeParse(event.data)
          if (!parsed.success || event.ignorable !== true || parsed.data.turn !== open.turn) return state
          const row = parsed.data, pending = { ...open.pending }
          if (row.phase === 'start') {
            pending[row.id] = row
            open = { ...open, pending }
            if (row.role === 'main' && open.step !== null) {
              if (open.phase === 'retry') open = move(open, 'modelWait', row.startTime)
              open = { ...open, step: { ...open.step, dispatchAt: row.startTime } }
            }
            if (row.kind === 'turnStopping') open = move(open, 'turnStopping', row.startTime)
          } else {
            delete pending[row.id]
            open = { ...(row.role === 'main' ? open : addSpan(open, row.kind, row.startTime, row.endTime, row.id)), pending,
              operations: [...open.operations, row], measuredSpans: open.measuredSpans + 1 }
            if (row.role === 'main') {
              // The compact assistant stream owns output classification; this span supplies true dispatch time.
              open = addSpan(open, 'modelWait', row.startTime, row.firstTokenTime ?? row.endTime, row.id)
            }
            if (row.detail !== undefined) open = detail(open, row.kind, row.detail, row.endTime - row.startTime, row.failed)
            if (row.role !== undefined) open = { ...open, calls: [...open.calls, row] }
          }
          break
        }
        case 'plugin:dsh-rabiroute-agent/hook-invoked': {
          const parsed = hookStart.safeParse(event.data)
          if (!parsed.success || event.ignorable !== true) return state
          const row = parsed.data
          const enclosing = Object.values(open.pending).filter(value => value.startTime <= event.time && value.role === undefined)
            .sort((a, b) => b.startTime - a.startTime)[0]
          open = { ...open, hooks: { ...open.hooks, [row.handlerId]: { start: event.time, point: row.point,
            ...(enclosing === undefined ? {} : { parentKind: enclosing.kind }) } } }
          break
        }
        case 'plugin:dsh-rabiroute-agent/hook-result': {
          const parsed = hookEnd.safeParse(event.data)
          if (!parsed.success || event.ignorable !== true) return state
          const row = parsed.data, invoked = Object.hasOwn(open.hooks, row.handlerId) ? open.hooks[row.handlerId] : undefined
          if (invoked === undefined) return state
          const hooks = { ...open.hooks }; delete hooks[row.handlerId]
          open = detail({ ...addSpan(open, 'rabiHook', invoked.start, event.time, `rabi-${row.handlerId}-${invoked.start}`), hooks }, 'rabiHook', invoked.point,
            row.durationMs, row.outcome === 'failed')
          open = { ...open, operations: [...open.operations, { id: `rabi-${row.handlerId}-${invoked.start}`, phase: 'end', kind: 'rabiHook',
            turn: open.turn, step: open.step?.number ?? 0, startTime: invoked.start, endTime: event.time, detail: invoked.point,
            plugin: 'dsh-rabiroute-agent', operation: invoked.point, failed: row.outcome === 'failed',
            ...(invoked.parentKind === undefined ? {} : { parentKind: invoked.parentKind }) }] }
          break
        }
        case 'turn/end': {
          open = addSpan(open, open.phase, open.cursor, event.time)
          const phases = { ...state.view.phases }, details = { ...state.details }
          const exclusive = exclusiveSessionWork(open.spans, open.start, event.time)
          for (const [kind, milliseconds] of Object.entries(exclusive.phases)) phases[kind] = (phases[kind] ?? 0) + milliseconds
          const records = new Map(open.operations.map(row => [row.id, row]))
          const work = exclusive.work.flatMap(row => {
            const record = records.get(row.operationId)
            if (record === undefined) return []
            const metadata = Object.fromEntries(['plugin', 'operation', 'detail', 'provider', 'model', 'turn', 'step']
              .filter(key => record[key] !== undefined).map(key => [key, record[key]]))
            return [{ ...row, ...metadata }]
          })
          for (const [key, row] of Object.entries(open.details)) {
            const previous = details[key]
            details[key] = previous === undefined ? row : { ...row, milliseconds: previous.milliseconds + row.milliseconds,
              calls: previous.calls + row.calls, failed: previous.failed + row.failed }
          }
          return { open: null, details, view: { closedMs: state.view.closedMs + Math.max(0, event.time - open.start),
            firstOutputMs: state.view.firstOutputMs + (open.firstOutputAt === null ? 0 : Math.max(0, open.firstOutputAt - open.start)),
            firstOutputTurns: state.view.firstOutputTurns + Number(open.firstOutputAt !== null),
            turns: state.view.turns + 1, phases, details: Object.values(details).sort((a, b) => b.milliseconds - a.milliseconds), calls: [...state.view.calls, ...open.calls],
            operations: [...state.view.operations, ...open.operations],
            work: [...state.view.work, ...work], selections: [...state.view.selections, ...open.selections],
            measuredSpans: state.view.measuredSpans + open.measuredSpans,
            incompleteSpans: state.view.incompleteSpans + Object.values(open.pending).filter(row => row.kind !== 'turnStopping').length } }
        }
        default: return state
      }
      return { ...state, open }
    },
    wire: { summary: false, viewSchema, view: state => state.view },
  }
}
