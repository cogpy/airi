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
 * Producers set `at` in `Date.now()` milliseconds, the same clock as the
 * playback manager's `startedAt`, so consumers can compare activity from
 * different participants directly.
 */
export interface ParticipantActivity {
  participant: Participant
  phase: 'start' | 'end'
  at: number
  /**
   * What the participant said, when it is known at this moment.
   *
   * The self channel sets it on `start` from the played item. Device speech
   * has no text here: transcription happens later, in the hearing pipeline.
   */
  text?: string
}
