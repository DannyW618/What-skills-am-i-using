// What-skills-am-i-using: counts skill, subagent and MCP tool use into $.state and draws it as a band above the prompt.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { SKILLS, bump, chip, classify, groups, order, split, summary, treeText } from './usage'
import type { Hit } from './usage'

const NAME = 'what-skills-am-i-using'
const CMD = 'what-skills'
// The open band shows the most recent groups and entries; /what-skills prints the rest.
const MAX_GROUPS = 8
const MAX_ITEMS = 10
const MAX_ORDER = 8
const MAX_HISTORY = 30
const usesAtom = atom({ plugin: 'what-skills-am-i-using', key: 'uses' } as const, {})
const openAtom = atom({ plugin: 'what-skills-am-i-using', key: 'isOpen' } as const, false)
// The newest `seq` when the running turn began: anything above it was used in this turn.
const markAtom = atom({ plugin: 'what-skills-am-i-using', key: 'turnMark' } as const, 0)

// An observer must never break the event it watches: log the failure and carry on.
const safe = <T,>($: EngineInterface, p: Promise<T>) =>
  p.catch(err => { $.ui.log(`${NAME}: ${String(err)}`, { to: 'debug' }); return undefined })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await safe($, (async () => {
      await $.command.register({ name: 'what-skills', description: 'List the skills, plugins, subagents and MCP tools this conversation has used', argumentHint: '[reset]' })
      // A resumed conversation (or a mod installed mid-way) starts from what the transcript already holds.
      // shortcut: only the main conversation's rows are replayed, upgrade if past subagents' own calls matter after a resume.
      const rows = await $.session.messages()
      await update($, usesAtom, cur => {
        if (Object.keys(cur).length) return Object.fromEntries(Object.entries(cur).map(([k, u]) => [k, { ...u, running: 0 }]))
        let uses = cur
        for (const row of rows) for (const t of row.toolUses) {
          const hit = classify(t.tool, t.input)
          if (hit) uses = bump(uses, hit, { count: 1 })
        }
        return uses
      })
    })())
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await safe($, (async () => {
      const seq = Math.max(0, ...Object.values(await read($, usesAtom)).map(u => u.seq))
      await update($, markAtom, () => seq)
    })())
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const hit = classify(String(e.tool), e as unknown as Record<string, unknown>)
    if (!hit) return next(e)
    await safe($, update($, usesAtom, u => bump(u, hit, { count: 1, running: 1 })))
    let failed = true
    try {
      const r = await next(e)
      failed = !!r.isError
      return r
    } finally {
      await safe($, update($, usesAtom, u => bump(u, hit, { running: -1, errors: failed ? 1 : 0 })))
    }
  }).catch(($, e, next) => next(e))

  // A skill the person types as /name never goes through the Skill tool.
  on('command.run', async ($, e, next) => {
    if (e.command !== CMD) {
      await safe($, (async () => {
        const info = (await $.command.list()).find(c => c.name === e.command)
        if (!info || info.source === 'builtin') return
        const hit: Hit = { kind: 'skill', ...split(e.command, info.plugin ?? SKILLS) }
        await update($, usesAtom, u => bump(u, hit, { count: 1 }))
      })())
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'what-skills' }, async ($, e) => {
    if (e.args.trim() === 'reset') {
      await update($, usesAtom, () => ({}))
      return { text: 'Cleared. Counting starts again from here.' }
    }
    const uses = await read($, usesAtom)
    return { text: Object.keys(uses).length ? `${summary(uses)}\n\n${treeText(uses)}` : 'No skill, plugin, subagent or MCP tool has been used in this conversation yet.' }
  })

  // The band: the order of use ending at the latest, counts at the right; open, the longer order and one row per plugin or MCP server. Other mods' bands stay above it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const uses = await read($, usesAtom)
    const below = await next(e)
    if (e.props.hasSurvey || !Object.keys(uses).length) return below
    const isOpen = await read($, openAtom)
    const E = $.ui.resolve(e)
    const { Box, Button, Text } = E
    // Motion needs a surface with client modules (terminal, desktop); elsewhere the dots stand still.
    const Client = 'Client' in E ? E.Client : undefined
    const dots = (key: string) => (Client ? <Client key={key} module="./motion.tsx" props={{}} /> : <Text color="claude">:.</Text>)
    const all = order(uses)
    const last = all[all.length - 1]!
    // Lit only while it is true: a call is in flight, or the latest was used in the turn still running. The mod cannot see more than that.
    const isActive = all.some(u => u.running) || (e.props.isWorking && last.seq > (await read($, markAtom)))
    const counts = summary(uses)
    // The chain ends at the latest use and reaches back as far as the line has room for.
    const room = e.props.bodyColumns - counts.length - 16
    const shown = [last]
    for (let i = all.length - 2, used = last.name.length + 4; i >= 0 && shown.length < MAX_ORDER; i -= 1) {
      used += all[i]!.name.length + 3
      if (used > room) break
      shown.unshift(all[i]!)
    }
    const gs = groups(uses)
    const wide = Math.min(24, Math.max(...gs.map(g => g.name.length)))
    return (
      <Box flexDirection="column">
        {below}
        <Box justifyContent="space-between">
          <Box>
            {/* The mod's own mark: two triangles in two tones, the shape of assets/logo.svg. */}
            <Text><Text color="claude">◢</Text><Text bold>◤</Text> </Text>
            <Text dimColor>{`${shown.length < all.length ? '… → ' : ''}${shown.slice(0, -1).map(u => `${u.name} → `).join('')}`}</Text>
            <Text bold={isActive} color={isActive ? 'claude' : undefined} dimColor={!isActive}>{last.name}</Text>
            {isActive && <Text> </Text>}
            {isActive && dots('dots-head')}
          </Box>
          <Box gap={2} flexShrink={0}>
            <Text dimColor>{counts}</Text>
            <Button key="toggle" label={isOpen ? 'Hide' : 'Show'} onPress={() => update($, openAtom, was => !was)} />
          </Box>
        </Box>
        {isOpen && (
          <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Text dimColor>
              {`order: ${all.length > MAX_HISTORY ? '… → ' : ''}${all.slice(-MAX_HISTORY, -1).map(u => `${u.name} → `).join('')}`}
              {isActive ? <Text bold color="claude" dimColor={false}>{last.name}</Text> : last.name}
            </Text>
            {gs.slice(0, MAX_GROUPS).map(g => (
              <Box>
                <Box width={wide + 12} flexShrink={0}>
                  <Text bold>{g.name.slice(0, wide).padEnd(wide + 1)}</Text>
                  <Text dimColor>{g.label}</Text>
                </Box>
                <Box flexWrap="wrap" columnGap={2}>
                  {g.items.slice(0, MAX_ITEMS).map(u => (
                    <Box gap={1}>
                      {u.running ? dots(`dots-${u.kind}-${g.name}-${u.name}`) : <Text color={u.errors ? 'error' : 'success'}>{u.errors ? '✗' : '✓'}</Text>}
                      <Text bold={isActive && u === last}>{chip(u, g)}</Text>
                    </Box>
                  ))}
                  {g.items.length > MAX_ITEMS && <Text dimColor>{`+${g.items.length - MAX_ITEMS} more`}</Text>}
                </Box>
              </Box>
            ))}
            {(gs.length > MAX_GROUPS || gs.some(g => g.items.length > MAX_ITEMS)) && (
              <Text dimColor>{`${gs.length > MAX_GROUPS ? `+${gs.length - MAX_GROUPS} more groups · ` : ''}/what-skills lists everything`}</Text>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
