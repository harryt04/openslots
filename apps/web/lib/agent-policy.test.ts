import type { AgentAction } from '@ui-sdk/react/agent'
import { describe, expect, it } from 'vitest'

import { allowAgentAction } from './agent-policy'

const edit: AgentAction = {
  ref: 'c1',
  component: 'input',
  action: 'setValue',
  label: 'Search customers',
  args: ['sample'],
}

describe('WebMCP action policy', () => {
  it('allows unprotected field edits and local tab navigation', () => {
    expect(allowAgentAction(edit, '/')).toBe(true)
    expect(
      allowAgentAction(
        { ...edit, component: 'tabs', action: 'setValue', label: 'Schedules' },
        '/availability',
      ),
    ).toBe(true)
  })

  it.each(['Book', 'Payment', 'Delete', 'Sign in', 'Account', 'Settings', ''])(
    'reserves marked actions for a person (%s)',
    (confirm) =>
      expect(allowAgentAction({ ...edit, confirm }, '/')).toBe(false),
  )

  it('denies unknown controls, commands and malformed arguments', () => {
    expect(allowAgentAction(edit, '/settings')).toBe(false)
    for (const change of [
      { component: 'button', action: 'press' },
      { component: 'new-control' },
      { label: 'Unknown' },
      { action: 'submit' },
      { args: [true] },
      { args: ['a', 'b'] },
      { args: ['x'.repeat(201)] },
    ]) {
      expect(allowAgentAction({ ...edit, ...change }, '/')).toBe(false)
    }
  })
})
