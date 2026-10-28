import { describe, expect, it } from 'vitest'

import { createTouchGate, STAGE_TOUCH_COOLDOWN_MS, touchNotice } from './touch-notice'

describe('touchNotice', () => {
  it('names a VRM region in words', () => {
    expect(touchNotice('leftUpperArm')).toBe('The user touched your left upper arm on the stage.')
    expect(touchNotice('head')).toBe('The user touched your head on the stage.')
  })

  it('names a Live2D hit area in words', () => {
    expect(touchNotice('tap_body')).toBe('The user touched your tap body on the stage.')
    expect(touchNotice('Body')).toBe('The user touched your body on the stage.')
  })

  it('falls back to the model as a whole for an empty area name', () => {
    expect(touchNotice('')).toBe('The user touched your model on the stage.')
  })
})

describe('createTouchGate', () => {
  it('lets one touch through per cooldown', () => {
    let now = 1000
    const gate = createTouchGate(() => now)

    expect(gate(false)).toBe(true)
    now += STAGE_TOUCH_COOLDOWN_MS - 1
    expect(gate(false)).toBe(false)
    now += 1
    expect(gate(false)).toBe(true)
  })

  it('lets no touch through while she is replying', () => {
    const gate = createTouchGate(() => 0)

    expect(gate(true)).toBe(false)
    expect(gate(false)).toBe(true)
  })
})
