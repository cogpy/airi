/**
 * One complete turn of another agent: everything it said between starting to
 * speak and falling silent.
 */
export interface AgentTurn {
  /** The agent's participant id from the speech events. */
  participantId: string
  /** The agent's display name, from its latest utterance that carried one. */
  name?: string
  /**
   * Id of the turn's first utterance. Every window of a stage receives the
   * same events and assembles the same turn, so this id lets only one of them
   * answer it.
   */
  id: string
  /** The turn's utterances, in arrival order, joined with spaces. */
  text: string
}

export interface AgentTurnAssemblerConfig {
  /**
   * Silence after the agent's last speech end before its turn counts as
   * finished. The producer publishes one start and end per sentence it plays,
   * and the next sentence can take a moment to synthesize. Raising it joins
   * sentences across longer synthesis gaps; lowering it answers sooner.
   *
   * @default 1500
   */
  settleMs: number
}

/** The speech events the assembler reads, without the transport envelope. */
export interface AgentSpeechActivityInput {
  participantId: string
  phase: 'start' | 'end'
}

export interface AgentSpeechUtteranceInput {
  id: string
  participantId: string
  name?: string
  turnId?: string
  text: string
}

export interface AgentTurnAssembler {
  activity: (event: AgentSpeechActivityInput) => void
  utterance: (event: AgentSpeechUtteranceInput) => void
  /** Drops every unfinished turn without delivering it, and stops its timers. */
  reset: () => void
}

interface PendingTurn {
  id: string
  name?: string
  turnId?: string
  texts: string[]
  speaking: boolean
  timer?: ReturnType<typeof setTimeout>
}

function createDefaultAgentTurnAssemblerConfig(): AgentTurnAssemblerConfig {
  return { settleMs: 1500 }
}

/**
 * Joins the per-sentence speech events of other agents into whole turns, so
 * the character answers what an agent said once, not once per sentence.
 *
 * State model (per agent, runtime only): an unfinished turn collects
 * utterance texts and tracks whether the agent is speaking. A turn is
 * delivered to `onTurn`:
 *
 * - after `settleMs` with the agent silent and no new event from it, or
 * - at once, when an utterance arrives with a different `turnId` than the
 *   unfinished turn. Both ids must be present: without them only silence ends
 *   a turn.
 *
 * Any event from the agent cancels its pending settle timer. Agents are
 * independent. A turn with no text is never delivered. `reset` drops all
 * unfinished turns, for example when the card stops conversing with agents.
 */
export function createAgentTurnAssembler(
  onTurn: (turn: AgentTurn) => void,
  config: Partial<AgentTurnAssemblerConfig> = {},
): AgentTurnAssembler {
  const { settleMs } = { ...createDefaultAgentTurnAssemblerConfig(), ...config }
  const pending = new Map<string, PendingTurn>()

  function deliver(participantId: string): void {
    const turn = pending.get(participantId)
    if (!turn)
      return

    clearTimeout(turn.timer)
    pending.delete(participantId)
    const text = turn.texts.join(' ').trim()
    if (!text)
      return
    onTurn({ participantId, name: turn.name, id: turn.id, text })
  }

  function scheduleIfSilent(participantId: string, turn: PendingTurn): void {
    clearTimeout(turn.timer)
    turn.timer = undefined
    if (turn.speaking || turn.texts.length === 0)
      return
    turn.timer = setTimeout(deliver, settleMs, participantId)
  }

  function activity(event: AgentSpeechActivityInput): void {
    const turn = pending.get(event.participantId)
    if (!turn) {
      // A start opens a turn that its utterances fill. An end with nothing
      // pending has no text to deliver.
      if (event.phase === 'start')
        pending.set(event.participantId, { id: '', texts: [], speaking: true })
      return
    }

    turn.speaking = event.phase === 'start'
    scheduleIfSilent(event.participantId, turn)
  }

  function utterance(event: AgentSpeechUtteranceInput): void {
    let turn = pending.get(event.participantId)
    if (turn?.turnId && event.turnId && turn.turnId !== event.turnId && turn.texts.length > 0) {
      const speaking = turn.speaking
      deliver(event.participantId)
      turn = { id: '', texts: [], speaking }
      pending.set(event.participantId, turn)
    }
    if (!turn) {
      turn = { id: '', texts: [], speaking: false }
      pending.set(event.participantId, turn)
    }

    if (turn.texts.length === 0) {
      turn.id = event.id
      turn.turnId = event.turnId
    }
    if (event.name)
      turn.name = event.name
    turn.texts.push(event.text)
    scheduleIfSilent(event.participantId, turn)
  }

  function reset(): void {
    for (const turn of pending.values())
      clearTimeout(turn.timer)
    pending.clear()
  }

  return { activity, utterance, reset }
}
