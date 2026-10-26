/** Presentation readings from the host-owned, whole-log statistics projection. */
export function sessionStatisticsReading(stats, stages) {
  if (stats === undefined) return { timings: [], phases: [], averageTtft: undefined, responseWait: undefined, speed: undefined, scale: 0 }
  const timings = [
    { key: 'model', milliseconds: stats.llmMs },
    { key: 'tools', milliseconds: stats.toolMs },
    { key: 'compaction', milliseconds: stats.compactionMs },
    { key: 'unrecorded', milliseconds: stats.otherMs },
  ]
  return {
    timings,
    phases: stages === undefined ? [] : Object.entries(stages.phases).filter(([, milliseconds]) => milliseconds > 0)
      .map(([key, milliseconds]) => ({ key, milliseconds, ratio: stages.closedMs > 0 ? milliseconds / stages.closedMs : 0 })),
    averageTtft: stats.ttftSteps > 0 ? stats.ttftMs / stats.ttftSteps : undefined,
    responseWait: stages?.firstOutputTurns > 0 ? stages.firstOutputMs / stages.firstOutputTurns : undefined,
    speed: stats.decodeMs > 0 ? stats.decodeTokens * 1000 / stats.decodeMs : undefined,
    scale: Math.max(stats.turnMs ?? 0, ...timings.map(row => row.milliseconds ?? 0)),
  }
}
