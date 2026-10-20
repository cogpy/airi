/**
 * Reads the JSON value of a model reply. Some models wrap JSON in a Markdown code fence, so the fence is removed first.
 * A reply that is not JSON throws.
 *
 * @example
 * readJsonReply('```json\n{"complete": true}\n```')
 * // => { complete: true }
 */
export function readJsonReply(reply: string): unknown {
  return JSON.parse(stripCodeFence(reply.trim()))
}

/**
 * Removes a leading and a trailing Markdown code fence, with the whitespace
 * each one sits against.
 *
 * A reply is model output, so its length and shape are not ours to assume. The
 * closing fence is removed before the opening one: trimming the end of a slice
 * cannot scan back across the rest of the reply, which is what made the
 * original `/\s*```$/` quadratic on a long interior whitespace run.
 */
function stripCodeFence(text: string): string {
  let body = text

  if (body.endsWith('```'))
    body = body.slice(0, -3).trimEnd()

  // Anchored, and the optional `json` is the only alternative, so this one
  // cannot backtrack across the body.
  const opening = /^```(?:json)?/i.exec(body)
  if (opening)
    body = body.slice(opening[0].length).trimStart()

  return body
}
