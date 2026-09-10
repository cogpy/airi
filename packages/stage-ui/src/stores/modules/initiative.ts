import type { Episode, InitiativeDecision, RaisedTopic } from '@proj-airi/cognitive-airicog/initiative'

import {
  asInitiativeCandidates,
  decideInitiative,
  shouldRetain,
} from '@proj-airi/cognitive-airicog'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * The two moments the character needs to know about, named in its own terms
 * rather than the chat runtime's.
 *
 * Kept structural so the store can be driven by the real chat store, by a
 * different transport, or by a fake in a test, without importing any of them.
 * A host adapts its own hooks onto this:
 *
 * ```ts
 * initiative.bindToChat({
 *   onUserMessage: cb => chat.onBeforeMessageComposed(async message => cb(message)),
 *   onAssistantDone: cb => chat.onAssistantResponseEnd(async message => cb(message)),
 * })
 * ```
 */
export interface InitiativeChatBindings {
  /** Subscribes to the other party speaking. Returns an unsubscribe. */
  onUserMessage: (handler: (message: string) => void) => () => void
  /** Subscribes to the character finishing a reply. Returns an unsubscribe. */
  onAssistantDone: (handler: (message: string) => void) => () => void
}

export interface BindToChatOptions {
  /**
   * Names the subject of a message, so what was said can be remembered as
   * having a subject at all rather than as loose text.
   *
   * Deliberately injected rather than guessed here: identifying a subject needs
   * the model or the AtomSpace, and keyword matching would quietly fill memory
   * with junk topics. Without it the store still tracks when things happened —
   * enough to know a lull has begun, not enough to have something to raise.
   *
   * May be asynchronous, since naming a subject usually means asking a model.
   * The episode is dated when the message arrived rather than when the answer
   * came back, so a slow extractor does not make an old remark look recent.
   */
  deriveTopic?: (message: string) => string | undefined | Promise<string | undefined>
  /** Attention to record for remembered messages. @default 0.6 */
  salience?: number
}

/**
 * Runs the character's own turn-taking: notices when the conversation has gone
 * quiet, decides whether to break the silence, and remembers what it has been
 * told so that later lulls have something to be about.
 *
 * The judgement lives in `@proj-airi/cognitive-airicog`; this store owns the
 * mutable session state those pure functions read, and the clock that drives them.
 */
export const useInitiativeStore = defineStore('initiative', () => {
  const episodes = ref<Episode[]>([])
  const recentlyRaised = ref<RaisedTopic[]>([])
  const lastInteractionAt = ref(Date.now())
  const lastInitiativeAt = ref<number | undefined>(undefined)

  const running = ref(false)
  const handlers = new Set<(decision: Extract<InitiativeDecision, { act: true }>) => void>()

  let timer: ReturnType<typeof setInterval> | undefined

  /**
   * Records that the conversation is live. Resets the silence the character is
   * measuring, so it never speaks over someone.
   */
  function noteInteraction(now: number = Date.now()): void {
    lastInteractionAt.value = now
  }

  /**
   * Remembers something as being about a subject, and counts it as interaction.
   */
  function recordEpisode(
    entry: { topic: string, salience?: number, valence?: number },
    at: number,
  ): void {
    episodes.value.push({
      id: `ep_${at}_${episodes.value.length}`,
      atomId: entry.topic,
      at,
      salience: entry.salience ?? 0.6,
      valence: entry.valence,
    })
  }

  function remember(
    entry: { topic: string, salience?: number, valence?: number },
    now: number = Date.now(),
  ): void {
    noteInteraction(now)
    recordEpisode(entry, now)
  }

  /**
   * Asks whether now is the moment to speak, and records the consequences if so.
   *
   * Raising a subject is noted so the character does not circle back to it, but
   * deliberately does not rehearse the memory. Rehearsal models a memory being
   * reinforced by use, and the character bringing something up unprompted — with
   * no reply yet — is not yet evidence it mattered. Counting it would make every
   * self-raised subject stronger than the ones it beat, so the same topic would
   * win again as soon as its novelty recovered, and the character would circle a
   * single subject. Reinforcement comes from the conversation instead: if this
   * lands, the reply is remembered as a new episode.
   */
  function poll(now: number = Date.now()): InitiativeDecision {
    const decision = decideInitiative({
      now,
      lastInteractionAt: lastInteractionAt.value,
      lastInitiativeAt: lastInitiativeAt.value,
      candidates: asInitiativeCandidates(episodes.value, now),
      recentlyRaised: recentlyRaised.value,
    })

    if (!decision.act)
      return decision

    lastInitiativeAt.value = now
    recentlyRaised.value.push({ atomId: decision.topicAtomId, at: now })

    for (const handler of handlers)
      handler(decision)

    return decision
  }

  /**
   * Drops what has faded past holding, so a long session does not accumulate
   * every passing remark forever.
   */
  function forget(now: number = Date.now()): void {
    episodes.value = episodes.value.filter(episode => shouldRetain(episode, now))
  }

  /**
   * Called when the character decides to speak unprompted. The handler owns
   * saying it — this store never speaks, so a host can route the subject
   * through whatever composes the character's voice.
   */
  function onInitiative(
    handler: (decision: Extract<InitiativeDecision, { act: true }>) => void,
  ): () => void {
    handlers.add(handler)

    return () => handlers.delete(handler)
  }

  /**
   * Starts checking for a lull. The interval is only how often the question is
   * asked; the refractory gap in the decision is what limits how often the
   * character actually speaks.
   */
  function start(intervalMs: number = 5000): void {
    if (running.value)
      return

    running.value = true
    timer = setInterval(() => {
      poll()
      forget()
    }, intervalMs)
  }

  function stop(): void {
    if (timer !== undefined)
      clearInterval(timer)

    timer = undefined
    running.value = false
  }

  /**
   * Watches a conversation: every message resets the silence, and messages
   * whose subject can be named are remembered.
   */
  function bindToChat(bindings: InitiativeChatBindings, options: BindToChatOptions = {}): () => void {
    const observe = (message: string) => {
      // The conversation is live whatever the subject turns out to be, and
      // whether naming it takes a round trip or never resolves at all.
      const at = Date.now()
      noteInteraction(at)

      const derived = options.deriveTopic?.(message)

      if (derived === undefined)
        return

      if (typeof derived === 'string') {
        recordEpisode({ topic: derived, salience: options.salience }, at)
        return
      }

      // A subject that cannot be named is not an error worth surfacing to the
      // conversation; the character simply has one less thing to bring up.
      void derived
        .then((topic) => {
          if (topic !== undefined)
            recordEpisode({ topic, salience: options.salience }, at)
        })
        .catch(() => {})
    }

    const unsubscribes = [
      bindings.onUserMessage(observe),
      bindings.onAssistantDone(observe),
    ]

    return () => {
      for (const unsubscribe of unsubscribes)
        unsubscribe()
    }
  }

  return {
    episodes,
    recentlyRaised,
    lastInteractionAt,
    lastInitiativeAt,
    running,

    noteInteraction,
    remember,
    poll,
    forget,
    onInitiative,
    start,
    stop,
    bindToChat,
  }
})
