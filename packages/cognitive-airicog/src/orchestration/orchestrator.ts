/**
 * AiriCog Cognitive Orchestrator
 *
 * Multi-agent cognitive state management inspired by OpenCog's CogServer.
 * Manages multiple AtomSpaces, enables knowledge sharing between agents,
 * and coordinates cognitive processing across the system.
 */

import { AtomSpace, createAtomSpace } from '../atomspace/atomspace';
import type { Atom, AtomSpaceConfig, Link, Node, TruthValue } from '../atomspace/types';
import { createECAN, ECAN } from '../attention/ecan';
import { createPLN, PLN } from '../reasoning/pln';

/**
 * Agent state tracking
 */
export interface AgentState {
  /** Agent identifier */
  id: string;
  /** Agent's AtomSpace */
  atomSpace: AtomSpace;
  /** Agent's ECAN instance */
  ecan: ECAN;
  /** Agent's PLN instance */
  pln: PLN;
  /** Cognitive iteration count */
  iterations: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Agent status */
  status: 'active' | 'idle' | 'sleeping' | 'terminated';
  /** Custom metadata */
  metadata: Record<string, unknown>;
}

/**
 * Knowledge sharing request
 */
export interface KnowledgeShareRequest {
  /** Source agent ID */
  sourceAgentId: string;
  /** Target agent ID */
  targetAgentId: string;
  /** Atoms to share (IDs) */
  atomIds: string[];
  /** Trust level for shared knowledge */
  trustLevel: number;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Maximum number of agents */
  maxAgents: number;
  /** Enable automatic garbage collection */
  enableGC: boolean;
  /** GC interval in milliseconds */
  gcInterval: number;
  /** Idle timeout before agent sleeps (ms) */
  idleTimeout: number;
  /** Enable shared knowledge base */
  enableSharedKB: boolean;
}

/**
 * Orchestrator event types
 */
export type OrchestratorEventType =
  | 'agent_created'
  | 'agent_terminated'
  | 'knowledge_shared'
  | 'iteration_complete'
  | 'gc_complete';

/**
 * Orchestrator event
 */
export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * Event listener function
 */
export type OrchestratorEventListener = (event: OrchestratorEvent) => void;

/**
 * Cognitive Orchestrator - manages multiple cognitive agents
 */
