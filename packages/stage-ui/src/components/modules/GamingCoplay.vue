<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { Button, Callout, FieldCheckbox, GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { listCoplayGames } from '../../libs/coplay'
import { useCoplayStore } from '../../stores/coplay'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { DEVICE_PARTICIPANT } from '../../stores/participants'
import { CoplayBoard } from '../scenarios/coplay'

const { t } = useI18n()
const coplayStore = useCoplayStore()
const cardStore = useAiriCardStore()
const { activeCard } = storeToRefs(cardStore)
const {
  status,
  partner,
  outcome,
  characterThinking,
  log,
  gameName,
  board,
  legalMoves,
  characterSeat,
  turn,
} = storeToRefs(coplayStore)

const games = listCoplayGames()
const selectedGameId = ref(games[0]?.id)
const characterMovesFirst = ref(true)
const startError = ref<string>()

const characterName = computed(() => activeCard.value?.name ?? '')
const isPlaying = computed(() => status.value === 'playing')
/** The local user can move only on their own turn, and only in a game against them. */
const canMove = computed(() => isPlaying.value && turn.value === 'partner' && partner.value?.origin === 'device')

/**
 * Co-play lives on the active Character Card, so the switch writes through
 * the card store's synchronized action instead of a local setting.
 */
const enabled = computed({
  get: () => coplayStore.enabled,
  set: (value: boolean) => {
    void cardStore.updateActiveCardCoplay({ enabled: value })
  },
})

const statusText = computed(() => {
  const prefix = 'settings.pages.modules.gaming-coplay.status'
  if (status.value === 'idle')
    return t(`${prefix}.idle`)

  const result = outcome.value
  if (result?.status === 'draw')
    return t(`${prefix}.draw`)
  if (result?.status === 'win') {
    if (result.seat === characterSeat.value)
      return t(`${prefix}.win-character`, { name: characterName.value })
    return partner.value?.origin === 'device'
      ? t(`${prefix}.win-you`)
      : t(`${prefix}.win-partner`, { name: partner.value?.name ?? '' })
  }

  if (status.value === 'over')
    return t(`${prefix}.stopped`)
  if (turn.value === 'character')
    return t(`${prefix}.character-turn`, { name: characterName.value })
  return partner.value?.origin === 'device'
    ? t(`${prefix}.your-turn`)
    : t(`${prefix}.waiting-partner`, { name: partner.value?.name ?? '' })
})

async function startGame() {
  startError.value = undefined
  try {
    await coplayStore.startSession({
      partner: { participantId: DEVICE_PARTICIPANT.id, origin: 'device', name: 'you' },
      gameId: selectedGameId.value,
      characterMovesFirst: characterMovesFirst.value,
    })
  }
  catch (error) {
    startError.value = errorMessageFrom(error) ?? 'Failed to start the game'
  }
}

function play(move: string) {
  if (canMove.value)
    coplayStore.submitPartnerMove(move)
}

/** One formatter for every log line, in the user's locale. */
const logTimeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
</script>

<template>
  <div :class="['w-full', 'flex flex-col gap-6']">
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.gaming-coplay.enable')"
      :description="t('settings.pages.modules.gaming-coplay.enable-description')"
    />

    <Callout v-if="!enabled" theme="orange" :label="t('settings.pages.modules.gaming-coplay.disabled.title')">
      {{ t('settings.pages.modules.gaming-coplay.disabled.description') }}
    </Callout>

    <template v-else>
      <div v-if="!isPlaying" :class="['flex flex-col gap-4']">
        <div v-if="games.length > 1" :class="['flex flex-col gap-2']">
          <span :class="['text-sm font-medium', 'text-neutral-600 dark:text-neutral-300']">
            {{ t('settings.pages.modules.gaming-coplay.game') }}
          </span>
          <div :class="['flex flex-wrap gap-2']">
            <GhostButton
              v-for="game in games"
              :key="game.id"
              :label="game.name"
              :active="selectedGameId === game.id"
              @click="selectedGameId = game.id"
            />
          </div>
        </div>

        <FieldCheckbox
          v-model="characterMovesFirst"
          :label="t('settings.pages.modules.gaming-coplay.character-first')"
          :description="t('settings.pages.modules.gaming-coplay.character-first-description')"
        />

        <div>
          <Button
            variant="primary"
            icon="i-solar:gamepad-bold-duotone"
            :label="t('settings.pages.modules.gaming-coplay.start')"
            @click="startGame"
          />
        </div>

        <Callout v-if="startError" theme="orange" :label="t('settings.pages.modules.gaming-coplay.start-failed')">
          {{ startError }}
        </Callout>

        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.gaming-coplay.agent-note') }}
        </p>
      </div>

      <div
        v-if="status !== 'idle'"
        :class="[
          'flex flex-col gap-4',
          'rounded-xl p-4',
          'bg-neutral-50 dark:bg-neutral-900/60',
        ]"
      >
        <div :class="['flex items-center justify-between gap-4']">
          <div :class="['flex flex-col gap-1']">
            <span :class="['text-lg font-semibold']">{{ gameName }}</span>
            <span
              aria-live="polite"
              :class="[
                'text-sm flex items-center gap-2',
                'text-neutral-600 dark:text-neutral-300',
              ]"
            >
              <span v-if="characterThinking" :class="['i-svg-spinners:3-dots-fade', 'size-4']" />
              {{ statusText }}
            </span>
          </div>
          <Button
            v-if="isPlaying"
            color="red"
            icon="i-solar:stop-circle-bold-duotone"
            :label="t('settings.pages.modules.gaming-coplay.stop')"
            @click="coplayStore.stopSession()"
          />
        </div>

        <CoplayBoard
          v-if="board"
          :board="board"
          :label="t('settings.pages.modules.gaming-coplay.board', { game: gameName })"
          :character-seat="characterSeat"
          :interactive="canMove"
          @move="play"
        />

        <!-- A game with no board view is played from its legal moves. -->
        <div v-else-if="canMove" :class="['flex flex-col gap-2']">
          <span :class="['text-sm font-medium']">{{ t('settings.pages.modules.gaming-coplay.moves') }}</span>
          <div :class="['flex flex-wrap gap-2']">
            <GhostButton
              v-for="move in legalMoves"
              :key="move"
              :label="move"
              @click="play(move)"
            />
          </div>
        </div>
      </div>

      <div v-if="status !== 'idle'" :class="['flex flex-col gap-2']">
        <span :class="['text-sm font-medium']">{{ t('settings.pages.modules.gaming-coplay.log.title') }}</span>
        <p v-if="log.length === 0" :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.gaming-coplay.log.empty') }}
        </p>
        <ol
          v-else
          :class="[
            'max-h-60 overflow-y-auto',
            'flex flex-col gap-1',
            'text-sm font-mono',
            'text-neutral-600 dark:text-neutral-300',
          ]"
        >
          <li v-for="(entry, index) in log" :key="`${entry.at}-${index}`">
            <span :class="['text-neutral-400 dark:text-neutral-500']">{{ logTimeFormat.format(entry.at) }}</span>
            {{ entry.text }}
          </li>
        </ol>
      </div>
    </template>
  </div>
</template>
