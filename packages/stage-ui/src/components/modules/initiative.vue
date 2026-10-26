<script setup lang="ts">
import type { AiriInitiativeSettings } from '../../stores/modules/initiative'

import { createDefaultInitiativeConfig } from '@proj-airi/cognitive-airicog/initiative'
import { Callout, FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAiriCardStore } from '../../stores/modules/airi-card'

const { t } = useI18n()
const cardStore = useAiriCardStore()
const { activeCard } = storeToRefs(cardStore)

const settings = computed<AiriInitiativeSettings>(() => activeCard.value?.extensions?.airi?.modules?.initiative ?? {})

/**
 * One switch for one card setting. The settings live on the active Character
 * Card, so each write goes through the card store's synchronized action.
 */
function cardSetting<K extends keyof AiriInitiativeSettings>(key: K, fallback: NonNullable<AiriInitiativeSettings[K]>) {
  return computed({
    get: () => settings.value[key] ?? fallback,
    set: (value: NonNullable<AiriInitiativeSettings[K]>) => {
      void cardStore.updateActiveCardInitiative({ [key]: value })
    },
  })
}

const enabled = cardSetting('enabled', false)
const threshold = cardSetting('threshold', createDefaultInitiativeConfig().threshold)
const nameTopics = cardSetting('nameTopics', false)
const reflect = cardSetting('reflect', false)
const yieldWhenInterrupted = cardSetting('yieldWhenInterrupted', false)
const converseWithAgents = cardSetting('converseWithAgents', false)
</script>

<template>
  <div :class="['w-full', 'flex flex-col gap-6']">
    <Callout v-if="!activeCard" theme="orange" :label="t('settings.pages.modules.initiative.no-card')" />

    <template v-else>
      <div :class="['flex flex-col gap-4']">
        <FieldCheckbox
          v-model="enabled"
          :label="t('settings.pages.modules.initiative.enabled.label')"
          :description="t('settings.pages.modules.initiative.enabled.description')"
        />
        <FieldRange
          v-if="enabled"
          v-model.number="threshold"
          :min="0.05"
          :max="0.95"
          :step="0.05"
          :label="t('settings.pages.modules.initiative.threshold.label')"
          :description="t('settings.pages.modules.initiative.threshold.description')"
        />
        <FieldCheckbox
          v-model="nameTopics"
          :label="t('settings.pages.modules.initiative.name-topics.label')"
          :description="t('settings.pages.modules.initiative.name-topics.description')"
        />
        <FieldCheckbox
          v-model="reflect"
          :label="t('settings.pages.modules.initiative.reflect.label')"
          :description="t('settings.pages.modules.initiative.reflect.description')"
        />
      </div>

      <div :class="['flex flex-col gap-4']">
        <FieldCheckbox
          v-model="yieldWhenInterrupted"
          :label="t('settings.pages.modules.initiative.yield.label')"
          :description="t('settings.pages.modules.initiative.yield.description')"
        />
        <FieldCheckbox
          v-model="converseWithAgents"
          :label="t('settings.pages.modules.initiative.agents.label')"
          :description="t('settings.pages.modules.initiative.agents.description')"
        />
      </div>
    </template>
  </div>
</template>
