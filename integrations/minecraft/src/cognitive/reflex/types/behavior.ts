import type { MineflayerWithAgents } from '../../types'
import type { ReflexContext } from '../context'
import type { ReflexModeId } from '../modes'

export interface ReflexApi {
  bot: MineflayerWithAgents
  context: ReflexContext
}

/**
 * How promptly the conscious brain must handle a reflex alert.
 *
 * - `urgent`: a survival or companion situation. The brain handles it at the highest event priority,
 *   also while `giveUp` is active.
 * - `ambient`: an idle observation. It has ordinary perception priority.
 */
export type ReflexAlertUrgency = 'urgent' | 'ambient'

/**
 * A situation that a reflex detected, for the conscious brain (the model) to act on.
 *
 * A reflex only perceives. It never acts on the body. The model reads the description and
 * chooses the action through its normal action tools.
 */
export interface ReflexAlert {
  /** Machine-readable situation, for example `in_lava` or `under_attack`. */
  kind: string
  urgency: ReflexAlertUrgency
  /** Plain description of the situation for the model, for example "A zombie is attacking you". */
  description: string
  metadata: Record<string, unknown>
}

export interface ReflexBehavior {
  id: string
  modes: ReflexModeId[]
  /** Minimum time between two alerts of this behavior. */
  cooldownMs?: number
  when: (ctx: ReturnType<ReflexContext['getSnapshot']>, api?: ReflexApi) => boolean
  score: (ctx: ReturnType<ReflexContext['getSnapshot']>, api?: ReflexApi) => number
  /** Describes the current situation. Returns null when the situation ended before the alert. */
  observe: (api: ReflexApi) => ReflexAlert | null
}
