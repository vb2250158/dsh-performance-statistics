/** Build child pies only from exclusive operation readings, never overlapping request totals.
 * @param stages Whole-log timing projection.
 * @returns Stage nodes with plugin and operation children.
 */
export function sessionBreakdown(stages) {
  if (stages === undefined) return []
  const phases = Object.entries(stages.phases).filter(([, milliseconds]) => milliseconds > 0)
    .map(([key, milliseconds]) => ({ key, milliseconds, children: [], callIds: [] }))
  for (const work of stages.work ?? []) {
    if (work.milliseconds <= 0) continue
    const phase = phases.find(node => node.key === work.kind)
    if (!phase) continue
    const plugin = work.plugin ?? work.detail ?? [work.provider, work.model].filter(Boolean).join('/')
    if (!plugin) continue
    let owner = phase.children.find(node => node.key === plugin)
    if (!owner) { owner = { key: plugin, plugin, label: plugin, milliseconds: 0, children: [], callIds: [] }; phase.children.push(owner) }
    owner.milliseconds += work.milliseconds
    if (work.operationId) { phase.callIds.push(work.operationId); owner.callIds.push(work.operationId) }
    if (work.operation) {
      let operation = owner.children.find(node => node.key === work.operation)
      if (!operation) { operation = { key: work.operation, operation: work.operation, plugin, milliseconds: 0, children: [], callIds: [] }; owner.children.push(operation) }
      operation.milliseconds += work.milliseconds
      if (work.operationId) operation.callIds.push(work.operationId)
    }
  }
  for (const phase of phases) {
    for (const owner of phase.children) {
      if (owner.children.length === 0) continue
      const remainder = owner.milliseconds - owner.children.reduce((sum, node) => sum + node.milliseconds, 0)
      if (remainder > 0) owner.children.push({ key: 'unrecorded', missing: true, milliseconds: remainder, children: [], callIds: [] })
    }
    if (phase.children.length === 0) continue
    const remainder = phase.milliseconds - phase.children.reduce((sum, node) => sum + node.milliseconds, 0)
    if (remainder > 0) phase.children.push({ key: 'unrecorded', missing: true, milliseconds: remainder, children: [], callIds: [] })
  }
  return phases
}
