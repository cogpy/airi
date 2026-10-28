import type { Action } from '../../libs/mineflayer'
import type { Mineflayer } from '../../libs/mineflayer/core'

import { collectSkillProgress, withSkillProgress } from '../../skills/progress'
import { actionsList } from './llm-actions'

/**
 * ActionRegistry provides a centralized registry for all available actions
 * and replaces the deprecated actionAgent pattern
 */
export class ActionRegistry {
  private actions: Action[]
  private mineflayer: Mineflayer | null = null

  constructor() {
    this.actions = actionsList
  }

  /**
   * Set the mineflayer instance for action execution
   */
  public setMineflayer(mineflayer: Mineflayer): void {
    this.mineflayer = mineflayer
  }

  /**
   * Get all available actions
   */
  public getAvailableActions(): Action[] {
    return [...this.actions]
  }

  /**
   * Perform an action by name
   */
  public async performAction(step: { description?: string, tool: string, params: any }): Promise<unknown> {
    if (!this.mineflayer) {
      throw new Error('Mineflayer instance not set in ActionRegistry')
    }

    const action = this.actions.find(a => a.name === step.tool)
    if (!action) {
      throw new Error(`Unknown action: ${step.tool}`)
    }

    const actionFn = action.perform(this.mineflayer)
    const { schema } = action
    const parsedParams = schema.parse(step.params || {})

    // Extract parameter values in the order defined by the schema
    const paramValues = Object.keys((schema as any).shape || {}).map(key => parsedParams[key])

    // Skills report sub-step facts (for example "Crafted 4 oak planks.") through the progress
    // collector instead of game chat. They go back to the model as part of the tool result.
    const { result, progress } = await collectSkillProgress(async () => actionFn(...paramValues))
    return withSkillProgress(result ?? `Action ${step.tool} completed`, progress)
  }

  /**
   * Register a new action
   */
  public registerAction(action: Action): void {
    this.actions.push(action)
  }

  /**
   * Get action by name
   */
  public getAction(name: string): Action | undefined {
    return this.actions.find(a => a.name === name)
  }
}