export class CognitiveOrchestrator {
  private agents: Map<string, AgentState> = new Map();
  private sharedKB: AtomSpace;
  private config: OrchestratorConfig;
  private gcTimer?: ReturnType<typeof setInterval>;
  private eventListeners: Map<OrchestratorEventType, Set<OrchestratorEventListener>> = new Map();

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      maxAgents: config?.maxAgents ?? 100,
      enableGC: config?.enableGC ?? true,
      gcInterval: config?.gcInterval ?? 60000,
      idleTimeout: config?.idleTimeout ?? 300000,
      enableSharedKB: config?.enableSharedKB ?? true,
    };

    // Create shared knowledge base
    this.sharedKB = createAtomSpace({ name: 'shared_kb' });

    if (this.config.enableGC) {
      this.startGC();
    }
  }

  /**
   * Create a new cognitive agent
   */
  createAgent(
    agentId: string,
    atomSpaceConfig?: AtomSpaceConfig
  ): AgentState {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent already exists: ${agentId}`);
    }

    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Maximum agents reached: ${this.config.maxAgents}`);
    }

    const atomSpace = createAtomSpace({
      name: `agent_${agentId}`,
      ...atomSpaceConfig,
    });

    const ecan = createECAN(atomSpace);
    const pln = createPLN(atomSpace);

    const agentState: AgentState = {
      id: agentId,
      atomSpace,
      ecan,
      pln,
      iterations: 0,
      lastActivity: Date.now(),
      status: 'active',
      metadata: {},
    };

    this.agents.set(agentId, agentState);

    // Create agent node in shared KB
    if (this.config.enableSharedKB) {
      this.sharedKB.addNode('AgentNode', agentId, { strength: 1.0, confidence: 0.95 });
    }

    this.emit({
      type: 'agent_created',
      timestamp: Date.now(),
      data: { agentId },
    });

    return agentState;
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): AgentState | undefined {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastActivity = Date.now();
      if (agent.status === 'sleeping') {
        agent.status = 'active';
      }
    }
    return agent;
  }

  /**
   * Get or create an agent
   */
  getOrCreateAgent(agentId: string): AgentState {
    const existing = this.getAgent(agentId);
    if (existing) return existing;
    return this.createAgent(agentId);
  }

  /**
   * Terminate an agent
   */
  terminateAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.status = 'terminated';
    agent.ecan.dispose();
    agent.atomSpace.dispose();

    this.agents.delete(agentId);

    this.emit({
      type: 'agent_terminated',
      timestamp: Date.now(),
      data: { agentId },
    });

    return true;
  }

  /**
   * Run a cognitive iteration for an agent
   */
  cognitiveStep(agentId: string): void {
    const agent = this.getAgent(agentId);
    if (!agent) return;

    // Run ECAN step
    agent.ecan.step();

    // Update iteration count
    agent.iterations++;
    agent.lastActivity = Date.now();
    agent.status = 'active';

    // Update agent node in shared KB
    if (this.config.enableSharedKB) {
      const agentNode = this.sharedKB.getNode('AgentNode', agentId);
      if (agentNode) {
        agentNode.metadata = {
          ...agentNode.metadata,
          iterations: agent.iterations,
          lastActivity: agent.lastActivity,
        };
      }
    }

    this.emit({
      type: 'iteration_complete',
      timestamp: Date.now(),
      data: { agentId, iterations: agent.iterations },
    });
  }

  /**
   * Share knowledge between agents
   */
  shareKnowledge(request: KnowledgeShareRequest): boolean {
    const source = this.getAgent(request.sourceAgentId);
    const target = this.getAgent(request.targetAgentId);

    if (!source || !target) return false;

    const sharedAtoms: Atom[] = [];

    for (const atomId of request.atomIds) {
      const atom = source.atomSpace.getAtom(atomId);
      if (!atom) continue;

      // Adjust truth value based on trust level
      const adjustedTV: TruthValue = {
        strength: atom.truthValue.strength * request.trustLevel,
        confidence: atom.truthValue.confidence * request.trustLevel,
      };

      if (atom.kind === 'node') {
        const node = atom as Node;
        target.atomSpace.addNode(node.type, node.name, adjustedTV, undefined, {
          ...node.metadata,
          sharedFrom: request.sourceAgentId,
        });
      } else {
        // For links, need to recreate nodes first
        const link = atom as Link;
        const newOutgoing: string[] = [];

        for (const outId of link.outgoing) {
          const outAtom = source.atomSpace.getAtom(outId);
          if (outAtom && outAtom.kind === 'node') {
            const outNode = outAtom as Node;
            const newNode = target.atomSpace.addNode(
              outNode.type,
              outNode.name,
              adjustedTV
            );
            newOutgoing.push(newNode.id);
          }
        }

        if (newOutgoing.length === link.outgoing.length) {
          target.atomSpace.addLink(link.type, newOutgoing, adjustedTV, undefined, {
            ...link.metadata,
            sharedFrom: request.sourceAgentId,
          });
        }
      }

      sharedAtoms.push(atom);
    }

    // Also add to shared KB
    if (this.config.enableSharedKB) {
      for (const atom of sharedAtoms) {
        if (atom.kind === 'node') {
          const node = atom as Node;
          this.sharedKB.addNode(node.type, node.name, atom.truthValue);
        }
      }
    }

    this.emit({
      type: 'knowledge_shared',
      timestamp: Date.now(),
      data: {
        sourceAgentId: request.sourceAgentId,
        targetAgentId: request.targetAgentId,
        atomCount: sharedAtoms.length,
      },
    });

    return true;
  }

  /**
   * Merge agent AtomSpaces
   */
  mergeAgentSpaces(agentIds: string[]): AtomSpace {
    const merged = createAtomSpace({ name: 'merged' });

    for (const agentId of agentIds) {
      const agent = this.getAgent(agentId);
      if (agent) {
        merged.merge(agent.atomSpace);
      }
    }

    return merged;
  }

  /**
   * Get the shared knowledge base
   */
  getSharedKB(): AtomSpace {
    return this.sharedKB;
  }

  /**
   * Query across all agents
   */
  queryAllAgents(
    pattern: Parameters<AtomSpace['query']>[0]
  ): Map<string, Atom[]> {
    const results = new Map<string, Atom[]>();

    for (const [agentId, agent] of this.agents) {
      const agentResults = agent.atomSpace.query(pattern);
      if (agentResults.length > 0) {
        results.set(agentId, agentResults);
      }
    }

    return results;
  }

  /**
   * Get statistics about the orchestrator
   */
  getStats(): {
    agentCount: number;
    activeAgents: number;
    sleepingAgents: number;
    totalIterations: number;
    sharedKBSize: number;
  } {
    let activeAgents = 0;
    let sleepingAgents = 0;
    let totalIterations = 0;

    for (const agent of this.agents.values()) {
      if (agent.status === 'active') activeAgents++;
      if (agent.status === 'sleeping') sleepingAgents++;
      totalIterations += agent.iterations;
    }

    return {
      agentCount: this.agents.size,
      activeAgents,
      sleepingAgents,
      totalIterations,
      sharedKBSize: this.sharedKB.getStats().totalAtoms,
    };
  }

  /**
   * Add event listener
   */
  on(eventType: OrchestratorEventType, listener: OrchestratorEventListener): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);
  }

  /**
   * Remove event listener
   */
  off(eventType: OrchestratorEventType, listener: OrchestratorEventListener): void {
    this.eventListeners.get(eventType)?.delete(listener);
  }

  /**
   * Dispose of the orchestrator
   */
  dispose(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
    }

    for (const [agentId] of this.agents) {
      this.terminateAgent(agentId);
    }

    this.sharedKB.dispose();
  }

  // Private methods

  private emit(event: OrchestratorEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  private startGC(): void {
    this.gcTimer = setInterval(() => {
      this.runGC();
    }, this.config.gcInterval);
  }

  private runGC(): void {
    const now = Date.now();
    let gcCount = 0;

    for (const [agentId, agent] of this.agents) {
      const idleTime = now - agent.lastActivity;

      if (idleTime > this.config.idleTimeout && agent.status === 'active') {
        agent.status = 'sleeping';
        gcCount++;
      }
    }

    if (gcCount > 0) {
      this.emit({
        type: 'gc_complete',
        timestamp: now,
        data: { sleepCount: gcCount },
      });
    }
  }
}

/**
 * Create a new CognitiveOrchestrator
 */
export function createOrchestrator(
  config?: Partial<OrchestratorConfig>
): CognitiveOrchestrator {
  return new CognitiveOrchestrator(config);
}
