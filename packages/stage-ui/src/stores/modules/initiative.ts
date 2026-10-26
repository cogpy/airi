import type { TopicAttention } from '@proj-airi/cognitive-airicog/attention'
import type { InitiativeDecision, RaisedTopic } from '@proj-airi/cognitive-airicog/initiative'
import type { Episode } from '@proj-airi/cognitive-airicog/memory'
import type { Temperament, TemperamentSnapshot } from '@proj-airi/cognitive-airicog/ontogenesis'

import type { AiriExtension } from '../../types/airiCard'

import {
  asInitiativeCandidates,
  createDefaultInitiativeConfig,
  createOrchestrator,
  createTemperament,
  createTopicAttention,
  decideInitiative,
  mergeCandidates,
  shouldRetain,
  topicAttentionEcanConfig,
} from '@proj-airi/cognitive-airicog'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** The character whose state the store holds before a host names one. */
const DEFAULT_CHARACTER = 'default'

/**
 * How long after she speaks up an answer counts as a reply to her. Later, she
 * counts as ignored.
 */
const ANSWER_WINDOW_MS = 120_000

/** What she learned about speaking up, for display. */
export interface LearnedTemperament {
  /** Multiplier on the card threshold. Below `1` speaks more readily. */
  thresholdFactor: number
  /** Running rate at which she was answered, `0` to `1`. */
  answerRate: number
}

