// What a tool call or a typed command says about skill, subagent and MCP use. Pure, so the band, the command and the tests share it.
import type { Kind, Use, Uses } from '../types'

export type Hit = Pick<Use, 'group' | 'kind' | 'name'>

// Groups for things no plugin owns.
export const SKILLS = 'Your skills'
export const AGENTS = 'Built-in subagents'

const NOUN: Record<Kind, string> = { skill: 'skill', agent: 'subagent', mcp: 'MCP tool' }

// `plugin:name` belongs to that plugin; a bare name goes to `fallback`.
export const split = (id: string, fallback: string) => {
  const i = id.indexOf(':')
  return i > 0 ? { group: id.slice(0, i), name: id.slice(i + 1) } : { group: fallback, name: id }
}

export function classify(tool: string, input: Record<string, unknown>): Hit | null {
  if (tool === 'Skill' && typeof input.skill === 'string') return { kind: 'skill', ...split(input.skill.replace(/^\//, ''), SKILLS) }
  if (tool === 'Agent') return { kind: 'agent', ...split(typeof input.subagent_type === 'string' ? input.subagent_type : 'general-purpose', AGENTS) }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  return mcp ? { kind: 'mcp', group: mcp[1]!, name: mcp[2]! } : null
}

// Add to one entry's numbers; a new use (`count`) also makes it the most recent.
export function bump(uses: Uses, hit: Hit, d: { count?: number; errors?: number; running?: number }): Uses {
  const key = `${hit.kind}:${hit.group}/${hit.name}`
  const cur = uses[key] ?? { ...hit, count: 0, errors: 0, running: 0, seq: 0 }
  const seq = d.count ? 1 + Math.max(0, ...Object.values(uses).map(u => u.seq)) : cur.seq
  return { ...uses, [key]: { ...cur, count: cur.count + (d.count ?? 0), errors: cur.errors + (d.errors ?? 0), running: Math.max(0, cur.running + (d.running ?? 0)), seq } }
}

export type Group = { name: string; label: string; items: Use[] }

// The nested list: one group per plugin or MCP server, most recently used first, and the same inside each group.
export function groups(uses: Uses): Group[] {
  const by = new Map<string, Use[]>()
  for (const u of Object.values(uses)) by.set(u.group, [...(by.get(u.group) ?? []), u])
  return [...by]
    .map(([name, items]) => ({
      name,
      label: name === SKILLS || name === AGENTS ? '' : items.every(u => u.kind === 'mcp') ? 'MCP server' : 'plugin',
      items: items.sort((a, b) => b.seq - a.seq),
    }))
    .sort((a, b) => b.items[0]!.seq - a.items[0]!.seq)
}

// Everything used, oldest first, each at the place of its most recent use; the last one is the latest.
export const order = (uses: Uses) => Object.values(uses).sort((a, b) => a.seq - b.seq)

// One entry on a group's row. Inside a plugin, anything that is not a skill says what it is.
export const chip = (u: Use, g: Group) =>
  `${g.label === 'plugin' && u.kind !== 'skill' ? (u.kind === 'agent' ? 'agent ' : 'tool ') : ''}${u.name}${u.count > 1 ? ` ×${u.count}` : ''}${u.errors ? ` (${u.errors} failed)` : ''}`

// "2 skills · 1 subagent · 4 MCP tools": how many different ones, not how many calls.
export const summary = (uses: Uses) =>
  (Object.keys(NOUN) as Kind[])
    .map(k => [Object.values(uses).filter(u => u.kind === k).length, NOUN[k]] as const)
    .filter(([n]) => n > 0)
    .map(([n, noun]) => `${n} ${noun}${n > 1 ? 's' : ''}`)
    .join(' · ')

const branch = (g: Group, i: number) => (i === g.items.length - 1 ? '└─' : '├─')
const itemText = (u: Use) => `${NOUN[u.kind].padEnd(8)} ${u.name}  ×${u.count}`

export const treeText = (uses: Uses) =>
  groups(uses)
    .map(g => [`${g.name}${g.label ? ` (${g.label})` : ''}`, ...g.items.map((u, i) => `${branch(g, i)} ${itemText(u)}${u.errors ? `  ✗${u.errors}` : ''}`)].join('\n'))
    .join('\n')
