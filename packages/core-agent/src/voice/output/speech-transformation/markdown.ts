/** Code that markdown keeps as written: fenced blocks and inline code. Math delimiters inside it are not math. */
export const codeSpans = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/


/**
 * Converts `\(...\)` to `$...$` and `\[...\]` to `$$...$$`, outside code.
 * CommonMark reads `\(` as an escaped parenthesis, so the backslash is gone after parsing.
 */
export function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(codeSpans)
    .map((part, index) => index % 2 === 1
      ? part
      : replaceDelimited(replaceDelimited(part, '\\[', '\\]', '$$'), '\\(', '\\)', '$'))
    .join('')
}

/**
 * Replaces each `open … close` pair, with at least one character between, by
 * `mark … mark`. Pairs are found left to right, and a pair ends at the first
 * `close` after its `open`.
 *
 * Index scans keep this linear. A lazy regular expression retried the search
 * for `close` at every `open`, which is quadratic on a reply with many `open`
 * and no `close`. When one `open` has no `close` after it, no later one has.
 */
function replaceDelimited(text: string, open: string, close: string, mark: string): string {
  let result = ''
  let from = 0
  while (true) {
    const start = text.indexOf(open, from)
    if (start < 0)
      break
    const end = text.indexOf(close, start + open.length + 1)
    if (end < 0)
      break
    result += `${text.slice(from, start)}${mark}${text.slice(start + open.length, end)}${mark}`
    from = end + close.length
  }
  return result + text.slice(from)
}