/** How a character card configures speaking up. */
export type AiriInitiativeSettings = NonNullable<AiriExtension['modules']['initiative']>

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
  /**
   * When she last reflected, or `undefined` if never this session. Runtime
   * state only, like `episodes`: both start empty in a new session.
   */
  const lastReflectionAt = ref<number>()
  const recentlyRaised = ref<RaisedTopic[]>([])
  const lastInteractionAt = ref(Date.now())
  const lastInitiativeAt = ref<number | undefined>(undefined)

  const running = ref(false)
  const handlers = new Set<(decision: Extract<InitiativeDecision, { act: true }>) => void>()

  let timer: ReturnType<typeof setInterval> | undefined

  /**
   * One cognitive agent for each character: its AtomSpace and attention
   * economy hold what is on that character's mind. Topics that come up
   * together become associated, so mentioning one brings the other to mind.
   * Runtime state, like `episodes`. Not reactive: it is read only when she
   * decides whether to speak.
   */
  const orchestrator = createOrchestrator({ enableGC: false })
  const minds = new Map<string, TopicAttention>()
  const activeCharacterId = ref(DEFAULT_CHARACTER)

  function mindOf(characterId: string): TopicAttention {
    let found = minds.get(characterId)
    if (!found) {
      found = createTopicAttention({}, orchestrator.getOrCreateAgent(characterId, topicAttentionEcanConfig()))
      minds.set(characterId, found)
    }
    return found
  }

  let mind = mindOf(DEFAULT_CHARACTER)

  /** Runtime state of the characters that are not active. */
  const parked = new Map<string, {
    episodes: Episode[]
    lastReflectionAt: number | undefined
    recentlyRaised: RaisedTopic[]
    lastInitiativeAt: number | undefined
  }>()

  /**
   * What each character learned about speaking up, kept on this device. Only
   * a card with `adapt` reads or changes it.
   */
  const temperamentSnapshots = useLocalStorage<Record<string, TemperamentSnapshot>>('settings/initiative/temperaments', {})
  const temperaments = new Map<string, Temperament>()
  /** When she last spoke up, while no answer or silence has settled it. */
  let awaitingAnswerSince: number | undefined

  /**
   * How the active character card configures speaking up, with the module's own
   * defaults where the card is silent.
   *
   * Read through a getter the host supplies rather than by reaching for the card
   * store, so this store stays testable and the card remains the single place a
   * character's behaviour is declared.
   */
  const cardSettings = ref<AiriInitiativeSettings>({})

  function configure(settings: AiriInitiativeSettings): void {
    cardSettings.value = settings
  }

  /**
   * Makes `characterId` the character whose memory, mind, and temperament the
   * store uses. The previous character's state is kept and comes back when it
   * is active again. An answer still awaited is dropped.
   */
  function useCharacter(characterId: string): void {
    if (characterId === activeCharacterId.value)
      return

    parked.set(activeCharacterId.value, {
      episodes: episodes.value,
      lastReflectionAt: lastReflectionAt.value,
      recentlyRaised: recentlyRaised.value,
      lastInitiativeAt: lastInitiativeAt.value,
    })
    const next = parked.get(characterId)
    parked.delete(characterId)
    episodes.value = next?.episodes ?? []
    lastReflectionAt.value = next?.lastReflectionAt
    recentlyRaised.value = next?.recentlyRaised ?? []
    lastInitiativeAt.value = next?.lastInitiativeAt
    awaitingAnswerSince = undefined
    activeCharacterId.value = characterId
    mind = mindOf(characterId)
  }

  function activeTemperament(): Temperament | undefined {
    if (!cardSettings.value.adapt)
      return undefined
    const characterId = activeCharacterId.value
    let found = temperaments.get(characterId)
    if (!found) {
      found = createTemperament(temperamentSnapshots.value[characterId])
      temperaments.set(characterId, found)
    }
    return found
  }

  function settleAnswer(answered: boolean): void {
    awaitingAnswerSince = undefined
    const temperament = activeTemperament()
    if (!temperament)
      return
    temperament.recordOutcome(answered)
    temperamentSnapshots.value = { ...temperamentSnapshots.value, [activeCharacterId.value]: temperament.snapshot() }
  }

  /**
   * Records that the user spoke. Within two minutes of her speaking up, it
   * counts as an answer to her.
   */
  function noteUserTurn(at: number = Date.now(), characterId?: string): void {
    // A turn in another character's session does not answer this one.
    if (characterId !== undefined && characterId !== activeCharacterId.value)
      return
    if (awaitingAnswerSince !== undefined && at >= awaitingAnswerSince)
      settleAnswer(at - awaitingAnswerSince <= ANSWER_WINDOW_MS)
  }

  /** What `characterId` learned about speaking up, or `undefined` before any outcome. */
  function learnedTemperamentOf(characterId: string): LearnedTemperament | undefined {
    const snapshot = temperamentSnapshots.value[characterId]
    if (!snapshot)
      return undefined
    const temperament = createTemperament(snapshot)
    return { thresholdFactor: temperament.thresholdFactor(), answerRate: temperament.answerRate() }
  }

  const learnedTemperament = computed(() => learnedTemperamentOf(activeCharacterId.value))

  /**
   * Whether the character is allowed to speak during a lull at all.
   *
   * Off unless a card turns it on, matching how artistry gates its autonomy:
   * this changes what the character does unprompted, so it is a decision the
   * card makes, never a default.
   */
  function isEnabled(): boolean {
    return cardSettings.value.enabled ?? false
  }

  /**
   * Records that the conversation is live. Resets the silence the character is
   * measuring, so it never speaks over someone.
   */
  function noteInteraction(now: number = Date.now()): void {
    lastInteractionAt.value = now
  }

  /**
   * Remembers something as being about a subject without counting it as
   * interaction. For subjects named after the fact: `at` is when the remark
   * was made, and replaying it as interaction would move the lull's start back.
   */
  /**
   * The episodes and reflection time of `characterId`, active or not. Without
   * an id, the active character's.
   */
  function memoryOf(characterId?: string): { episodes: Episode[], lastReflectionAt: number | undefined, setLastReflectionAt: (at: number) => void } {
    if (characterId === undefined || characterId === activeCharacterId.value) {
      return {
        episodes: episodes.value,
        lastReflectionAt: lastReflectionAt.value,
        setLastReflectionAt: (at) => {
          lastReflectionAt.value = at
        },
      }
    }
    let state = parked.get(characterId)
    if (!state) {
      state = { episodes: [], lastReflectionAt: undefined, recentlyRaised: [], lastInitiativeAt: undefined }
      parked.set(characterId, state)
    }
    const parkedState = state
    return {
      episodes: parkedState.episodes,
      lastReflectionAt: parkedState.lastReflectionAt,
      setLastReflectionAt: (at) => {
        parkedState.lastReflectionAt = at
      },
    }
  }

  /** The episodes of `characterId`, or of the active character without an id. */
  function episodesOf(characterId?: string): readonly Episode[] {
    return memoryOf(characterId).episodes
  }

  /** When `characterId` last reflected, or the active character without an id. */
  function lastReflectionAtOf(characterId?: string): number | undefined {
    return memoryOf(characterId).lastReflectionAt
  }

  /**
   * `characterId` names the character whose session the remark came from. A
   * remark from another character's session goes to that character's memory
   * and mind, not the active one's.
   */
  function recordEpisode(
    entry: { topic: string, salience?: number, valence?: number, characterId?: string },
    at: number,
  ): void {
    const salience = entry.salience ?? 0.6
    const memory = memoryOf(entry.characterId)
    memory.episodes.push({
      id: `ep_${at}_${memory.episodes.length}`,
      atomId: entry.topic,
      at,
      salience,
      valence: entry.valence,
    })
    mindOf(entry.characterId ?? activeCharacterId.value).notice(entry.topic, salience, at)
  }

  /**
   * Keeps the insights of one reflection and marks it done at `at`. Called
   * with no insights when the reflection found nothing or failed, so the
   * refractory gap still applies and a failing model is not asked again at
   * once.
   */
  function recordReflection(insights: readonly Episode[], at: number, characterId?: string): void {
    const memory = memoryOf(characterId)
    memory.episodes.push(...insights)
    const characterMind = mindOf(characterId ?? activeCharacterId.value)
    for (const insight of insights) {
      if (insight.atomId !== undefined)
        characterMind.notice(insight.atomId, insight.salience, insight.at)
    }
    memory.setLastReflectionAt(at)
  }

  function remember(
    entry: { topic: string, salience?: number, valence?: number, characterId?: string },
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
    if (awaitingAnswerSince !== undefined && now - awaitingAnswerSince > ANSWER_WINDOW_MS)
      settleAnswer(false)

    const { refractorySeconds } = cardSettings.value
    const factor = activeTemperament()?.thresholdFactor() ?? 1
    const threshold = cardSettings.value.threshold === undefined && factor === 1
      ? undefined
      : Math.min(1, (cardSettings.value.threshold ?? createDefaultInitiativeConfig().threshold) * factor)

    const decision = decideInitiative({
      now,
      lastInteractionAt: lastInteractionAt.value,
      lastInitiativeAt: lastInitiativeAt.value,
      candidates: mergeCandidates(asInitiativeCandidates(episodes.value, now), mind.candidates()),
      recentlyRaised: recentlyRaised.value,
    }, {
      ...(threshold !== undefined ? { threshold } : {}),
      ...(refractorySeconds !== undefined ? { refractoryMs: refractorySeconds * 1000 } : {}),
    })

    if (!decision.act)
      return decision

    lastInitiativeAt.value = now
    awaitingAnswerSince = now
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
    mind.prune(new Set(episodes.value.flatMap(episode => episode.atomId === undefined ? [] : [episode.atomId])))
  }

  /** Topics associated with `topic` on her mind, strongest first. */
  function associationsOf(topic: string) {
    return mind.associations(topic)
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
   *
   * Does nothing while the card leaves initiative off, so a host may call this
   * unconditionally on startup and let the character decide whether it applies.
   */
  function start(intervalMs: number = 5000): void {
    if (running.value || !isEnabled())
      return

    running.value = true
    timer = setInterval(() => {
      mind.step()
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
      bindings.onUserMessage((message) => {
        noteUserTurn()
        observe(message)
      }),
      bindings.onAssistantDone(observe),
    ]

    return () => {
      for (const unsubscribe of unsubscribes)
        unsubscribe()
    }
  }

  return {
    episodes,
    lastReflectionAt,
    recentlyRaised,
    lastInteractionAt,
    lastInitiativeAt,
    running,
    activeCharacterId,
    learnedTemperament,

    configure,
    useCharacter,
    noteUserTurn,
    learnedTemperamentOf,
    episodesOf,
    lastReflectionAtOf,
    isEnabled,
    noteInteraction,
    recordEpisode,
    recordReflection,
    remember,
    poll,
    forget,
    associationsOf,
    onInitiative,
    start,
    stop,
    bindToChat,
  }
})
