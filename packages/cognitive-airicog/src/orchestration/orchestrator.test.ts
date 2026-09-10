import type {
  CognitiveOrchestrator,
} from './orchestrator'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  createOrchestrator,
} from './orchestrator'

describe('cognitiveOrchestrator', () => {
  let orch: CognitiveOrchestrator

  beforeEach(() => {
    orch = createOrchestrator({ enableGC: false, maxAgents: 5 })
  })

  it('creates an orchestrator instance', () => {
    expect(orch).toBeDefined()
  })

  describe('createAgent', () => {
    it('creates a new agent with the given ID', () => {
      const agent = orch.createAgent('agent-1')
      expect(agent.id).toBe('agent-1')
      expect(agent.status).toBe('active')
    })

    it('throws when creating duplicate agent IDs', () => {
      orch.createAgent('dup')
      expect(() => orch.createAgent('dup')).toThrow()
    })

    it('throws when agent limit is reached', () => {
      for (let i = 0; i < 5; i++) {
        orch.createAgent(`a${i}`)
      }
      expect(() => orch.createAgent('overflow')).toThrow()
    })
  })

  describe('getAgent', () => {
    it('returns the agent by ID', () => {
      orch.createAgent('find-me')
      const agent = orch.getAgent('find-me')
      expect(agent).not.toBeUndefined()
      expect(agent!.id).toBe('find-me')
    })

    it('returns undefined for unknown agent', () => {
      expect(orch.getAgent('ghost')).toBeUndefined()
    })
  })

  describe('terminateAgent', () => {
    it('marks the agent as terminated', () => {
      orch.createAgent('bye')
      orch.terminateAgent('bye')
      expect(orch.getAgent('bye')?.status).toBe('terminated')
    })
  })

  describe('getStats', () => {
    it('returns stats reflecting created agents', () => {
      orch.createAgent('s1')
      orch.createAgent('s2')
      const stats = orch.getStats()
      expect(stats.agentCount).toBe(2)
      expect(stats.activeAgents).toBe(2)
    })
  })

  describe('cognitiveStep', () => {
    it('increments iterations for active agents', () => {
      orch.createAgent('stepper')
      orch.cognitiveStep('stepper')
      const agent = orch.getAgent('stepper')
      expect(agent!.iterations).toBe(1)
    })
  })

  describe('event listeners', () => {
    it('fires agent_created listener on createAgent', () => {
      let fired = false
      orch.on('agent_created', () => {
        fired = true
      })
      orch.createAgent('evt')
      expect(fired).toBe(true)
    })

    it('removes listener with off()', () => {
      let count = 0
      const listener = () => {
        count++
      }
      orch.on('agent_created', listener)
      orch.createAgent('off1')
      orch.off('agent_created', listener)
      orch.createAgent('off2')
      expect(count).toBe(1)
    })
  })

  describe('dispose', () => {
    it('disposes cleanly', () => {
      orch.createAgent('disposable')
      expect(() => orch.dispose()).not.toThrow()
    })
  })
})
