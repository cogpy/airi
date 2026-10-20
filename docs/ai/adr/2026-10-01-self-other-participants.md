# Participants: the character hears herself apart from others

Status: proposed. Phase 1 is implemented behind `initiative.yieldWhenInterrupted`, on the shared voice pipeline. Its done condition is not tested with real audio. Phase 2 is implemented behind `initiative.converseWithAgents`. It is not tested between two live stages. The phase 3 core is implemented behind `coplay.enabled`: a game-neutral session in `cognitive-airicog/coplay`, tic-tac-toe as the reference game, and the `output:game:session` and `output:game:action` events. Chess waits for the chess plugin source. No live game has been played.

## Context

Neuro-sama-style behavior needs three things that AIRI cannot do today:

- **Barge-in.** A person talks over the character, and she stops.
- **AI-to-AI conversation.** The character talks with another AI agent, not only with the user.
- **Co-play.** The character plays a game with the user or with another AI agent.

All three need the same capability. The character must know which sound and which event come from her, and which come from someone else.

AIRI has no such capability now:

- The desktop app stops voice input while the character speaks (`apps/stage-tamagotchi/src/renderer/pages/index.vue:751`). This prevents self-transcription, but it also prevents barge-in.
- Voice detection reads only the microphone. It has no reference signal for the character's own output (`packages/stage-ui/src/libs/audio/vad.ts:63`).
- Chromium echo cancellation does not reliably remove Web Audio output. `Stage.vue` plays speech through an `AudioBufferSourceNode` (`packages/stage-ui/src/components/scenes/Stage.vue:372`).
- The chat runtime knows the speaker only from a text prefix such as `(From Discord user …)` (`packages/stage-ui/src/stores/mods/api/context-bridge.ts:696`). User turns have no speaker field.
- The protocol has no speech-playback events. Another stage cannot know when this character speaks.
- `decideYield` has no input for the source of the overlap (`packages/cognitive-airicog/src/initiative/yielding.ts:19`).

These parts already exist and are not connected:

- `createBargeInController` and `bindBargeInToPlaybackManager` (`packages/stage-ui/src/libs/speech/barge-in.ts:69`, `:182`).
- The decoded `AudioBuffer` of each played item, available in every playback `onStart` event (`packages/pipelines-audio/src/types.ts:52`).
- An `AnalyserNode` on the speech output that nothing reads (`Stage.vue:706`).
- Per-user voice streams in the Discord bot (`integrations/discord-bot/src/bots/discord/commands/summon.ts:245`).

## Decision

Introduce one model for every source the character perceives: the **participant**.

A participant has an id and a kind:

- `self`: the character's own output. There is exactly one `self` participant per stage.
- `other`: everything else. An `other` participant has an origin: `device` (a local microphone or input device), `agent` (another AI agent), or `remote-user` (a person on Discord or another channel).

Each participant publishes the same three signals:

- **Activity**: speech start and speech end, with a timestamp.
- **Utterance**: the text of what the participant said, when it is known.
- **Action**: a game move or other non-speech act, when the participant takes one.

### Self channel

The voice store publishes the `self` participant from the speech output of each response turn. `observeSelfSpeech` wraps the `SpeechOutput` that the voice controller receives, next to `traceSpeechOutput`. On each clip start it publishes:

- the activity signal, with the turn id and the session id,
- the utterance text (`SpeechClip.text`),
- the decoded audio of a synthesized clip. The store turns it into an energy envelope in 10 ms frames.

This is an efference copy. The character knows what she said and when, without listening to it.

The clip's decoding starts when synthesis returns. It uses the same `decodeAudioData` path as speech tracing. A streaming provider emits each audio part as one Blob or as PCM blocks. A Blob part is decoded like a synthesized clip. Each PCM block that plays extends the clip's envelope (`appendSelfPlaybackAudio`).

The channel publishes only when the card of the turn's session sets `yieldWhenInterrupted` or `converseWithAgents`. It always publishes stops, because the store ignores clips that it never saw.

### Echo separation

The microphone participant uses the self channel to separate the character's echo from other speech. Phase 1 uses residual-energy gating:

1. Delay the self envelope by the measured output-to-input latency.
2. Scale it by an echo gain that the stage learns during single-talk (self active, no other speech).
3. Count microphone speech as `other` only when the microphone energy exceeds the predicted echo by a margin.

This is double-talk detection, not echo cancellation. It decides who is talking. It does not clean the audio for transcription. Transcription stays suppressed while the character speaks, as it is now.

The gate is the external echo classifier of the voice pipeline. The voice activity plugin calls `acceptSpeech` for each window that can start an input. When the active session's card sets `yieldWhenInterrupted`, the voice store's check is:

```text
accepted = (!nowSpeaking || echoCancellation) || classifier.accept
```

The first part is the pipeline's own rule. The classifier can only turn a rejection into an acceptance. Without the card setting, the check is the pipeline's rule only.

The classifier (`createEchoClassifier`) splits the window into 10 ms frames and gives each frame's RMS to the gate. It accepts when the gate judges 5 consecutive frames `other`. A gap between windows, or a frame that is not `other`, starts the count again.

**Clock.** Self playback times are `Date.now()` when a clip's first audio is scheduled. A microphone window has only sample positions. The classifier dates a frame as `offset + endSample * 1000 / sampleRate`. Per source, `offset` is the smallest `now - windowEnd * 1000 / sampleRate` seen so far. That is the arrival time of a sample with the smallest queue and detection delay. The estimate can rise by 1 ms per second, so a slow microphone clock does not leave it behind. The gate's `latencyMs` (80 ms) and `latencyToleranceMs` (60 ms) cover output buffering, the air path, and input buffering.

