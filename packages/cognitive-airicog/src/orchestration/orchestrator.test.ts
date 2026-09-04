import type { CognitiveOrchestrator, OrchestratorEvent } from './orchestrator'

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
      // ROOT CAUSE:
      //
      // terminateAgent() set agent.status = 'terminated' and then deleted the
      // agent from the map, so the write was dead: getAgent() returned
      // undefined and the terminal status could not be observed anywhere. The
      // 'terminated' member of the status union was unreachable in practice.
      //
      //   agent.status = 'terminated';
      //   this.agents.delete(agentId);
      //   return true;
      //
      // Fixed by returning the final AgentState instead of a bare boolean, so
      // the terminal status is reported to the caller without keeping a
      // tombstone that would inflate agentCount and consume the maxAgents
      // budget forever.
      orch.createAgent('bye')

      const terminated = orch.terminateAgent('bye')

      expect(terminated?.status).toBe('terminated')
      expect(orch.getAgent('bye')).toBeUndefined()
    })

    it('reports the terminal status on the agent_terminated event', () => {
      const events: OrchestratorEvent[] = []
      orch.on('agent_terminated', event => events.push(event))
      orch.createAgent('observed')

      orch.terminateAgent('observed')

      expect(events).toHaveLength(1)
      expect(events[0].data.agentId).toBe('observed')
      expect(events[0].data.status).toBe('terminated')
    })

    it('returns undefined for an agent that was never created', () => {
      expect(orch.terminateAgent('never-existed')).toBeUndefined()
    })

    it('frees the id for reuse after termination', () => {
      orch.createAgent('recycled')
      orch.terminateAgent('recycled')

      expect(() => orch.createAgent('recycled')).not.toThrow()
      expect(orch.getAgent('recycled')?.status).toBe('active')
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
