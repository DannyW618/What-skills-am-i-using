// Client surface module for the band's one moving part: dots that build up while Claude is working.
import type { ClientModule } from 'claude-code'

const FRAMES = ['.  ', ':  ', ':. ', ':: ', '::.', ':::']

const Motion: ClientModule<{}, number> = (_p, s) => {
  const { Text } = s.elements
  if (s.state === undefined) {
    s.every(220, () => s.setState((s.state ?? 0) + 1))
    s.setState(0)
  }
  return <Text bold color="claude">{FRAMES[(s.state ?? 0) % FRAMES.length]}</Text>
}

export default Motion
