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
    let parent = owner
    for (const key of work.operationPath ?? (work.operation ? [work.operation] : [])) {
      let operation = parent.children.find(node => node.key === key)
      if (!operation) { operation = { key, operation: key, plugin, milliseconds: 0, children: [], callIds: [] }; parent.children.push(operation) }
      operation.milliseconds += work.milliseconds
      if (work.operationId) operation.callIds.push(work.operationId)
      parent = operation
    }
  }
  const complete = node => {
    if (node.children.length === 0) return
    for (const child of node.children) complete(child)
    const remainder = node.milliseconds - node.children.reduce((sum, child) => sum + child.milliseconds, 0)
    if (remainder > 0) node.children.push({ key: 'unrecorded', missing: true, milliseconds: remainder, children: [], callIds: node.callIds })
  }
  for (const phase of phases) complete(phase)
  return phases
}
