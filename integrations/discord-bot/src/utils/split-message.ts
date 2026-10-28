/** Longest message content that Discord accepts. */
export const DISCORD_MESSAGE_LIMIT = 2000

/**
 * Splits text into chunks that Discord accepts as messages.
 *
 * Use when:
 * - Text from the model can be longer than {@link DISCORD_MESSAGE_LIMIT}.
 *
 * Returns:
 * - Chunks in order. A chunk ends at the last newline or space before the limit when one exists.
 */
export function splitDiscordMessage(content: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  const chunks: string[] = []
  let remaining = content

  while (remaining.length > 0) {
    let chunkSize = limit
    if (remaining.length > limit) {
      // Try to split at the last newline before the limit, then at the last space.
      const lastNewline = remaining.lastIndexOf('\n', limit)
      const lastSpace = remaining.lastIndexOf(' ', limit)
      if (lastNewline > 0)
        chunkSize = lastNewline
      else if (lastSpace > 0)
        chunkSize = lastSpace
    }

    chunks.push(remaining.slice(0, chunkSize))
    remaining = remaining.slice(chunkSize).trim()
  }

  return chunks
}
