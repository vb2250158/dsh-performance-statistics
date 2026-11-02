/** Partition navigation through the first painted application shell, without adding overlapping resources. */
export function startupPhases(navigation, shellPaint, completed) {
  const points = [0, navigation?.domainLookupStart, navigation?.domainLookupEnd, navigation?.connectEnd,
    navigation?.requestStart, navigation?.responseStart, navigation?.responseEnd, navigation?.domInteractive, shellPaint, completed]
  const keys = ['navigation', 'dns', 'connect', 'requestQueue', 'server', 'document', 'parse', 'client', 'paint']
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
  let snapshot = { records: [], limit: 50, storageFailed: false }, listeners = new Set()
  try {
    const saved = JSON.parse(storage.getItem(key) ?? 'null')
    if (saved && [20, 50, 100].includes(saved.limit) && Array.isArray(saved.records)) snapshot = { ...snapshot, limit: saved.limit,
      records: saved.records.filter(r => typeof r.id === 'string' && Number.isFinite(r.total) && r.total >= 0 && Number.isFinite(r.at) && Number.isInteger(r.sequence) && Array.isArray(r.phases)
        && r.phases.every(p => typeof p.key === 'string' && Number.isFinite(p.milliseconds) && p.milliseconds >= 0 && Number.isFinite(p.ratio))).slice(-saved.limit) }
  } catch (error) { snapshot = { ...snapshot, storageFailed: true } }
  const publish = next => {
    snapshot = next
    try { storage.setItem(key, JSON.stringify(snapshot)) } catch (error) { snapshot = { ...snapshot, storageFailed: true } }
    for (const listener of listeners) listener()
  }
  return { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    setLimit: limit => { if ([20, 50, 100].includes(limit)) publish({ ...snapshot, limit, records: snapshot.records.slice(-limit) }) },
    record: record => { if (!snapshot.records.some(r => r.id === record.id)) publish({ ...snapshot, records: [...snapshot.records,
      { ...record, sequence: (snapshot.records.at(-1)?.sequence ?? 0) + 1 }].slice(-snapshot.limit) }) } }
}

/** Arm one measurement per document; the shell seat calls painted after its layout commits. */
export function createStartupCollector(win, history) {
  let disposed = false, scheduled = false, shellAt, firstFrame, secondFrame
  const navigation = () => win.performance.getEntriesByType('navigation')[0]
  const finish = () => {
    if (disposed || scheduled || shellAt === undefined || win.document.readyState !== 'complete') return
    scheduled = true
    firstFrame = win.requestAnimationFrame(() => { secondFrame = win.requestAnimationFrame(() => {
      if (disposed) return
      const total = win.performance.now(), nav = navigation()
      history.record({ id: String(win.performance.timeOrigin), at: win.performance.timeOrigin, total,
        type: nav?.type ?? 'navigate', phases: startupPhases(nav, shellAt, total) })
    }) })
  }
  win.addEventListener('load', finish)
  return { painted: () => { shellAt ??= win.performance.now(); finish() }, dispose: () => {
    disposed = true; win.removeEventListener('load', finish); win.cancelAnimationFrame(firstFrame); win.cancelAnimationFrame(secondFrame)
  } }
}
