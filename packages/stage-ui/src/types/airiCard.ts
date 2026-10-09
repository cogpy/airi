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
     * changes what the character does on its own, and each time it speaks up
     * costs a model call.
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
       * Without it the character quotes the user's earlier remark back to the
       * model as the thing to pick up; with it, repeated mentions of one
       * subject build a single, stronger memory.
       */
      nameTopics?: boolean
      /**
       * Whether she reflects on recent remarks now and then, keeping a few
       * insights she can use in later replies and bring up in a lull. Off by
       * default: each reflection is an extra model call, at most one every
       * five minutes.
       */
      reflect?: boolean
      /**
       * Whether a person can stop the character by talking over her. Off by
       * default.
       *
       * When on, the microphone keeps listening while she speaks, so voice
       * detection can hear an interruption. It does not transcribe during her
       * speech. With speakers instead of headphones, she may misjudge her own
       * echo at first. Until the echo gate has calibrated, she does not yield
       * at all.
       */
      yieldWhenInterrupted?: boolean
      /**
       * Whether the character talks with other AI agents on the server
       * channel. Off by default.
       *
       * When on, the stage publishes when she starts and stops speaking and
       * what she says, and answers what other agents on the channel say. Their
       * speech also counts as someone talking over her, so with
       * `yieldWhenInterrupted` she can yield to them too. Two characters that
       * both turn this on hold a conversation until one of them spends her
       * `agentTurnBudget`.
       */
      converseWithAgents?: boolean
      /**
       * Most agent turns she answers within two minutes, when
       * `converseWithAgents` is on. When it is spent she falls quiet, so a
       * conversation between two agents stops. `0` means she listens to
       * agents but never answers. Defaults to the conversation guard's own
       * budget of 6.
       */
      agentTurnBudget?: number
    }

    /**
     * Whether the character plays turn-based games with a partner. Off by
     * default.
     *
     * When on, a game can be started with the local user or with another AI
     * agent on the server channel, and the stage joins games that another
     * agent starts with her. On her turn she gets one model call to choose a
     * move; when she gives no legal move, a simple built-in policy moves for
     * her so the game never stalls. Each of her moves costs a model call.
     */
    coplay?: {
      enabled?: boolean
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
