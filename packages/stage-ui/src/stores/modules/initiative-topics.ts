/**
 * Naming what a message was about.
 *
 * The initiative store can only raise a subject it has a name for, and nothing
 * else in the runtime produces one: the response categoriser separates speech
 * from reasoning, and `AionMind.perceive` consumes concepts that are already
 * named. So the name has to be asked for.
 *
 * Asking a model costs a call per turn, which is why nothing here runs unless a
 * host wires it in and passes something to call. The parsing is kept separate
 * from the calling so the part that can go wrong — a model answering with a
 * sentence, an apology, or nothing — is testable without a provider.
 */

/**
 * The instruction given to the model. Deliberately narrow: one short noun
 * phrase or the word NONE, because anything looser comes back as a sentence
 * and every distinct sentence would become its own subject, so a topic
 * mentioned twice would never accumulate into one memory.
 */
export const TOPIC_EXTRACTION_PROMPT = [
  'Name the single subject of the message in at most four words, as a noun phrase.',
  'Answer with the noun phrase alone, no punctuation, no explanation.',
  'If the message is small talk, an acknowledgement, or about nothing in particular, answer exactly NONE.',
].join(' ')

/** Longest accepted subject, in characters. Beyond this it is a sentence. */
const MAX_TOPIC_LENGTH = 48

/** Most words accepted, matching what the prompt asks for, with slack for one over. */
const MAX_TOPIC_WORDS = 5

/**
 * Turns a model's answer into a stable subject key, or nothing.
 *
 * Normalizes so that the same subject said twice lands on one key — the whole
 * point of naming it — and rejects anything that reads as the model having
 * answered a different question. Rejecting is cheap: the character just has one
 * less thing to talk about. Accepting junk is not: it becomes something the
 * character brings up.
 */
export function parseTopicResponse(raw: string | undefined | null): string | undefined {
  if (typeof raw !== 'string')
    return undefined

  const collapsed = raw.replace(/\s+/g, ' ').trim()

  if (collapsed === '')
    return undefined

  // Strip the wrapping a model adds when it treats the phrase as a quotation.
  const unquoted = collapsed.replace(/^["'`]+|["'`.!?]+$/g, '').trim()

  if (unquoted === '')
    return undefined
  if (unquoted.length > MAX_TOPIC_LENGTH)
    return undefined
  if (unquoted.split(' ').length > MAX_TOPIC_WORDS)
    return undefined

  const normalized = unquoted.toLowerCase()

  if (normalized === 'none')
    return undefined

  // A refusal or a hedge is a sentence about the task, not a subject.
  if (/^(?:i |sorry|as an|the (?:subject|topic) )/.test(normalized))
    return undefined

  return normalized
}

export interface TopicExtractorOptions {
  /**
   * Asks the model to name the subject. Injected so the store never reaches for
   * a provider itself, and so this is testable without one.
   */
  generate: (input: { prompt: string, message: string }) => Promise<string | undefined>
  /**
   * Longest message sent for naming, in characters. A long message is truncated
   * rather than skipped, since the subject is usually stated early.
   *
   * @default 2000
   */
  maxMessageLength?: number
}

/**
 * Builds a `deriveTopic` for the initiative store, backed by a model.
 *
 * Never throws: a provider that is down, rate-limited, or slow leaves the
 * character with nothing to raise, which is the same position it is in before
 * anyone wires this up, and strictly better than interrupting the conversation
 * with the failure.
 */
export function createTopicExtractor(
  options: TopicExtractorOptions,
): (message: string) => Promise<string | undefined> {
  const maxMessageLength = options.maxMessageLength ?? 2000

  return async (message: string) => {
    const trimmed = message.trim()

    if (trimmed === '')
      return undefined

    try {
      const answer = await options.generate({
        prompt: TOPIC_EXTRACTION_PROMPT,
        message: trimmed.slice(0, maxMessageLength),
      })

      return parseTopicResponse(answer)
    }
    catch {
      return undefined
    }
  }
}
