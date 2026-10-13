// The band stays out of the way until something is used, then counts skills, subagents and MCP tools and folds open on the button.
import { expect, test } from 'claude-code/testing'

import { bump, classify, treeText } from './usage'

const host = (on: any, typed: any[] = []) => {
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: typed }))
  on('command.run', () => ({ text: 'ran' }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'old', tool: 'Skill', input: { skill: 'humanizer' } }] }] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'engine band' }))
  on('tool.call', (_$: any, e: any) => (e.tool === 'mcp__chrome__navigate' ? { result: {} as any, text: 'boom', isError: true } : { result: {} as any, text: 'ok' }))
}
const band = ($: any, surface: 'terminal' | 'desktop') => $.ui.mount({
  plugin: 'what-skills-am-i-using', surface, component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 120, scroll: { offset: 0, bodyRows: 39 }, view: {} },
})
const cmd = ($: any, command: string, args = '') => $.command.run({ command, args }) as Promise<{ text: string }>
const begin = ($: any) => $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

test('tool calls are sorted into plugins, MCP servers and the rest', () => {
  expect(classify('Skill', { skill: 'ponytail:ponytail-review' })).toEqual({ kind: 'skill', group: 'ponytail', name: 'ponytail-review' })
  expect(classify('Skill', { skill: 'humanizer' })).toEqual({ kind: 'skill', group: 'Your skills', name: 'humanizer' })
  expect(classify('Agent', { prompt: 'x' })).toEqual({ kind: 'agent', group: 'Built-in subagents', name: 'general-purpose' })
  expect(classify('mcp__claude-in-chrome__read_page', {})).toEqual({ kind: 'mcp', group: 'claude-in-chrome', name: 'read_page' })
  expect(classify('Bash', { command: 'ls' })).toBeNull()
  const uses = bump(bump(bump({}, classify('Skill', { skill: 'a:x' })!, { count: 1 }), classify('mcp__srv__t', {})!, { count: 1, errors: 1 }), classify('Skill', { skill: 'a:x' })!, { count: 1 })
  expect(treeText(uses)).toBe('a (plugin)\n└─ skill    x  ×2\nsrv (MCP server)\n└─ MCP tool t  ×1  ✗1')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the band counts what the conversation uses and folds open`, async ($, on) => {
    host(on, [{ name: 'ponytail:ponytail-gain', description: '', source: 'plugin', plugin: 'ponytail' }, { name: 'help', description: '', source: 'builtin' }])
    await begin($)
    const ui = await band($, surface)
    // The transcript's earlier Skill call is already counted, and the engine's own band is kept.
    expect(await ui.find({ type: 'Text', text: /engine band/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^humanizer$/ })).toBeDefined()
    await $.tool.call({ tool: 'Skill', skill: 'ponytail:ponytail' } as any)
    await $.tool.call({ tool: 'Agent', subagent_type: 'Explore', prompt: 'p', description: 'd' } as any)
    await $.tool.call({ tool: 'mcp__chrome__navigate', url: 'x' } as any)
    await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
    await cmd($, 'ponytail:ponytail-gain')
    await cmd($, 'help')
    const { text } = await cmd($, 'what-skills')
    expect(text).toMatch(/^3 skills · 1 subagent · 1 MCP tool\n/)
    expect(text).toMatch(/ponytail \(plugin\)\n├─ skill    ponytail-gain  ×1\n└─ skill    ponytail  ×1/)
    expect(text).toMatch(/chrome \(MCP server\)\n└─ MCP tool navigate  ×1  ✗1/)
    expect(text).not.toMatch(/Bash|help/)
    for (let i = 0; i < 12; i += 1) await $.tool.call({ tool: 'Skill', skill: `big:s${i}` } as any)
    // Folded, the first line is the order of use, oldest to newest, ending at the latest; the counts sit beside the button.
    expect(await ui.find({ type: 'Text', text: /^… → s4 → s5 → s6 → s7 → s8 → s9 → s10 → $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^s11$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^15 skills · 1 subagent · 1 MCP tool$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^MCP server$/ })).toBeUndefined()
    // Nothing is in flight and no turn is running, so nothing claims to be in use; a working turn that used it lights it up.
    expect(await ui.find({ key: 'dots-head' })).toBeUndefined()
    await ui.redraw({ hasSurvey: false, isWorking: true, maxRows: 40, bodyColumns: 120, scroll: { offset: 0, bodyRows: 39 }, view: {} } as any)
    expect(await ui.find({ key: 'dots-head' })).toBeDefined()
    await ui.redraw({ hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 120, scroll: { offset: 0, bodyRows: 39 }, view: {} } as any)
    await ui.press({ key: 'toggle' })
    // Open, the first line stays and the box starts with the whole order.
    expect(await ui.find({ type: 'Text', text: /^… → s4 → s5 → s6 → s7 → s8 → s9 → s10 → $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^order: humanizer → ponytail → Explore → navigate → ponytail-gain → s0 → .* → s10 → / })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Explore$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^navigate \(1 failed\)$/ })).toBeDefined()
    // A long group shows its newest entries and says how many it left out.
    expect(await ui.find({ type: 'Text', text: /^s11$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^s0$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^\+2 more$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /what-skills lists everything/ })).toBeDefined()
    await ui.press({ key: 'toggle' })
    expect(await ui.find({ type: 'Text', text: /^MCP server$/ })).toBeUndefined()
    // The × closes the band without losing the counts, and the command brings it back.
    await ui.press({ key: 'close' })
    expect(await ui.find({ key: 'toggle' })).toBeUndefined()
    expect((await cmd($, 'what-skills')).text).toMatch(/^15 skills/)
    await cmd($, 'what-skills', 'show')
    expect(await ui.find({ key: 'toggle' })).toBeDefined()
    expect((await cmd($, 'what-skills', 'reset')).text).toMatch(/Cleared/)
    expect(await ui.find({ key: 'toggle' })).toBeUndefined()
    await ui.unmount()
  })
}
