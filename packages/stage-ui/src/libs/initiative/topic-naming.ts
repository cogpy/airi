import type { Conversation } from '@proj-airi/core-agent'

/**
 * Longest subject name accepted from the model. A real subject is a few words;
 * anything longer is the model answering the remark instead of naming it.
 */
const MAX_TOPIC_LENGTH = 60

/**
 * Builds the one-shot request that names what a remark is about, for cards that
 * opt into `initiative.nameTopics`.
 *
 * The answer becomes the subject the character may raise in a later lull, and
 * subjects are compared by name to stop her circling back to one she just
 * raised — so the prompt asks for a short, stable noun phrase, not a summary.
 */
export function topicNamingConversation(remark: string): Conversation {
  return {
    turns: [
      {
        type: 'system',
        id: 'topic-naming-instructions',
        authority: 'system',
        content: [{
          type: 'text',
          text: 'Name the subject of the user\'s message in two to five lowercase words, '
            + 'as a noun phrase someone could bring up again later (for example: "their cat", "the job interview"). '
            + 'Reply with the phrase only. If the message has no subject worth returning to, such as a greeting or a thank-you, reply with: none',
        }],
      },
      {
        type: 'user',
        id: 'topic-naming-remark',
        content: [{ type: 'text', text: remark }],
      },
    ],
  }
}

/**
 * Normalizes the model's reply into a subject name, or `undefined` when the
 * remark had nothing worth returning to or the reply is not a name.
 *
 * @example
 * parseTopicName('"The job interview."\n')
 * // => 'the job interview'
 *
 * @example
 * parseTopicName('None')
 * // => undefined
 */
export function parseTopicName(reply: string): string | undefined {
  const firstLine = reply.trim().split('\n')[0] ?? ''
  const name = firstLine
    .replace(/^["'“‘`]+|["'”’`.!?]+$/g, '')
    .trim()
    .toLowerCase()

  if (!name || name === 'none' || name.length > MAX_TOPIC_LENGTH)
    return undefined

  return name
}
