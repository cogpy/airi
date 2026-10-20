import type { SpeechAudio, SpeechOutput, TurnRef } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { EnvelopeSource } from '../libs/participants'

import { errorMessageFrom } from '@moeru/std'

import { useParticipantsStore } from '../stores/participants'

type StreamingSpeechOutput = Extract<SpeechOutput, { stream: unknown }>

/**
 * Publishes the character's speech clips to the participants store as the
 * `self` participant: the self channel.
 *
 * The voice store wraps the output of each response turn with it. Each clip
 * that starts playing is published with its text, its start time, the turn,
 * and, for a synthesized clip, its decoded audio. The echo gate turns that
 * audio into a loudness envelope, and the context bridge forwards the activity
 * to other stages.
 *
 * Lifecycle and ordering:
 *
 * - Synthesis. When `enabled` is true, each synthesized clip starts to decode
 *   at once, keyed by its segment id. The pipeline reuses the segment id as the
 *   clip id, so the playback callbacks find it.
 * - Start. `enabled` is read again. The start time is `Date.now()` when the
 *   pipeline schedules the clip's first audio. If decoding is still running,
 *   the start is published when it finishes, with the original start time.
 *   For a streaming provider, see {@link observeStreamedSelfSpeech}.
 * - End. A stop is always published, also when `enabled` is now false: the
 *   store ignores clips it never saw, and a card change must not leave her
 *   marked as speaking. A clip that ends before its audio decodes is never
 *   published.
 *
 * The wrapped output's own callbacks run first, so presentation does not wait
 * for this channel.
 */
export function observeSelfSpeech(turn: TurnRef, output: SpeechOutput, decode: (audio: Blob) => Promise<EnvelopeSource>, enabled: () => boolean): SpeechOutput {
  const participants = useParticipantsStore()
  /** Decoded audio by clip id. A failed decode resolves to `undefined`. */
  const decoded = new Map<string, Promise<EnvelopeSource | undefined>>()
  const ended = new Set<string>()

  function publishStart(clip: { id: string, text: string }, at: number, audio?: EnvelopeSource) {
    participants.publishSelfPlaybackStart({ id: clip.id, text: clip.text, at, turnId: turn.turnId, sessionId: turn.sessionId, ...(audio ? { audio } : {}) })
  }

  const callbacks: Pick<SpeechOutput, 'onPlaybackStart' | 'onPlaybackEnd'> = {
    onPlaybackStart: (clip) => {
      output.onPlaybackStart?.(clip)
      const at = Date.now()
      if (!enabled())
        return

      const audio = decoded.get(clip.id)
      if (!audio) {
        publishStart(clip, at)
        return
      }
      void audio.then((buffer) => {
        if (!ended.has(clip.id))
          publishStart(clip, at, buffer)
      })
    },
    onPlaybackEnd: (clip, result) => {
      output.onPlaybackEnd?.(clip, result)
      ended.add(clip.id)
      decoded.delete(clip.id)
      participants.publishSelfPlaybackStop({ id: clip.id, at: Date.now() })
    },
  }

  if (!('synthesize' in output))
    return observeStreamedSelfSpeech(output, participants, publishStart, decode, enabled)

  const synthesize = output.synthesize
  return {
    ...output,
    ...callbacks,
    synthesize: async (request, signal) => {
      const audio = await synthesize(request, signal)
      if (audio && enabled()) {
        decoded.set(request.segmentId, decode(audio).catch((cause) => {
          // The clip still plays. Without its envelope the gate treats her as silent for it.
          console.warn('[self-channel] Could not decode speech for the echo gate:', errorMessageFrom(cause) ?? cause)
          return undefined
        }))
      }
      return audio
    },
  }
}

/** One audio part of a streaming provider, from when it is read until its clip ends. */
interface StreamedPart {
  clipId?: string
  /** Audio of the part as one Blob, decoding. */
  decoded?: Promise<EnvelopeSource | undefined>
  /** PCM blocks that the playback read before the clip started. */
  pending: EnvelopeSource[]
  /** When the next block plays, after the clip started. */
  nextAt: number
}

