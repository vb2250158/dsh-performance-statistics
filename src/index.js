/** Detailed timings through public Agent events and whole-log projections. */
import { z } from 'zod'
import { runFirstTokenTime } from '@deepseek-ai/dsh-llm'
import { createSessionTimingProjection } from './session-timing.js'
import { installSessionTimingObserver } from './session-timing-observer.js'
import { installPresetRefresh } from './preset-refresh.js'

export const name = 'performance-statistics'
export const inject = ['agents', 'sessionProjections']

/** Register the projection before observing calls; Cordis owns every disposer. */
export async function apply(ctx) {
  await ctx.sessionProjections.register(createSessionTimingProjection(z, runFirstTokenTime))
  installSessionTimingObserver(ctx)
  installPresetRefresh(ctx)
}
