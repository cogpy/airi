/** Shortest gap between two touches that reach the model. Each touch costs a model call. */
export const STAGE_TOUCH_COOLDOWN_MS = 5000

/**
 * The notice that tells the character where the user touched her model.
 *
 * The character reacts through the emotion tokens and words she writes. The
 * stage plays no reaction of its own, so a touch looks like what she decides.
 *
 * @example
 * touchNotice('leftUpperArm')
 * // => 'The user touched your left upper arm on the stage.'
 */
export function touchNotice(part: string): string {
  const words = part
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return `The user touched your ${words || 'model'} on the stage.`
}

/**
 * Lets a touch through when the last one that passed is at least
 * {@link STAGE_TOUCH_COOLDOWN_MS} old, and no reply is in progress.
 */
export function createTouchGate(now: () => number = Date.now) {
  let lastPassedAt = Number.NEGATIVE_INFINITY
  return (replying: boolean): boolean => {
    const at = now()
    if (replying || at - lastPassedAt < STAGE_TOUCH_COOLDOWN_MS)
      return false
    lastPassedAt = at
    return true
  }
}
