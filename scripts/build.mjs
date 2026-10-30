/** Build a dependency-external DSH client module without bundling another React. */
import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const sources = ['session-breakdown.js', 'session-statistics.js', 'session-statistics-client.js', 'client.js']
const parts = await Promise.all(sources.map(async file => (await readFile(new URL('src/' + file, root), 'utf8')).replace(/^import [^\r\n]*\r?\n/gmu, '').replace(/^export /gmu, '')))
await writeFile(new URL('lib/client.js', root), `window.__ModuleLoader__.load({
  id: 'dsh-performance-statistics',
  factory: (require) => {
    const React = require('react')
    const { Modal, Pill, Button, Menu, IconGaugeOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
${parts.join('\n')}
    return { inject, apply }
  },
})\n`)