/**
 * The self channel for a streaming provider. Each audio part becomes one clip.
 *
 * A part's audio is one Blob or a stream of PCM blocks. A Blob is decoded like
 * a synthesized clip. A PCM block stream is observed as the playback reads it:
 * blocks read before the clip starts go out with its start, and each later
 * block extends the clip's envelope. Without it, the gate sees no playback of
 * hers and refuses all speech over the clip.
 *
 * The provider assigns clip ids after it reads a part, so parts and clips are
 * matched by order. Parts play in the order they are read, and the voice
 * output reads the next producer's parts only after the previous producer.
 */
function observeStreamedSelfSpeech(
  output: StreamingSpeechOutput,
  participants: ReturnType<typeof useParticipantsStore>,
  publishStart: (clip: { id: string, text: string }, at: number, audio?: EnvelopeSource) => void,
  decode: (audio: Blob) => Promise<EnvelopeSource>,
  enabled: () => boolean,
): SpeechOutput {
  /** Parts read and not started yet, in playback order. */
  const unstarted: StreamedPart[] = []
  const playing = new Map<string, StreamedPart>()

  function appendBlock(part: StreamedPart, block: EnvelopeSource) {
    if (part.clipId === undefined) {
      part.pending.push(block)
      return
    }
    const at = Math.max(part.nextAt, Date.now())
    part.nextAt = at + durationMs(block)
    participants.appendSelfPlaybackAudio({ id: part.clipId, audio: block, at })
  }

  function observePart(audio: SpeechAudio): SpeechAudio {
    const part: StreamedPart = { pending: [], nextAt: 0 }
    unstarted.push(part)
    if (!enabled())
      return audio

    if (audio.audio instanceof Blob) {
      part.decoded = decode(audio.audio).catch((cause) => {
        console.warn('[self-channel] Could not decode speech for the echo gate:', errorMessageFrom(cause) ?? cause)
        return undefined
      })
      return audio
    }

    return {
      ...audio,
      audio: audio.audio.pipeThrough(new TransformStream<PcmBlock, PcmBlock>({
        transform(block, controller) {
          appendBlock(part, envelopeSourceOf(block))
          controller.enqueue(block)
        },
      })),
    }
  }

  return {
    ...output,
    onPlaybackStart: (clip) => {
      output.onPlaybackStart?.(clip)
      const at = Date.now()
      const part = unstarted.shift()
      if (!enabled() || !part)
        return

      if (part.decoded) {
        playing.set(clip.id, part)
        void part.decoded.then((buffer) => {
          if (playing.get(clip.id) === part)
            publishStart(clip, at, buffer)
        })
        return
      }

      const [first, ...later] = part.pending
      part.pending = []
      publishStart(clip, at, first)
      part.clipId = clip.id
      part.nextAt = at + (first ? durationMs(first) : 0)
      playing.set(clip.id, part)
      for (const block of later)
        appendBlock(part, block)
    },
    onPlaybackEnd: (clip, result) => {
      output.onPlaybackEnd?.(clip, result)
      const part = playing.get(clip.id)
      playing.delete(clip.id)
      if (part)
        part.clipId = undefined
      participants.publishSelfPlaybackStop({ id: clip.id, at: Date.now() })
    },
    stream: async (text, signal) => {
      const parts = await output.stream(text, signal)
      return parts.pipeThrough(new TransformStream<SpeechAudio, SpeechAudio>({
        transform(audio, controller) {
          controller.enqueue(observePart(audio))
        },
      }))
    },
  }
}

function envelopeSourceOf(block: PcmBlock): EnvelopeSource {
  return { sampleRate: block.sampleRate, numberOfChannels: block.channels.length, getChannelData: channel => block.channels[channel] }
}

function durationMs(audio: EnvelopeSource): number {
  return audio.numberOfChannels > 0 ? audio.getChannelData(0).length / audio.sampleRate * 1000 : 0
}
