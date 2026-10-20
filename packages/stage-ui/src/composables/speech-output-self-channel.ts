import type { SpeechOutput, TurnRef } from '@proj-airi/core-agent'

import type { EnvelopeSource } from '../libs/participants'

import { errorMessageFrom } from '@moeru/std'

import { useParticipantsStore } from '../stores/participants'

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
 *   A clip of a streaming provider has no decoded audio and is published
 *   without it.
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
    return { ...output, ...callbacks }

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
