/** Select a completed turn from the replayable timing projection, retaining only its records. */
export function sessionStatisticsScope(stats, stages, turn) {
  if (turn === null) return { stats, stages }
  const round = stages?.rounds?.find(row => row.turn === turn)
  if (!round) return { stats: undefined, stages: undefined }
  const selected = { ...round, turns: 1, measuredSpans: 0, incompleteSpans: 0 }
  for (const key of ['calls', 'operations', 'work', 'selections']) selected[key] = (stages[key] ?? []).filter(row => row.turn === turn)
  return { stats: { turnMs: round.closedMs, turns: 1, steps: round.steps }, stages: selected }
}

/** Presentation readings from the host-owned statistics and exclusive timing projections. */
export function sessionStatisticsReading(stats, stages) {
  if (stats === undefined) return { timings: [], phases: [], averageTtft: undefined, responseWait: undefined, speed: undefined, scale: 0 }
  const timings = [
    { key: 'model', milliseconds: stats.llmMs },
    { key: 'tools', milliseconds: stats.toolMs },
    { key: 'compaction', milliseconds: stats.compactionMs },
    { key: 'unrecorded', milliseconds: stats.otherMs },
  ]
  return {
    modelMs: stages === undefined ? stats.llmMs : Object.entries(stages.phases).reduce((sum, [key, ms]) => sum + (['modelWait', 'modelCall', 'modelReasoning', 'modelOutput', 'modelToolPlan', 'auxiliaryModel'].includes(key) ? ms : 0), 0),
    toolMs: stages === undefined ? stats.toolMs : Object.entries(stages.phases).reduce((sum, [key, ms]) => sum + (['toolDispatch', 'toolCall', 'toolCheck', 'toolExecute', 'toolPost', 'resultCommit'].includes(key) ? ms : 0), 0),
    timings,
    phases: stages === undefined ? [] : Object.entries(stages.phases).filter(([, milliseconds]) => milliseconds > 0)
      .map(([key, milliseconds]) => ({ key, milliseconds, ratio: stages.closedMs > 0 ? milliseconds / stages.closedMs : 0 })),
    averageTtft: stats.ttftSteps > 0 ? stats.ttftMs / stats.ttftSteps : undefined,
    responseWait: stages?.firstOutputTurns > 0 ? stages.firstOutputMs / stages.firstOutputTurns : undefined,
    speed: stats.decodeMs > 0 ? stats.decodeTokens * 1000 / stats.decodeMs : undefined,
    scale: Math.max(stats.turnMs ?? 0, ...timings.map(row => row.milliseconds ?? 0)),
  }
}
