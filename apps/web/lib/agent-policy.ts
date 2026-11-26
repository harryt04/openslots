import type { AgentAction } from '@ui-sdk/react/agent'

export function allowAgentAction(step: AgentAction, pathname: string) {
  if (step.confirm !== undefined || step.args.length !== 1) return false
  const [value] = step.args
  if (typeof value !== 'string') return false

  switch (step.component) {
    case 'tabs':
      if (step.action !== 'setValue') return false
      return (
        (pathname === '/availability' && step.label === 'Schedules') ||
        (pathname === '/dev/tokens' && step.label === 'Booking status')
      )
    case 'input':
      if (step.action !== 'setValue' || value.length > 200) return false
      return (
        (pathname === '/' && step.label === 'Search customers') ||
        (pathname === '/dev/tokens' && step.label === 'Name')
      )
    default:
      return false
  }
}
