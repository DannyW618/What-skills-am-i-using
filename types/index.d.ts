export type Kind = 'skill' | 'agent' | 'mcp'

// One skill, subagent type or MCP tool the conversation has used; `group` is the plugin or MCP server it belongs to.
export type Use = { group: string; kind: Kind; name: string; count: number; errors: number; running: number; seq: number }

export type Uses = Record<string, Use>

declare module 'claude-code' {
  interface PluginState {
    'what-skills-am-i-using': { uses: Uses; isOpen: boolean; turnMark: number }
  }
}
