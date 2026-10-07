# Stage UI

Shared core for stage

## Character-card module settings

The card store owns three distinct states:

- `moduleDefaults` stores global provider, model, voice, and display selections.
- Each card stores explicit overrides. An empty string means inherit.
- Module stores expose the resolved runtime selections used by the application.

Use `configureForAuthentication` for login and logout. It updates global
defaults, then reapplies the active card without saving defaults into that card.
Use card commands for activation and explicit edits. Settings pages must not
save cards from watchers: authentication and remote snapshots also trigger them.
The synchronization leader owns these commands; followers receive snapshots.

Models inherit only within the same provider. Voices also require the same
model. A different provider without a model stays unconfigured rather than
receiving an unrelated model id. The editor requires a model for an explicit
chat or vision provider unless that model can be inherited safely.

Defaults are seeded once from the current runtime on upgrade. This cannot
recover historical global values that an older card already overwrote.
Existing `speech-noop` selections are preserved because they may represent
intentional silence. Users can explicitly choose **Inherit global settings**
in the editor; importing or saving an unrelated card field does not change it.

## Participants and barge-in

`libs/participants` and `stores/participants.ts` tell the character's own voice
apart from other speakers. The stage publishes each played item as the `self`
participant, with a loudness envelope. The microphone is the `device`
participant. The echo gate compares the microphone with the delayed envelope
and decides whether someone else is talking over her. The barge-in controller
in `Stage.vue` then asks `decideYield` whether she stops.

The feature is off by default. A card turns it on with
`modules.initiative.yieldWhenInterrupted`. Use it when a person should be able
to stop her by talking. Do not use it to transcribe double-talk: the gate does
not clean the audio, and transcription stays suppressed while she speaks. With
speakers, she does not yield until the gate has learned her echo level.

The store is not synchronized across windows, because each window has its own
audio. See `docs/ai/adr/2026-10-01-self-other-participants.md`.

## Co-play

`stores/coplay.ts` lets the character play a turn-based game with the local
user or with another AIRI stage. The rules and turn order come from
`@proj-airi/cognitive-airicog/coplay`; `libs/coplay` opens a game by id and
turns it into text for the model, the user, and the server channel. Only
tic-tac-toe ships today, as the reference game.

The feature is off by default. A card turns it on with
`modules.coplay.enabled`, which the Co-play settings page
(`/settings/modules/gaming-coplay`, component `GamingCoplay`) sets through
`updateActiveCardCoplay`. A UI calls `startSession`, shows `board` (a grid
from the game's board view, drawn by `CoplayBoard`) or `view` and
`legalMoves` for a game without one, follows `turn` and `log`, and passes the
user's moves to `submitPartnerMove`. On her turn the store makes
one model call with a `game_move` tool. When she gives no legal move, a fixed
fallback policy moves for her and the log says so. With another stage, both
stages play the same moves under one session id through `output:game:session`
and `output:game:action`. One window of a stage owns a game; the store is not
synchronized across windows.

## Button analytics

Register the shared plugin once in each Vue application:

```ts
import { trackButtonPlugin } from '@proj-airi/stage-ui/directives/track-button'

createApp(App)
  .use(trackButtonPlugin)
  .mount('#app')
```

Buttons that represent a product-analysis click intent can then declare a
typed event without wrapping their business handler:

```vue
<Button
  v-track-button="{ name: 'update_check_clicked', channel: selectedChannel }"
  @click="checkForUpdates()"
/>
```

Keep async outcomes, confirmed state changes, impressions, and lifecycle events
in their owning business flows instead of attaching them to the initial click.

## Histoire (UI storyboard)

https://histoire.dev/

```shell
pnpm -F @proj-airi/stage-ui run story:dev
```

The **Misc → Swipe Actions** story renders one row with two start actions and three end actions. Its **Show labels** control switches between
text labels and surfaces that fill the available height. Use this story to
compare gesture presentation, not conversation storage behavior.

### Project structure

1. If a story is bound to a specific component, it can be placed beside the component in the `src` folder. e.g., `MyComponent.story.vue`
2. If a story is not bound to a specific component, then it should be placed in the `stories` folder. e.g., `MyStory.story.vue`
