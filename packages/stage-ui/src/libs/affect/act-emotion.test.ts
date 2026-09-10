import { describe, expect, it, vi } from 'vitest'

import { Emotion } from '../../constants/emotions'
import { parseActEmotion } from './act-emotion'

describe('parseActEmotion', () => {
  it('reads a bare emotion name', () => {
    expect(parseActEmotion('<|ACT:{"emotion":"happy"}|>')).toEqual({
      name: Emotion.Happy,
      intensity: 1,
    })
  })

  it('reads an emotion object with an intensity', () => {
    expect(parseActEmotion('<|ACT:{"emotion":{"name":"sad","intensity":0.5}}|>')).toEqual({
      name: Emotion.Sad,
      intensity: 0.5,
    })
  })

  it('finds the marker among surrounding prose', () => {
    const parsed = parseActEmotion('Well, that went badly. <|ACT:{"emotion":"awkward"}|> Anyway.')

    expect(parsed?.name).toBe(Emotion.Awkward)
  })

  it('accepts the spacing variants the marker is written with', () => {
    expect(parseActEmotion('<|ACT {"emotion":"happy"}|>')?.name).toBe(Emotion.Happy)
    expect(parseActEmotion('<|ACT : {"emotion":"happy"}|>')?.name).toBe(Emotion.Happy)
  })

  it('is case-insensitive about the emotion name', () => {
    expect(parseActEmotion('<|ACT:{"emotion":" Happy "}|>')?.name).toBe(Emotion.Happy)
  })

  it('returns nothing when there is no marker', () => {
    expect(parseActEmotion('just a normal reply')).toBeUndefined()
  })

  it('returns nothing for an emotion the character is not allowed to display', () => {
    // The marker is model output, so an invented name is expected rather than
    // exceptional.
    expect(parseActEmotion('<|ACT:{"emotion":"smug"}|>')).toBeUndefined()
  })

  it('survives malformed JSON without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(parseActEmotion('<|ACT:{not json}|>')).toBeUndefined()
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })

  it('returns nothing when the payload carries no emotion', () => {
    expect(parseActEmotion('<|ACT:{"mood":"happy"}|>')).toBeUndefined()
  })

  it('ignores an emotion given as an array', () => {
    expect(parseActEmotion('<|ACT:{"emotion":["happy"]}|>')).toBeUndefined()
  })

  it('treats an unusable intensity as full strength', () => {
    // The character named a feeling; the safe reading is that it meant it.
    expect(parseActEmotion('<|ACT:{"emotion":{"name":"angry","intensity":"lots"}}|>')).toEqual({
      name: Emotion.Angry,
      intensity: 1,
    })
  })

  it('clamps an intensity outside the unit range', () => {
    expect(parseActEmotion('<|ACT:{"emotion":{"name":"angry","intensity":9}}|>')?.intensity).toBe(1)
    expect(parseActEmotion('<|ACT:{"emotion":{"name":"angry","intensity":-3}}|>')?.intensity).toBe(0)
  })
})
