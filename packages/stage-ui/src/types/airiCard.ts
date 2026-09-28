import type { Card } from '@proj-airi/ccc'

/**
 * AIRI-specific runtime configuration embedded in a character card.
 *
 * The extension is persisted with the card. Editor surfaces must preserve
 * fields they do not own so independent runtime modules can evolve without
 * losing each other's configuration.
 */
export interface AiriExtension {
  modules: {
    consciousness: {
      provider: string
      model: string
    }

    vision: {
      provider: string
      model: string
    }

    speech: {
      provider: string
      model: string
      voice_id: string

      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
    }

    vrm?: {
      source?: 'file' | 'url'
      file?: string
      url?: string
    }

    live2d?: {
      source?: 'file' | 'url'
      file?: string
      url?: string
    }

    /** ID from the display-models store. */
    displayModelId?: string
    activeBackgroundId?: string

    artistry?: {
      enabled?: boolean
      provider?: string
      model?: string
      promptPrefix?: string
      workflowId?: string
      widgetInstruction?: string
      spawnMode?: 'bg' | 'widget' | 'inline' | 'bg_widget'
      options?: Record<string, unknown>
      autonomousEnabled?: boolean
      autonomousThreshold?: number
      autonomousTarget?: 'user' | 'assistant'
    }

    /**
     * Whether the character speaks during a lull instead of only answering.
     *
     * Off unless a card turns it on, like `artistry.autonomousEnabled`: this
     * changes what the character does on its own, and naming the subjects it
     * would raise costs a model call per turn.
     */
    initiative?: {
      enabled?: boolean
      /**
       * Urge at or above which the character speaks, `0` to `1`. Higher is more
       * reticent. Defaults to the initiative module's own threshold.
       */
      threshold?: number
      /** Shortest gap between two unprompted turns, in seconds. */
      refractorySeconds?: number
      /**
       * Whether to spend a model call naming the subject of each message.
       * Without it the character can tell a lull from a conversation but has
       * nothing of its own to raise.
       */
      nameTopics?: boolean
    }
  }

  agents: Record<string, {
    prompt: string
    enabled?: boolean
  }>
}

/** Character card normalized with the AIRI extension required by the runtime. */
export interface AiriCard extends Card {
  extensions: {
    airi: AiriExtension
  } & Card['extensions']
}
