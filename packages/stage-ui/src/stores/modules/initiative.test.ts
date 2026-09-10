// @vitest-environment jsdom

import type { InitiativeChatBindings } from './initiative'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useInitiativeStore } from './initiative'

const MINUTE = 60_000
const DAY = 86_400_000

/** A chat the test can speak into, standing in for the real chat store. */
function fakeChat() {
  const userHandlers: Array<(message: string) => void> = []
  const assistantHandlers: Array<(message: string) => void> = []

  const bindings: InitiativeChatBindings = {
    onUserMessage: (handler) => {
      userHandlers.push(handler)
      return () => userHandlers.splice(userHandlers.indexOf(handler), 1)
    },
    onAssistantDone: (handler) => {
      assistantHandlers.push(handler)
      return () => assistantHandlers.splice(assistantHandlers.indexOf(handler), 1)
    },
  }

  return {
    bindings,
    userSays: (message: string) => userHandlers.forEach(handler => handler(message)),
    assistantSays: (message: string) => assistantHandlers.forEach(handler => handler(message)),
    listenerCount: () => userHandlers.length + assistantHandlers.length,
  }
}

describe('initiative store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays quiet while the conversation is live', () => {
    const initiative = useInitiativeStore()

    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 })

    expect(initiative.poll().act).toBe(false)
  })

  it('raises a remembered subject once the conversation has gone quiet', () => {
    const initiative = useInitiativeStore()
    const now = Date.now()

    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 }, now)

    const decision = initiative.poll(now + 10 * MINUTE)

    expect(decision.act).toBe(true)
    if (decision.act)
      expect(decision.topicAtomId).toBe('atom_minecraft')
  })

  it('has nothing to raise before anything has been remembered', () => {
    const initiative = useInitiativeStore()

    expect(initiative.poll(Date.now() + 10 * MINUTE)).toMatchObject({
      act: false,
      reason: 'no-candidates',
    })
  })

  it('does not circle straight back to what it just raised', () => {
    const initiative = useInitiativeStore()
    const now = Date.now()

    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 }, now)
    expect(initiative.poll(now + 10 * MINUTE).act).toBe(true)

    // A minute later: past the refractory gap, so only the repetition guard
    // can be holding it back.
    expect(initiative.poll(now + 11 * MINUTE).act).toBe(false)
  })

  it('comes back to a subject once enough time has passed', () => {
    const initiative = useInitiativeStore()
    const now = Date.now()

    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 }, now)
    initiative.poll(now + 10 * MINUTE)

    expect(initiative.poll(now + 120 * MINUTE).act).toBe(true)
  })

  it('does not treat raising a subject itself as evidence the subject matters', () => {
    // Rehearsing on a self-raised topic would make it stronger than whatever it
    // just beat, so it would win again the moment its novelty recovered and the
    // character would circle one subject. Reinforcement comes from the reply.
    const initiative = useInitiativeStore()
    const now = Date.now()

    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 }, now)
    initiative.poll(now + 10 * MINUTE)

    expect(initiative.episodes[0].recalledAt).toBeUndefined()
  })

  it('moves on to another subject rather than repeating the first', () => {
    const initiative = useInitiativeStore()
    const now = Date.now()

    initiative.remember({ topic: 'atom_first', salience: 0.9 }, now)
    initiative.remember({ topic: 'atom_second', salience: 0.85 }, now)

    const first = initiative.poll(now + 10 * MINUTE)
    const second = initiative.poll(now + 25 * MINUTE)

    expect(first.act && second.act).toBe(true)
    if (first.act && second.act)
      expect(second.topicAtomId).not.toBe(first.topicAtomId)
  })

  it('notifies a listener when it decides to speak', () => {
    const initiative = useInitiativeStore()
    const heard = vi.fn()
    const now = Date.now()

    initiative.onInitiative(heard)
    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 }, now)
    initiative.poll(now + 10 * MINUTE)

    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard.mock.calls[0][0]).toMatchObject({ act: true, topicAtomId: 'atom_minecraft' })
  })

  it('stops notifying a listener that unsubscribed', () => {
    const initiative = useInitiativeStore()
    const heard = vi.fn()
    const now = Date.now()

    initiative.onInitiative(heard)()
    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 }, now)
    initiative.poll(now + 10 * MINUTE)

    expect(heard).not.toHaveBeenCalled()
  })

  it('speaks on its own once started, without anyone polling it', () => {
    const initiative = useInitiativeStore()
    const heard = vi.fn()

    initiative.configure({ enabled: true })
    initiative.onInitiative(heard)
    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 })
    initiative.start(1000)

    // The lull has to actually pass on the clock the decision reads.
    vi.advanceTimersByTime(10 * MINUTE)

    expect(heard).toHaveBeenCalled()
    initiative.stop()
  })

  it('goes quiet again when stopped', () => {
    const initiative = useInitiativeStore()
    const heard = vi.fn()

    initiative.configure({ enabled: true })
    initiative.onInitiative(heard)
    initiative.remember({ topic: 'atom_minecraft', salience: 0.9 })
    initiative.start(1000)
    initiative.stop()

    vi.advanceTimersByTime(10 * MINUTE)

    expect(heard).not.toHaveBeenCalled()
    expect(initiative.running).toBe(false)
  })

  describe('the card switch', () => {
    it('stays off unless a card turns it on', () => {
      const initiative = useInitiativeStore()

      expect(initiative.isEnabled()).toBe(false)
    })

    it('does not start on a card that leaves it off', () => {
      // A host may call start() unconditionally; a silent card must still mean
      // a character that only answers.
      const initiative = useInitiativeStore()
      const heard = vi.fn()

      initiative.onInitiative(heard)
      initiative.remember({ topic: 'atom_minecraft', salience: 0.9 })
      initiative.start(1000)

      vi.advanceTimersByTime(10 * MINUTE)

      expect(initiative.running).toBe(false)
      expect(heard).not.toHaveBeenCalled()
    })

    it('honours a threshold the card raised', () => {
      const initiative = useInitiativeStore()
      const now = Date.now()

      initiative.configure({ enabled: true, threshold: 0.99 })
      initiative.remember({ topic: 'atom_minecraft', salience: 0.5 }, now)

      expect(initiative.poll(now + 10 * MINUTE).act).toBe(false)
    })

    it('honours a refractory gap the card lengthened', () => {
      const initiative = useInitiativeStore()
      const now = Date.now()

      initiative.configure({ enabled: true, refractorySeconds: 3600 })
      initiative.remember({ topic: 'atom_minecraft', salience: 0.9 }, now)
      expect(initiative.poll(now + 10 * MINUTE).act).toBe(true)

      // Novelty has long recovered; only the card's hour-long gap holds it.
      expect(initiative.poll(now + 50 * MINUTE)).toMatchObject({ reason: 'refractory' })
    })
  })

  it('lets go of what has faded past holding', () => {
    const initiative = useInitiativeStore()
    const now = Date.now()

    initiative.remember({ topic: 'atom_passing_remark' }, now)
    initiative.forget(now + 365 * DAY)

    expect(initiative.episodes).toHaveLength(0)
  })

  describe('bindToChat', () => {
    it('treats every message as the conversation being live', () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()
      const before = initiative.lastInteractionAt

      initiative.bindToChat(chat.bindings)
      vi.advanceTimersByTime(MINUTE)
      chat.userSays('hello')

      expect(initiative.lastInteractionAt).toBeGreaterThan(before)
    })

    it('remembers a message whose subject can be named', () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()

      initiative.bindToChat(chat.bindings, {
        deriveTopic: message => (message.includes('minecraft') ? 'atom_minecraft' : undefined),
      })

      chat.userSays('we should play minecraft')

      expect(initiative.episodes).toHaveLength(1)
      expect(initiative.episodes[0].atomId).toBe('atom_minecraft')
    })

    it('remembers nothing when no subject can be named', () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()

      initiative.bindToChat(chat.bindings, { deriveTopic: () => undefined })
      chat.userSays('mm')

      expect(initiative.episodes).toHaveLength(0)
    })

    it('listens to the character as well as the other party', () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()

      initiative.bindToChat(chat.bindings, { deriveTopic: () => 'atom_topic' })
      chat.assistantSays('I liked that speedrun')

      expect(initiative.episodes).toHaveLength(1)
    })

    it('remembers a subject that took a round trip to name', async () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()

      initiative.bindToChat(chat.bindings, {
        deriveTopic: async () => 'atom_speedrun',
      })

      chat.userSays('did you see that')
      expect(initiative.episodes).toHaveLength(0)

      await vi.waitFor(() => expect(initiative.episodes).toHaveLength(1))
      expect(initiative.episodes[0].atomId).toBe('atom_speedrun')
    })

    it('dates a slowly named subject to when it was said, not when it was named', async () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()
      const said = Date.now()

      initiative.bindToChat(chat.bindings, {
        deriveTopic: () => new Promise<string>(resolve => setTimeout(resolve, 5000, 'atom_speedrun')),
      })

      chat.userSays('did you see that')
      await vi.advanceTimersByTimeAsync(5000)

      expect(initiative.episodes).toHaveLength(1)
      expect(initiative.episodes[0].at).toBe(said)
    })

    it('keeps the conversation live even when no subject can be named', async () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()
      const before = initiative.lastInteractionAt

      initiative.bindToChat(chat.bindings, { deriveTopic: async () => undefined })
      vi.advanceTimersByTime(1000)
      chat.userSays('mm')

      expect(initiative.lastInteractionAt).toBeGreaterThan(before)
      await vi.advanceTimersByTimeAsync(0)
      expect(initiative.episodes).toHaveLength(0)
    })

    it('says nothing about a naming failure', async () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()

      initiative.bindToChat(chat.bindings, {
        deriveTopic: async () => { throw new Error('rate limited') },
      })

      chat.userSays('did you see that')
      await vi.advanceTimersByTimeAsync(0)

      expect(initiative.episodes).toHaveLength(0)
    })

    it('detaches cleanly', () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()

      const unbind = initiative.bindToChat(chat.bindings, { deriveTopic: () => 'atom_topic' })
      unbind()
      chat.userSays('still there?')

      expect(chat.listenerCount()).toBe(0)
      expect(initiative.episodes).toHaveLength(0)
    })

    it('carries a whole exchange through to speaking up later', () => {
      const initiative = useInitiativeStore()
      const chat = fakeChat()
      const heard = vi.fn()
      const started = Date.now()

      initiative.onInitiative(heard)
      initiative.bindToChat(chat.bindings, {
        deriveTopic: message => (message.includes('speedrun') ? 'atom_speedrun' : undefined),
        salience: 0.9,
      })

      chat.userSays('did you see that speedrun')
      chat.assistantSays('the movement tech was unreal')

      // Right after the exchange it should hold its tongue.
      expect(initiative.poll(Date.now()).act).toBe(false)

      const decision = initiative.poll(started + 10 * MINUTE)

      expect(decision.act).toBe(true)
      if (decision.act)
        expect(decision.topicAtomId).toBe('atom_speedrun')
      expect(heard).toHaveBeenCalledTimes(1)
    })
  })
})
