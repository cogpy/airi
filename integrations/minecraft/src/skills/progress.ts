import { AsyncLocalStorage } from 'node:async_hooks'

import { ActionError } from '../utils/errors'
import { useLogger } from '../utils/logger'

const logger = useLogger()
const progressStorage = new AsyncLocalStorage<string[]>()

/**
 * Records a progress fact from a sub-step of a skill.
 *
 * Use when:
 * - A skill finishes a sub-step that the model can find useful, for example "crafted 4 oak planks".
 *
 * The fact goes to the logger and to the result of the action that runs the skill.
 * It never goes to game chat. Only the model writes what the character says.
 */
export function reportSkillProgress(message: string): void {
  logger.log(message)
  progressStorage.getStore()?.push(message)
}

/**
 * Runs a skill and collects the progress facts that it reports with {@link reportSkillProgress}.
 *
 * Returns:
 * - The skill result and the list of progress facts, in the order that the skill reported them.
 *
 * Throws:
 * - The error of the skill. An `ActionError` gets the progress facts in `context.progress`,
 *   so the model also sees the sub-steps that finished before the failure.
 */
export async function collectSkillProgress<T>(run: () => Promise<T>): Promise<{ result: T, progress: string[] }> {
  const progress: string[] = []
  try {
    const result = await progressStorage.run(progress, run)
    return { result, progress }
  }
  catch (error) {
    if (error instanceof ActionError && progress.length > 0)
      throw new ActionError(error.code, error.message, { ...error.context, progress })
    throw error
  }
}

/**
 * Adds progress facts to an action result, so they reach the model with the tool result.
 *
 * Before:
 * - `"Collected [stone] x3"` with progress `["Crafted a wooden pickaxe."]`
 *
 * After:
 * - `"Collected [stone] x3\nSub-steps: Crafted a wooden pickaxe."`
 */
export function withSkillProgress(result: unknown, progress: string[]): unknown {
  if (progress.length === 0)
    return result

  if (typeof result === 'string')
    return `${result}\nSub-steps: ${progress.join(' ')}`

  if (result && typeof result === 'object' && !Array.isArray(result))
    return { ...result, subSteps: progress }

  return { result, subSteps: progress }
}
