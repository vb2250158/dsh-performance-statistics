/** Install the statistics dialog through the public composer slot. */
import { installSessionStatistics } from './session-statistics-client.js'
import { installStartupStatistics } from './startup-client.js'
export const inject = ['slots', 'locale']
export function apply(ctx) { installSessionStatistics(ctx); installStartupStatistics(ctx) }
