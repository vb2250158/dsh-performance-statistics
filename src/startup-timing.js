import { startupResourceDetails, startupMeasuredDetails } from './startup-details.js'

/** Partition navigation through the first painted application shell, without adding overlapping resources. */
export function startupPhases(navigation, shellPaint, completed, sessionsAt) {
  const points = [0, navigation?.domainLookupStart, navigation?.domainLookupEnd, navigation?.connectEnd,
    navigation?.requestStart, navigation?.responseStart, navigation?.responseEnd, navigation?.domInteractive, shellPaint, completed]
  const keys = ['navigation', 'dns', 'connect', 'requestQueue', 'server', 'document', 'parse', 'client', 'paint']
  if (sessionsAt !== undefined) { points.splice(-1, 0, sessionsAt); keys.splice(-1, 0, 'sessionLoad') }
  let cursor = 0
  return keys.map((key, index) => {
    const end = Math.min(completed, Math.max(cursor, Number.isFinite(points[index + 1]) ? points[index + 1] : cursor))
    const milliseconds = end - cursor; cursor = end
    return { key, milliseconds, ratio: completed > 0 ? milliseconds / completed : 0 }
  })
}

/** Browser-local refresh history. Storage failure leaves the current measurement readable. */
export function createStartupHistory(storage) {
  const key = 'dsh-performance-statistics:startup:v1'
  let snapshot = { records: [], limit: 50, storageFailed: false, pending: true }, listeners = new Set()
  try {
    const saved = JSON.parse(storage.getItem(key) ?? 'null')
    if (saved && [20, 50, 100].includes(saved.limit) && Array.isArray(saved.records)) snapshot = { ...snapshot, limit: saved.limit,
      records: saved.records.filter(r => r && typeof r.id === 'string' && Number.isFinite(r.total) && r.total >= 0 && Number.isFinite(r.at) && Number.isInteger(r.sequence) && Array.isArray(r.phases)
        && r.phases.every(p => p && typeof p.key === 'string' && Number.isFinite(p.milliseconds) && p.milliseconds >= 0 && Number.isFinite(p.ratio)))
        .map(r => ({ ...r, resources: Array.isArray(r.resources) ? r.resources.filter(row => row && typeof row.key === 'string' && typeof row.label === 'string'
          && typeof row.type === 'string' && Number.isFinite(row.start) && Number.isFinite(row.end) && row.end >= row.start
          && ['bytes', 'decodedBytes', 'request', 'download'].every(key => row[key] === undefined || Number.isFinite(row[key]) && row[key] >= 0)) : undefined,
          measures: Array.isArray(r.measures) ? r.measures.filter(row => row && typeof row.key === 'string' && ['phase', 'plugin'].includes(row.kind)
            && typeof row.stage === 'string' && Number.isFinite(row.start) && Number.isFinite(row.end) && row.end >= row.start
            && (row.kind !== 'plugin' || typeof row.plugin === 'string' && typeof row.state === 'string')) : undefined })).slice(-saved.limit) }
  } catch (error) { snapshot = { ...snapshot, storageFailed: true } }
  const publish = next => {
    snapshot = next
    try { storage.setItem(key, JSON.stringify(snapshot)) } catch (error) { snapshot = { ...snapshot, storageFailed: true } }
    for (const listener of listeners) listener()
  }
  return { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    setLimit: limit => { if ([20, 50, 100].includes(limit)) publish({ ...snapshot, limit, records: snapshot.records.slice(-limit) }) },
    record: record => { if (!snapshot.records.some(r => r.id === record.id)) publish({ ...snapshot, pending: false, records: [...snapshot.records,
      { ...record, sequence: (snapshot.records.at(-1)?.sequence ?? 0) + 1 }].slice(-snapshot.limit) }) } }
}

/** Wait for shell, successful list/content commits and page load; missing readiness never counts as success. */
export function createStartupCollector(win, history) {
  let disposed = false, scheduled = false, shellAt, firstFrame, secondFrame, observer
  const navigation = () => win.performance.getEntriesByType('navigation')[0]
  const sessionsReadyAt = () => {
    const measures = startupMeasuredDetails(win.performance, win.performance.now())
    const list = measures.find(row => row.kind === 'phase' && row.stage === 'session-list')
    const content = measures.find(row => row.kind === 'phase' && row.stage === 'session-content')
    return list && content ? Math.max(list.end, content.end) : undefined
  }
  const finish = () => {
    if (disposed || scheduled) return
    const sessionsAt = sessionsReadyAt()
    if (shellAt === undefined || sessionsAt === undefined || win.document.readyState !== 'complete') return
    scheduled = true
    firstFrame = win.requestAnimationFrame(() => { secondFrame = win.requestAnimationFrame(() => {
      if (disposed) return
      const total = win.performance.now(), nav = navigation()
      history.record({ id: String(win.performance.timeOrigin), at: win.performance.timeOrigin, total,
        type: nav?.type ?? 'navigate', criterion: 'session-first-screen', phases: startupPhases(nav, shellAt, total, Math.max(shellAt, sessionsAt)),
        resources: startupResourceDetails(win.performance, total), measures: startupMeasuredDetails(win.performance, total, shellAt) })
      observer?.disconnect()
    }) })
  }
  win.addEventListener('load', finish)
  if (win.PerformanceObserver) {
    observer = new win.PerformanceObserver(finish)
    observer.observe({ type: 'measure', buffered: true })
  }
  return { painted: () => { shellAt ??= win.performance.now(); finish() }, dispose: () => {
    disposed = true; observer?.disconnect(); win.removeEventListener('load', finish); win.cancelAnimationFrame(firstFrame); win.cancelAnimationFrame(secondFrame)
  } }
}
