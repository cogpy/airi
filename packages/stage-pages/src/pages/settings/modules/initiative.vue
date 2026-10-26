<script setup lang="ts">
import { Initiative } from '@proj-airi/stage-ui/components'
</script>

<template>
  <Initiative />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.initiative.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
