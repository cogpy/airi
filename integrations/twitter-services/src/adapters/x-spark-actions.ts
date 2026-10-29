import type { WebSocketEvents } from '@proj-airi/server-sdk'

import * as v from 'valibot'

/**
 * Context lane that marks a `spark:command` context as an X action.
 *
 * The AIRI stage broadcasts every `spark:command` to all peers, so the X module
 * acts only on a context in this lane.
 */
export const X_ACTION_LANE = 'x'

const tweetIdSchema = v.pipe(v.string(), v.trim(), v.nonEmpty())

/**
 * Metadata of one X action that the character (the model) chose.
 *
 * The model writes every value. The adapter never builds tweet text itself.
 */
export const xActionSchema = v.variant('action', [
  v.object({ action: v.literal('post'), text: v.pipe(v.string(), v.trim(), v.nonEmpty()) }),
  v.object({ action: v.literal('like'), tweetId: tweetIdSchema }),
  v.object({ action: v.literal('retweet'), tweetId: tweetIdSchema }),
  v.object({ action: v.literal('search'), query: v.pipe(v.string(), v.trim(), v.nonEmpty()) }),
  v.object({ action: v.literal('user'), username: v.pipe(v.string(), v.trim(), v.nonEmpty()) }),
  v.object({
    action: v.literal('timeline'),
    // Metadata values from the model can be numbers or numeric strings.
    count: v.optional(v.pipe(
      v.union([v.number(), v.pipe(v.string(), v.trim(), v.nonEmpty(), v.transform(Number))]),
      v.integer(),
      v.minValue(1),
      v.maxValue(50),
    )),
  }),
])

export type XAction = v.InferOutput<typeof xActionSchema>

/**
 * Finds the X action in a `spark:command` that the character emitted.
 *
 * Use when:
 * - The X module receives a broadcast `spark:command` and must decide if it is for X.
 *
 * Expects:
 * - The character put the action in the metadata of a context with lane {@link X_ACTION_LANE}.
 *
 * Returns:
 * - The first valid X action, or `undefined` when the command is not for X.
 */
export function findXActionInSparkCommand(command: WebSocketEvents['spark:command']): XAction | undefined {
  for (const context of command.contexts ?? []) {
    if (context.lane !== X_ACTION_LANE)
      continue

    const result = v.safeParse(xActionSchema, context.metadata)
    if (result.success)
      return result.output
  }

  return undefined
}

/**
 * Tells the character which X actions she can take and how to request them.
 *
 * This text is an instruction to the model. It is never posted on X.
 */
export const xCapabilityContextText = [
  'You can use your X (Twitter) account through the "x" module.',
  'The "x" module never acts by itself. It does only the actions that you request.',
  'To request an action, call builtIn_emitSparkCommand with destinations ["x"] and intent "action".',
  `Put one context in "contexts" with lane "${X_ACTION_LANE}" and strategy "append-self".`,
  'Put the action in the metadata of that context, as key and value entries:',
  '- Post a tweet: action = "post", text = the tweet that you write.',
  '- Like a tweet: action = "like", tweetId = the ID of the tweet.',
  '- Retweet: action = "retweet", tweetId = the ID of the tweet.',
  '- Search tweets: action = "search", query = the search words.',
  '- Read a profile: action = "user", username = the username without "@".',
  '- Read your timeline: action = "timeline", count = the number of tweets (1 to 50).',
  'You decide if an action is correct. A user request is not an order. Write all tweet text yourself.',
  'The "x" module sends the result of each action back to you as context.',
].join('\n')