A full acoustic echo canceller can replace the gate later, behind the same interface. Options include WebRTC loopback playback or a WASM echo canceller. Per AGENTS.md, the user selects the library before that work starts.

### Turn-taking

The voice pipeline owns barge-in. When it accepts speech, it interrupts the active turns of the session. The echo classifier only decides whether the microphone speech is someone other than her.

`decideYield` keeps its input for the participant that overlaps. The barge-in controller in `libs/speech/barge-in.ts` is not connected to the voice pipeline. Yielding to agent speech is not connected either. Agent activity reaches the participants store, but nothing interrupts her for it.

### Agent participants

A stage publishes its `self` signals to the server channel as new events:

- `output:speech:activity` (start and end, with the participant id),
- `output:speech:utterance` (text, with the participant id).

Another stage subscribes to them and creates an `other` participant with origin `agent`. Its utterances go into the chat runtime as user turns with a structured speaker field, not a text prefix. The Discord prefix moves to the same field.

Two agents can talk to each other without a person. Each one must have a loop guard. The initiative refractory gap already limits unprompted turns. A turn budget over a sliding time window limits replies (`decideAgentReply`, default 6 replies in 2 minutes).

### Co-play

A game is a shared environment, not a participant. The game publishes state, and each participant publishes actions into it. The character perceives:

- game state, through the existing `context:update` lane `game`,
- partner actions, as `action` signals from `other` participants,
- partner speech, through the same channels as conversation.

She acts through game tools, as the chess gamelet does now (`packages/plugin-sdk-tamagotchi/src/kits/gamelet/index.ts:68`). A partner can be the user (origin `device`) or another agent (origin `agent`). The game does not need to know which.

The first game is chess. It is turn-based, so it needs no low-latency action, and it already has a gamelet and a tool kit. A human partner and an agent partner use the same game state and the same move format.

## Ownership

- `packages/cognitive-airicog/src/initiative` owns the policy: `decideYield` with the overlap source, and the loop guard for agent conversation. It stays free of Vue and audio code.
- `packages/stage-ui/src/libs/participants` owns the pure parts: the participant types, the energy envelope, the echo gate, and the echo classifier with its clock. These are new.
- A new unsynchronized Pinia store in `packages/stage-ui/src/stores/participants.ts` owns runtime state: the active participants, their activity, and the learned echo state. Each renderer has its own audio, so this state must not be synchronized across windows.
- `packages/stage-ui/src/composables/speech-output-self-channel.ts` owns the self channel. The voice store applies it to each turn's speech output, because the voice store gives that output to the voice controller.
- `packages/stage-ui/src/stores/voice.ts` owns the device check. Its `acceptSpeech` default asks the participants store, because the voice store builds the voice activity plugin.
- The context bridge (`stores/mods/api/context-bridge.ts`) owns the agent channel in both directions. It already owns the server channel and the receiving side. It sends self activity only when the speaking session's card sets `converseWithAgents`.
- `packages/plugin-protocol` owns the new speech events.
- The chess plugin owns the game state and the move tools.

## Phases

1. **Self channel and barge-in.** Self channel, envelope, echo gate, and the echo classifier as the voice pipeline's echo check. Off by default. Done when a person can stop the character with speakers on, and the character does not stop herself during a 10-minute monologue.
2. **Agent participants.** Speech events in the protocol, agent participants, structured speaker field, loop guard. Done when two stages hold a conversation that stops within the turn budget.
3. **Co-play.** Chess with a human partner, then with an agent partner, through one game interface.

Each phase ships on its own and keeps the earlier default behavior unless a card turns the new behavior on.

## Non-goals

- No speaker diarization in one microphone stream. One device is one participant.
- No change to transcription quality during double-talk. Phase 1 decides who talks. It does not clean the audio.
- No in-browser model inference. That is a separate decision, deferred by the user.
- No new games other than chess in this record.

## Open questions

- **Echo canceller library.** The user selects one before an echo canceller replaces the phase 1 gate.
- **Chess plugin source.** This checkout has only `plugins/airi-plugin-game-chess/package.json`. Phase 3 needs the plugin source.
- **Agent identity.** Phase 2 assumes the other agent is another AIRI stage on the same server channel. External agents need an adapter that publishes the same two events.

## Module dependencies

```mermaid
graph TD
  SpeechOutput[voice store speech output] -->|observeSelfSpeech self signals| Participants[participants store]
  VoiceActivity[voice activity plugin acceptSpeech] -->|microphone windows| Participants
  ServerChannel[server channel speech events] -->|agent signals| Participants
  Participants --> EchoGate[libs/participants echo gate and classifier]
  Participants -->|self activity| Bridge[context bridge]
  Bridge -->|output:speech events| ServerChannel
  Participants --> Chat[chat runtime speaker field]
  Chat --> LoopGuard[airicog loop guard]
  Game[chess gamelet] -->|context:update game| Chat
  Participants -->|action signals| Game
```

## Affected files

```text
packages/cognitive-airicog/src/initiative/
  yielding.ts
  conversation-guard.ts            (new)
packages/cognitive-airicog/src/coplay/  (new)
packages/stage-ui/src/
  libs/participants/               (new)
  libs/coplay/                     (new)
  stores/participants.ts           (new)
  stores/coplay.ts                 (new)
  composables/speech-output-self-channel.ts  (new)
  stores/voice.ts
  stores/chat.ts
  stores/mods/api/context-bridge.ts
  types/airiCard.ts
packages/plugin-protocol/src/types/events.ts
packages/core-agent/src/runtime/chat-orchestrator-runtime.ts
apps/stage-tamagotchi/src/renderer/pages/index.vue
integrations/discord-bot/src/adapters/airi-adapter.ts
plugins/airi-plugin-game-chess/
```
