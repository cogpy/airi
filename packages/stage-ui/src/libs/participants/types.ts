/**
 * Whether a source the character perceives is the character herself or someone else.
 *
 * - `self`: the character's own output. A stage has exactly one.
 * - `other`: every other source. Turn-taking yields only to `other` activity.
 */
export type ParticipantKind = 'self' | 'other'

/**
 * Where an `other` participant comes from.
 *
 * - `device`: a local microphone or other input device.
 * - `agent`: another AI agent.
 * - `remote-user`: a person on Discord or another remote channel.
 */
export type OtherParticipantOrigin = 'device' | 'agent' | 'remote-user'

/** A source the character perceives. */
export type Participant
  = | { id: string, kind: 'self' }
    | { id: string, kind: 'other', origin: OtherParticipantOrigin }

/**
 * A participant started or stopped speaking.
 *
 * Producers set `at` in `Date.now()` milliseconds of this renderer, so
 * consumers can compare activity from different participants directly. The
 * self channel stamps it when a speech clip starts or ends.
 */
export interface ParticipantActivity {
  participant: Participant
  phase: 'start' | 'end'
  at: number
  /**
   * What the participant said, when it is known at this moment.
   *
   * The self channel sets it on `start` from the played clip. Device speech
   * has no text here: transcription happens later, in the hearing pipeline.
   */
  text?: string
  /**
   * Turn the speech belongs to, when it is known. The self channel sets it on
   * `start` from the played clip, so other stages can tell where one of her
   * replies ends and the next begins.
   */
  turnId?: string
  /**
   * Chat session of the speech. The self channel sets it on `start`, so a
   * consumer can read the character card of that session, for example to
   * decide whether to publish her speech to other stages.
   */
  sessionId?: string
}
