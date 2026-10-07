<script setup lang="ts">
import { GamingCoplay } from '@proj-airi/stage-ui/components'
</script>

<template>
  <GamingCoplay />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.gaming-coplay.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
