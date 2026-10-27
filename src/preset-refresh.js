/** Refresh preset declarations while their existing Agents retain their revisions. */
export async function refreshPresetMeters(ctx) {
  const entries = [...ctx.loader.entries()].filter(entry => entry.options.name === '@deepseek-ai/dsh-agent-preset')
  const refreshed = []
  for (const entry of entries) {
    const id = entry.options.config?.id
    if (typeof id !== 'string' || entry.options.disabled || entry.fiber === undefined) continue
    await ctx.agentPresets.resolve(id)
    await entry.fiber.restart()
    await ctx.agentPresets.resolve(id)
    refreshed.push(id)
  }
  return { refreshed }
}

/** Install an activation route behind Connection's existing authentication and Origin checks.
 * @param ctx Statistics plugin context; Cordis owns the request listener.
 */
export function installPresetRefresh(ctx) {
  ctx.inject(['loader', 'agentPresets'], child => {
    let running
    child.on('connection/request', async (request, response, next) => {
      if (request.url?.split('?')[0] !== '/api/dsh-performance-statistics/refresh-presets') return next()
      const reply = (status, value) => {
        response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(JSON.stringify(value))
      }
      if (request.method !== 'POST') return reply(405, { code: 'method-not-allowed' })
      try {
        if (!running) {
          const task = () => refreshPresetMeters(child)
          running = Promise.resolve().then(() => child.get('hmr')?.runExclusive(task) ?? task())
            .finally(() => { running = undefined })
        }
        reply(200, await running)
      } catch (error) {
        // Lifecycle diagnostics belong to Cordis; the HTTP response contains no configuration or credentials.
        reply(503, { code: 'preset-refresh-failed' })
      }
    })
  })
}
