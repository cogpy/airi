import { describe, expect, it } from 'vitest'

import { reflexAlertToSignal, shouldForwardSignalToConscious } from './reflex-manager'

// The bot died against a kiting pillager because every incoming arrow woke the brain, which then
// `stop`ped its own in-flight attack (combat thrashing). While attacking, routine `damage` signals
// are now suppressed; critical health still reaches the brain via the separate `low_health` signal.

function sig(type: string, action?: string): any {
  return { type, metadata: action ? { action } : {} }
}

describe('shouldForwardSignalToConscious', () => {
  it('never forwards entity_attention (the idle-observation reflex raises its own alert)', () => {
    expect(shouldForwardSignalToConscious(sig('entity_attention'), false)).toBe(false)
    expect(shouldForwardSignalToConscious(sig('entity_attention'), true)).toBe(false)
  })

  it('forwards damage when NOT attacking (normal hurt reaction)', () => {
    expect(shouldForwardSignalToConscious(sig('saliency_high', 'damage'), false)).toBe(true)
  })

  it('suppresses damage WHILE attacking, to stop the brain cancelling its own attack', () => {
    expect(shouldForwardSignalToConscious(sig('saliency_high', 'damage'), true)).toBe(false)
  })

  it('still forwards critical low_health while attacking, so it can choose to retreat', () => {
    expect(shouldForwardSignalToConscious(sig('saliency_high', 'low_health'), true)).toBe(true)
  })

  it('forwards chat and other signals regardless of combat', () => {
    expect(shouldForwardSignalToConscious(sig('chat_message'), true)).toBe(true)
    expect(shouldForwardSignalToConscious(sig('system_message'), true)).toBe(true)
  })
})

describe('reflexAlertToSignal', () => {
  it('turns a reflex alert into a reflex_alert perception signal for the brain', () => {
    const signal = reflexAlertToSignal({
      behaviorId: 'hazard-alert',
      kind: 'in_lava',
      urgency: 'urgent',
      description: 'You are standing in lava and burning.',
      metadata: { health: 8 },
    }, 1234)

    expect(signal).toEqual({
      type: 'reflex_alert',
      description: 'You are standing in lava and burning.',
      sourceId: 'reflex:hazard-alert',
      confidence: 1,
      timestamp: 1234,
      metadata: { health: 8, kind: 'in_lava', urgency: 'urgent', behaviorId: 'hazard-alert' },
    })
  })

  it('reaches the conscious layer', () => {
    expect(shouldForwardSignalToConscious({ type: 'reflex_alert', metadata: { urgency: 'urgent' } }, true)).toBe(true)
  })
})
