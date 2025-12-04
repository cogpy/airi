/**
 * AiriCog AtomSpace
 *
 * Hypergraph-based knowledge representation system inspired by OpenCog.
 * The AtomSpace stores all knowledge as a network of Atoms (Nodes and Links).
 */

import type {
  Atom,
  AtomPattern,
  AtomSpaceConfig,
  AtomSpaceStats,
  AttentionValue,
  Link,
  LinkType,
  Node,
  NodeType,
  SpreadActivationOptions,
  TruthValue,
} from './types';
import {
  boostAttention,
  createDefaultAttentionValue,
  createDefaultTruthValue,
  decayAttention,
} from './types';

/**
 * Generate unique atom ID
 */
function generateAtomId(): string {
  return `atom_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * AtomSpace - The core knowledge representation structure
 */
export class AtomSpace {
  private atoms: Map<string, Atom> = new Map();
  private nodeIndex: Map<string, Set<string>> = new Map(); // type -> ids
  private linkIndex: Map<string, Set<string>> = new Map(); // type -> ids
  private nameIndex: Map<string, string> = new Map(); // name -> id (for nodes)
  private outgoingIndex: Map<string, Set<string>> = new Map(); // atomId -> linkIds containing it
  private config: AtomSpaceConfig;
  private decayInterval?: ReturnType<typeof setInterval>;

  constructor(config: AtomSpaceConfig = {}) {
    this.config = {
      name: config.name ?? 'default',
      enableAttentionDecay: config.enableAttentionDecay ?? false,
      attentionDecayRate: config.attentionDecayRate ?? 0.01,
      maxActiveAtoms: config.maxActiveAtoms ?? 10000,
      forgettingThreshold: config.forgettingThreshold ?? 0.1,
    };

    if (this.config.enableAttentionDecay) {
      this.startAttentionDecay();
    }
  }

  /**
   * Get the AtomSpace name
   */
  getName(): string {
    return this.config.name ?? 'default';
  }

  /**
   * Add a Node to the AtomSpace
   */
  addNode(
    type: NodeType,
    name: string,
    truthValue?: Partial<TruthValue>,
    attentionValue?: Partial<AttentionValue>,
    metadata?: Record<string, unknown>
  ): Node {
    // Check if node with same name already exists
    const existingId = this.nameIndex.get(`${type}:${name}`);
    if (existingId) {
      const existing = this.atoms.get(existingId) as Node;
      // Update truth and attention values
      existing.truthValue = {
        ...existing.truthValue,
        ...truthValue,
      };
      existing.attentionValue = {
        ...existing.attentionValue,
        ...attentionValue,
      };
      existing.lastAccessedAt = Date.now();
      if (metadata) {
        existing.metadata = { ...existing.metadata, ...metadata };
      }
      return existing;
    }

    const now = Date.now();
    const node: Node = {
      id: generateAtomId(),
      kind: 'node',
      type,
      name,
      truthValue: { ...createDefaultTruthValue(), ...truthValue },
      attentionValue: { ...createDefaultAttentionValue(), ...attentionValue },
      createdAt: now,
      lastAccessedAt: now,
      metadata,
    };

    this.atoms.set(node.id, node);
    this.indexNode(node);

    return node;
  }

  /**
   * Add a Link to the AtomSpace
   */
  addLink(
    type: LinkType,
    outgoing: string[],
    truthValue?: Partial<TruthValue>,
    attentionValue?: Partial<AttentionValue>,
    metadata?: Record<string, unknown>
  ): Link {
    // Verify all outgoing atoms exist
    for (const atomId of outgoing) {
      if (!this.atoms.has(atomId)) {
        throw new Error(`Outgoing atom not found: ${atomId}`);
      }
    }

    // Check for existing identical link
    const existingLink = this.findIdenticalLink(type, outgoing);
    if (existingLink) {
      existingLink.truthValue = {
        ...existingLink.truthValue,
        ...truthValue,
      };
      existingLink.attentionValue = {
        ...existingLink.attentionValue,
        ...attentionValue,
      };
      existingLink.lastAccessedAt = Date.now();
      if (metadata) {
        existingLink.metadata = { ...existingLink.metadata, ...metadata };
      }
      return existingLink;
    }

    const now = Date.now();
    const link: Link = {
      id: generateAtomId(),
      kind: 'link',
      type,
      outgoing,
      truthValue: { ...createDefaultTruthValue(), ...truthValue },
      attentionValue: { ...createDefaultAttentionValue(), ...attentionValue },
      createdAt: now,
      lastAccessedAt: now,
      metadata,
    };

    this.atoms.set(link.id, link);
    this.indexLink(link);

    return link;
  }

  /**
   * Get an atom by ID
   */
  getAtom(id: string): Atom | undefined {
    const atom = this.atoms.get(id);
    if (atom) {
      atom.lastAccessedAt = Date.now();
    }
    return atom;
  }

  /**
   * Get a node by type and name
   */
  getNode(type: NodeType, name: string): Node | undefined {
    const id = this.nameIndex.get(`${type}:${name}`);
    if (id) {
      return this.getAtom(id) as Node;
    }
    return undefined;
  }

  /**
   * Get all atoms matching a pattern
   */
  query(pattern: AtomPattern): Atom[] {
    const results: Atom[] = [];

    // If ID is specified, direct lookup
    if (pattern.id) {
      const atom = this.atoms.get(pattern.id);
      if (atom && this.matchesPattern(atom, pattern)) {
        results.push(atom);
      }
      return results;
    }

    // Use indexes for efficient querying
    let candidates: Set<string> | undefined;

    if (pattern.kind === 'node' && pattern.nodeType) {
      const types = Array.isArray(pattern.nodeType) ? pattern.nodeType : [pattern.nodeType];
      candidates = new Set<string>();
      for (const type of types) {
        const typeIndex = this.nodeIndex.get(type);
        if (typeIndex) {
          for (const id of typeIndex) {
            candidates.add(id);
          }
        }
      }
    } else if (pattern.kind === 'link' && pattern.linkType) {
      const types = Array.isArray(pattern.linkType) ? pattern.linkType : [pattern.linkType];
      candidates = new Set<string>();
      for (const type of types) {
        const typeIndex = this.linkIndex.get(type);
        if (typeIndex) {
          for (const id of typeIndex) {
            candidates.add(id);
          }
        }
      }
    }

    // Filter candidates or all atoms
    const idsToCheck = candidates ?? this.atoms.keys();
    for (const id of idsToCheck) {
      const atom = this.atoms.get(id);
      if (atom && this.matchesPattern(atom, pattern)) {
        results.push(atom);
        atom.lastAccessedAt = Date.now();
      }
    }

    return results;
  }

  /**
   * Pattern match with variable binding
   * Returns all atoms matching the pattern with variable bindings
   */
  patternMatch(pattern: AtomPattern): Array<{ atom: Atom; bindings: Map<string, string> }> {
    const results: Array<{ atom: Atom; bindings: Map<string, string> }> = [];

    for (const [id, atom] of this.atoms) {
      const bindings = new Map<string, string>();

      if (this.matchesPatternWithBindings(atom, pattern, bindings)) {
        results.push({ atom, bindings });
        atom.lastAccessedAt = Date.now();
      }
    }

    return results;
  }

  /**
   * Spread activation from a source atom
   */
  spreadActivation(sourceId: string, options: SpreadActivationOptions): Map<string, number> {
    const visited = new Map<string, number>(); // atomId -> activation level
    const queue: Array<{ id: string; level: number; hops: number }> = [
      { id: sourceId, level: options.intensity, hops: 0 },
    ];

    while (queue.length > 0) {
      const { id, level, hops } = queue.shift()!;

      if (visited.has(id)) continue;
      if (hops > options.maxHops) continue;
      if (level < (options.minSti ?? 0.01)) continue;

      visited.set(id, level);

      // Update atom's attention
      const atom = this.atoms.get(id);
      if (atom) {
        atom.attentionValue = boostAttention(atom.attentionValue, level);
        atom.lastAccessedAt = Date.now();
      }

      // Find connected atoms through links
      const connectedLinks = this.outgoingIndex.get(id);
      if (connectedLinks) {
        for (const linkId of connectedLinks) {
          const link = this.atoms.get(linkId) as Link;
          if (!link) continue;

          // Check if we should follow this link type
          if (options.followLinks && !options.followLinks.includes(link.type)) {
            continue;
          }

          // Spread to other atoms in the link
          for (const outgoingId of link.outgoing) {
            if (!visited.has(outgoingId)) {
              queue.push({
                id: outgoingId,
                level: level * options.decay,
                hops: hops + 1,
              });
            }
          }
        }
      }
    }

    return visited;
  }

  /**
   * Get atoms with highest attention (STI)
   */
  getAttentionalFocus(limit: number = 10): Atom[] {
    const atoms = Array.from(this.atoms.values());
    atoms.sort((a, b) => b.attentionValue.sti - a.attentionValue.sti);
    return atoms.slice(0, limit);
  }

  /**
   * Get statistics about the AtomSpace
   */
  getStats(): AtomSpaceStats {
    const stats: AtomSpaceStats = {
      totalAtoms: this.atoms.size,
      nodeCount: 0,
      linkCount: 0,
      nodesByType: {} as Record<NodeType, number>,
      linksByType: {} as Record<LinkType, number>,
      avgStrength: 0,
      avgSti: 0,
    };

    let totalStrength = 0;
    let totalSti = 0;

    for (const atom of this.atoms.values()) {
      totalStrength += atom.truthValue.strength;
      totalSti += atom.attentionValue.sti;

      if (atom.kind === 'node') {
        stats.nodeCount++;
        stats.nodesByType[atom.type] = (stats.nodesByType[atom.type] ?? 0) + 1;
      } else {
        stats.linkCount++;
        stats.linksByType[atom.type] = (stats.linksByType[atom.type] ?? 0) + 1;
      }
    }

    if (stats.totalAtoms > 0) {
      stats.avgStrength = totalStrength / stats.totalAtoms;
      stats.avgSti = totalSti / stats.totalAtoms;
    }

    return stats;
  }

  /**
   * Remove an atom from the AtomSpace
   */
  removeAtom(id: string): boolean {
    const atom = this.atoms.get(id);
    if (!atom) return false;

    // Remove from indexes
    if (atom.kind === 'node') {
      this.unindexNode(atom);
    } else {
      this.unindexLink(atom);
    }

    // Remove from main storage
    this.atoms.delete(id);

    // Remove any links that reference this atom
    const referencingLinks = this.outgoingIndex.get(id);
    if (referencingLinks) {
      for (const linkId of referencingLinks) {
        this.removeAtom(linkId);
      }
    }

    return true;
  }

  /**
   * Export the AtomSpace to a serializable format
   */
  export(): { atoms: Atom[]; config: AtomSpaceConfig } {
    return {
      atoms: Array.from(this.atoms.values()),
      config: this.config,
    };
  }

  /**
   * Import atoms from exported data
   */
  import(data: { atoms: Atom[]; config?: AtomSpaceConfig }): void {
    // First import nodes (they have no dependencies)
    const nodes = data.atoms.filter((a): a is Node => a.kind === 'node');
    const links = data.atoms.filter((a): a is Link => a.kind === 'link');

    for (const node of nodes) {
      this.atoms.set(node.id, node);
      this.indexNode(node);
    }

    for (const link of links) {
      this.atoms.set(link.id, link);
      this.indexLink(link);
    }
  }

  /**
   * Merge another AtomSpace into this one
   */
  merge(other: AtomSpace): void {
    const exported = other.export();
    this.import(exported);
  }

  /**
   * Clear all atoms from the AtomSpace
   */
  clear(): void {
    this.atoms.clear();
    this.nodeIndex.clear();
    this.linkIndex.clear();
    this.nameIndex.clear();
    this.outgoingIndex.clear();
  }

  /**
   * Dispose of the AtomSpace and clean up resources
   */
  dispose(): void {
    if (this.decayInterval) {
      clearInterval(this.decayInterval);
    }
    this.clear();
  }

  // Private helper methods

  private indexNode(node: Node): void {
    // Index by type
    if (!this.nodeIndex.has(node.type)) {
      this.nodeIndex.set(node.type, new Set());
    }
    this.nodeIndex.get(node.type)!.add(node.id);

    // Index by name
    this.nameIndex.set(`${node.type}:${node.name}`, node.id);
  }

  private unindexNode(node: Node): void {
    this.nodeIndex.get(node.type)?.delete(node.id);
    this.nameIndex.delete(`${node.type}:${node.name}`);
  }

  private indexLink(link: Link): void {
    // Index by type
    if (!this.linkIndex.has(link.type)) {
      this.linkIndex.set(link.type, new Set());
    }
    this.linkIndex.get(link.type)!.add(link.id);

    // Index outgoing atoms
    for (const outgoingId of link.outgoing) {
      if (!this.outgoingIndex.has(outgoingId)) {
        this.outgoingIndex.set(outgoingId, new Set());
      }
      this.outgoingIndex.get(outgoingId)!.add(link.id);
    }
  }

  private unindexLink(link: Link): void {
    this.linkIndex.get(link.type)?.delete(link.id);
    for (const outgoingId of link.outgoing) {
      this.outgoingIndex.get(outgoingId)?.delete(link.id);
    }
  }

  private findIdenticalLink(type: LinkType, outgoing: string[]): Link | undefined {
    const typeIndex = this.linkIndex.get(type);
    if (!typeIndex) return undefined;

    for (const linkId of typeIndex) {
      const link = this.atoms.get(linkId) as Link;
      if (
        link.outgoing.length === outgoing.length &&
        link.outgoing.every((id, i) => id === outgoing[i])
      ) {
        return link;
      }
    }

    return undefined;
  }

  private matchesPattern(atom: Atom, pattern: AtomPattern): boolean {
    // Check kind
    if (pattern.kind && atom.kind !== pattern.kind) return false;

    // Check node type
    if (pattern.nodeType && atom.kind === 'node') {
      const types = Array.isArray(pattern.nodeType) ? pattern.nodeType : [pattern.nodeType];
      if (!types.includes(atom.type)) return false;
    }

    // Check link type
    if (pattern.linkType && atom.kind === 'link') {
      const types = Array.isArray(pattern.linkType) ? pattern.linkType : [pattern.linkType];
      if (!types.includes(atom.type)) return false;
    }

    // Check name (with wildcard support)
    if (pattern.name && atom.kind === 'node') {
      if (!this.matchesWildcard(atom.name, pattern.name)) return false;
    }

    // Check truth value
    if (pattern.truthValue) {
      const tv = pattern.truthValue;
      if (tv.minStrength !== undefined && atom.truthValue.strength < tv.minStrength) return false;
      if (tv.maxStrength !== undefined && atom.truthValue.strength > tv.maxStrength) return false;
      if (tv.minConfidence !== undefined && atom.truthValue.confidence < tv.minConfidence)
        return false;
      if (tv.maxConfidence !== undefined && atom.truthValue.confidence > tv.maxConfidence)
        return false;
    }

    // Check attention value
    if (pattern.attentionValue) {
      const av = pattern.attentionValue;
      if (av.minSti !== undefined && atom.attentionValue.sti < av.minSti) return false;
      if (av.maxSti !== undefined && atom.attentionValue.sti > av.maxSti) return false;
      if (av.minLti !== undefined && atom.attentionValue.lti < av.minLti) return false;
      if (av.maxLti !== undefined && atom.attentionValue.lti > av.maxLti) return false;
    }

    // Check outgoing
    if (pattern.outgoing && atom.kind === 'link') {
      if (!pattern.outgoing.every((id, i) => atom.outgoing[i] === id)) return false;
    }

    // Check metadata
    if (pattern.metadata) {
      for (const [key, value] of Object.entries(pattern.metadata)) {
        if (atom.metadata?.[key] !== value) return false;
      }
    }

    return true;
  }

  private matchesPatternWithBindings(
    atom: Atom,
    pattern: AtomPattern,
    bindings: Map<string, string>
  ): boolean {
    // For variable nodes, bind and continue
    if (atom.kind === 'node' && atom.type === 'VariableNode') {
      bindings.set(atom.name, atom.id);
    }

    return this.matchesPattern(atom, pattern);
  }

  private matchesWildcard(text: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(text);
  }

  private startAttentionDecay(): void {
    this.decayInterval = setInterval(() => {
      const decayRate = this.config.attentionDecayRate ?? 0.01;
      for (const atom of this.atoms.values()) {
        atom.attentionValue = decayAttention(atom.attentionValue, decayRate);
      }
    }, 1000); // Decay every second
  }
}

/**
 * Create a new AtomSpace instance
 */
export function createAtomSpace(config?: AtomSpaceConfig): AtomSpace {
  return new AtomSpace(config);
}
