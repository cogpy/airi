/**
 * The slice of a Web Audio `AudioBuffer` that the envelope reads. Kept
 * structural so tests and non-DOM callers can pass plain sample arrays.
 */
export interface EnvelopeSource {
  sampleRate: number
  numberOfChannels: number
  getChannelData: (channel: number) => Float32Array
}

/**
 * Computes the loudness of a played buffer over time.
 *
 * The self channel publishes this as an efference copy: the echo gate compares
 * the microphone against it to tell the character's echo from other speech.
 *
 * Channels are averaged sample by sample before the RMS, so the result is the
 * loudness of the mono mix that reaches one speaker. Each value covers
 * `frameMs` of audio; the last frame may be shorter. Values are linear RMS in
 * the buffer's own sample scale (`-1` to `1` for Web Audio).
 *
 * @example
 * energyEnvelope({ sampleRate: 1000, numberOfChannels: 1, getChannelData: () => new Float32Array([1, -1, 1, -1, 0, 0]) }, 2)
 * // => Float32Array [1, 1, 0]
 */
export function energyEnvelope(buffer: EnvelopeSource, frameMs = 10): Float32Array {
  const channels = Math.max(0, Math.floor(buffer.numberOfChannels))
  if (channels === 0 || !(buffer.sampleRate > 0) || !(frameMs > 0))
    return new Float32Array(0)

  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel))
  const length = Math.min(...data.map(channel => channel.length))
  const frameSize = Math.max(1, Math.round(buffer.sampleRate * frameMs / 1000))
  const frameCount = Math.ceil(length / frameSize)
  const envelope = new Float32Array(frameCount)

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSize
    const end = Math.min(length, start + frameSize)
    let sum = 0
    for (let i = start; i < end; i++) {
      let mixed = 0
      for (let channel = 0; channel < channels; channel++)
        mixed += data[channel][i]
      mixed /= channels
      sum += mixed * mixed
    }
    envelope[frame] = Math.sqrt(sum / (end - start))
  }

  return envelope
}
