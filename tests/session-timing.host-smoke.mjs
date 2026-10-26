/** Keyless production-loop check for scoped model labels and whole-log timing replay. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

if (!process.env.DSH_SOURCE_ROOT) throw new Error('Set DSH_SOURCE_ROOT to the built DSH checkout')
const root = resolve(process.env.DSH_SOURCE_ROOT)
const native = (group, name) => pathToFileURL(join(root, 'packages', group, name, 'lib/index.js')).href
const local = name => new URL(`../src/${name}.js`, import.meta.url).href
const { boot } = await import(native('boot', 'app-boot'))
const { SessionId } = await import(native('core', 'session'))
const { createUserMessage } = await import(native('llm', 'llm'))
const zod = pathToFileURL(createRequire(join(root, 'packages/session/session-projection/package.json')).resolve('zod')).href
const dir = await mkdtemp(join(tmpdir(), 'dsh-session-timing-'))
let ctx
try {
  const entry = (await readFile(new URL('../src/index.js', import.meta.url), 'utf8'))
    .replace("from 'zod'", `from ${JSON.stringify(zod)}`)
    .replace("from '@deepseek-ai/dsh-llm'", `from ${JSON.stringify(native('llm', 'llm'))}`)
    .replace("from './session-timing.js'", `from ${JSON.stringify(local('session-timing'))}`)
    .replace("from './session-timing-observer.js'", `from ${JSON.stringify(local('session-timing-observer'))}`)
  await writeFile(join(dir, 'entry.mjs'), entry)
  await writeFile(join(dir, 'fixture.mjs'), `
import { LlmAdapter, runFirstTokenTime } from ${JSON.stringify(native('llm', 'llm'))};
import { z } from ${JSON.stringify(zod)};
import { apply as installPerformanceStatistics } from './entry.mjs';
export const inject = ['agentLoop', 'agents', 'llm', 'sessionProjections'];
export async function apply(ctx) {
  await installPerformanceStatistics(ctx);
  const requests = [];
  ctx.provide('timingFixture', { requests });
  class Adapter extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model, context: { contextWindow: 32000, maxTokens: 4096 } }; }
    async *stream(options) {
      requests.push(options);
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'ok' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.effect(() => ctx.llm.registerAdapter(['fixture'], new Adapter()));
  ctx.on('agent/pre-step', async ({ signal }, next) => {
    const decision = await next();
    for (const operation of ['skill-catalog', 'before']) {
      const metadata = { plugin: 'fixture-gate', operation, rules: [{ id: operation, title: operation }] };
      const options = { provider: 'fixture', model: 'judge', messages: [], signal, maxTokens: 32 };
      for await (const chunk of ctx.get('chatStageTiming').stream(metadata, () => ctx.llm.stream(options))) void chunk;
    }
    return decision;
  }, { global: true, prepend: true });
}
`)
  await writeFile(join(dir, 'caller.mjs'), `
export const inject = ['agentLoop'];
export function apply(ctx) { ctx.provide('timingCaller', { create: id => ctx.agentLoop.create(id, { provider: 'fixture', model: 'main', maxTokens: 128 }) }); }
`)
  const entries = [['llm', 'llm'], ['core', 'session'], ['session', 'session-projection'], ['core', 'system-prompt'], ['core', 'tools'], ['core', 'tool-executor-native'], ['core', 'agent'], ['core', 'agent-loop']]
    .map(([group, name]) => ({ id: name, name: native(group, name), ...(name === 'agent-loop' ? { config: { agents: [] } } : {}) }))
  entries.push({ id: 'timing-fixture', name: pathToFileURL(join(dir, 'fixture.mjs')).href })
  entries.push({ id: 'independent-api-caller', name: pathToFileURL(join(dir, 'caller.mjs')).href })
  await writeFile(join(dir, 'cordis.yml'), JSON.stringify(entries))
  ctx = await boot('session-timing-test', join(dir, 'cordis.yml'))
  const agent = await ctx.timingCaller.create(SessionId('session-timing-smoke'))
  const idle = new Promise((done, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('Agent did not become idle')) }, 10000)
    const off = ctx.on('agent/status', ({ agent: subject, status }) => { if (subject === agent && status === 'idle') { clearTimeout(timer); off(); done() } })
  })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'fixture input' }], source: { kind: 'user' } }))
  await idle
  const peer = await import(native('core', 'session') + '?duplicate-installed-peer')
  assert.throws(() => peer.appendPluginRecord(agent.session, 'plugin:fixture/timing', { test: true }), /private|class/i)
  const state = ctx.sessionProjections.stateOf(agent.session, 'chatSessionTiming')
  const auxiliary = state.view.calls.filter(call => call.role === 'auxiliary')
  if (auxiliary.length !== 2) console.log(JSON.stringify({ state, records: agent.session.snapshotEvents().map(event => ({ type: event.type, data: event.data })) }))
  assert.equal(auxiliary.length, 2)
  assert.deepEqual(auxiliary.map(call => call.operation), ['skill-catalog', 'before'])
  assert.ok(auxiliary.every(call => call.plugin === 'fixture-gate' && call.firstTokenTime !== undefined && !call.failed))
  assert.equal(state.view.calls.filter(call => call.role === 'main').length, 1)
  assert.equal(ctx.timingFixture.requests.length, 3)
  assert.ok(ctx.timingFixture.requests.every(options => !('operation' in options) && !('rules' in options)))
  assert.equal(Object.values(state.view.phases).reduce((sum, value) => sum + value, 0), state.view.closedMs)
  assert.ok(state.view.measuredSpans > 0)
  console.log(JSON.stringify({ passed: true, measuredSpans: state.view.measuredSpans, calls: state.view.calls.length, phases: state.view.phases }))
} finally {
  await ctx?.fiber.dispose()
  await rm(dir, { recursive: true, force: true })
}
