'use client'

import {
  type AgentAction,
  createAgent,
  registerTools,
} from '@ui-sdk/react/agent'
import { useEffect } from 'react'

import { allowAgentAction } from '@/lib/agent-policy'

const allow = (step: AgentAction) =>
  allowAgentAction(step, window.location.pathname)

// Capture components from their first client render, including hydration.
const agent = typeof window === 'undefined' ? undefined : createAgent({ allow })

export function AgentBridge() {
  useEffect(() => {
    if (agent) return registerTools(agent, { allow })
  }, [])
  return null
}
