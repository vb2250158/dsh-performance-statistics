/** Allocate overlapping measured intervals once, retaining uncovered time explicitly. */
export function startupIntervalPie(start, end, spans) {
  const clipped = spans.map(row => ({ ...row, start: Math.max(start, row.start), end: Math.min(end, row.end) }))
    .filter(row => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start)
  const points = [...new Set([start, end, ...clipped.flatMap(row => [row.start, row.end])])].sort((a, b) => a - b)
  const totals = new Map()
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i]
    const active = clipped.filter(row => row.start <= from && row.end >= to)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start) || a.key.localeCompare(b.key))
    const row = active[0] ?? { key: 'unmeasured' }
    const current = totals.get(row.key) ?? { key: row.key, label: row.label, milliseconds: 0 }
    current.milliseconds += to - from
    totals.set(row.key, current)
  }
  return [...totals.values()].filter(row => row.milliseconds > 0)
}

/** Persist only resource path labels, never origins, query values, fragments or request bodies. */
function startupResourceLabel(name) {
  try {
    const url = new URL(name)
    // DSH combo requests put package paths in the first query component. Ignore parameter values.
    const candidate = url.pathname.endsWith('/plugins/') && url.search.startsWith('??') ? url.search.slice(2).split('&')[0] : ''
    const combo = /^[\w@./,+-]+$/.test(candidate) && candidate.endsWith('.js') ? candidate : ''
    return (combo || url.pathname).slice(-300)
  } catch (error) { return 'resource' }
}

/** Snapshot completed browser resource timings; elapsed requests are diagnostic, not CPU attribution. */
export function startupResourceDetails(performance, completed) {
  return performance.getEntriesByType('resource').filter(row => row.responseEnd > 0 && row.startTime < completed)
    .map((row, index) => ({ key: `resource-${index}`, label: startupResourceLabel(row.name),
      type: row.initiatorType, start: row.startTime, end: Math.min(completed, row.responseEnd),
      bytes: row.transferSize, decodedBytes: row.decodedBodySize,
      request: row.requestStart > 0 && row.responseStart >= row.requestStart ? row.responseStart - row.requestStart : undefined,
      download: row.responseStart > 0 ? row.responseEnd - row.responseStart : undefined }))
}

/** Read versioned early boot measurements after the statistics plugin itself activates. */
export function startupMeasuredDetails(performance, completed, shellAt) {
  const rows = performance.getEntriesByType('measure')
    .filter(row => row.name === 'dsh:startup' && row.detail?.version === 1 && ['phase', 'plugin'].includes(row.detail.kind)
      && (row.detail.kind !== 'plugin' || typeof row.detail.plugin === 'string' && typeof row.detail.state === 'string')
      && typeof row.detail.stage === 'string' && Number.isFinite(row.startTime) && Number.isFinite(row.duration) && row.duration >= 0 && row.startTime < completed)
    .map((row, index) => ({ key: `measure-${index}`, kind: row.detail.kind, stage: row.detail.stage,
      plugin: typeof row.detail.plugin === 'string' ? row.detail.plugin : undefined,
      state: typeof row.detail.state === 'string' ? row.detail.state : undefined,
      start: Math.max(0, row.startTime), end: Math.min(completed, row.startTime + row.duration) }))
  const mount = rows.find(row => row.kind === 'phase' && row.stage === 'mount')
  const nativeReactCommit = rows.some(row => row.kind === 'phase' && row.stage === 'react-mount')
  // A native first-commit interval replaces the older shell-probe approximation.
  if (!nativeReactCommit && mount && Number.isFinite(shellAt) && shellAt > mount.end) rows.push({ key: 'shell-commit', kind: 'phase', stage: 'shell-commit', start: mount.end, end: Math.min(shellAt, completed) })
  return rows
}
