<script setup lang="ts">
import type { CoplayBoardCell, CoplayBoardView } from '../../../libs/coplay'

import { BasicButton } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  board: CoplayBoardView
  /** Name read by screen readers for the whole grid. */
  label: string
  /** Her seat, so her marks are colored apart from the partner's. */
  characterSeat?: string
  /**
   * Whether squares can be played. The board offers a square only when it
   * also carries a move, so a square is never clickable when the game says
   * it is not legal.
   */
  interactive: boolean
}>()

const emit = defineEmits<{
  /** The move text of the square that was played, ready for `submitPartnerMove`. */
  move: [move: string]
}>()

const { t } = useI18n()

const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${props.board.columns}, minmax(0, 1fr))` }))

function isPlayable(cell: CoplayBoardCell) {
  return props.interactive && cell.move !== undefined
}

function cellLabel(cell: CoplayBoardCell) {
  return cell.mark
    ? t('settings.pages.modules.gaming-coplay.cell-marked', { cell: cell.label, mark: cell.mark })
    : t('settings.pages.modules.gaming-coplay.cell-empty', { cell: cell.label })
}

function play(cell: CoplayBoardCell) {
  if (isPlayable(cell) && cell.move)
    emit('move', cell.move)
}
</script>

<template>
  <div
    role="grid"
    :aria-label="label"
    :style="gridStyle"
    :class="[
      'grid gap-2',
      'w-full max-w-72 aspect-square',
    ]"
  >
    <BasicButton
      v-for="cell in board.cells"
      :key="cell.id"
      role="gridcell"
      size="unset"
      :aria-label="cellLabel(cell)"
      :disabled="!isPlayable(cell)"
      :class="[
        'aspect-square rounded-xl',
        'flex items-center justify-center',
        'text-3xl font-semibold',
        'transition-colors duration-200',
        // A taken square is part of the position, not an unavailable action,
        // so it keeps full contrast instead of the disabled fade.
        'disabled:opacity-100! disabled:cursor-default!',
        'border-2 border-neutral-200 dark:border-neutral-700',
        isPlayable(cell)
          ? 'bg-white hover:bg-primary-50 dark:bg-neutral-900 dark:hover:bg-primary-900/40 cursor-pointer'
          : 'bg-neutral-50 dark:bg-neutral-800/60',
        cell.seat !== undefined && cell.seat === characterSeat
          ? 'text-primary-600 dark:text-primary-300'
          : 'text-neutral-700 dark:text-neutral-200',
      ]"
      @click="play(cell)"
    >
      {{ cell.mark ?? '' }}
    </BasicButton>
  </div>
</template>
