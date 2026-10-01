import { describe, expect, it } from 'vitest'

import { energyEnvelope } from './energy-envelope'

function bufferOf(sampleRate: number, ...channels: number[][]) {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    getChannelData: (channel: number) => Float32Array.from(channels[channel]),
  }
}

describe('energyEnvelope', () => {
  it('returns one RMS value per frame, with a shorter last frame', () => {
    const envelope = energyEnvelope(bufferOf(1000, [1, -1, 0.5, -0.5, 0.2]), 2)

    expect(Array.from(envelope)).toHaveLength(3)
    expect(envelope[0]).toBeCloseTo(1)
    expect(envelope[1]).toBeCloseTo(0.5)
    expect(envelope[2]).toBeCloseTo(0.2)
  })

  it('mixes channels before measuring, as one speaker would play them', () => {
    const envelope = energyEnvelope(bufferOf(1000, [1, 1], [-1, 1]), 2)

    expect(envelope[0]).toBeCloseTo(Math.sqrt(0.5))
  })

  it('uses 10 ms frames by default', () => {
    const envelope = energyEnvelope(bufferOf(48000, Array.from<number>({ length: 48000 }).fill(0.1)))

    expect(envelope).toHaveLength(100)
    expect(envelope[99]).toBeCloseTo(0.1)
  })

  it('returns an empty envelope for a buffer without channels', () => {
    expect(energyEnvelope(bufferOf(48000))).toHaveLength(0)
  })
})
