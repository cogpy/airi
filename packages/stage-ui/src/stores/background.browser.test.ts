import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'
import localforage from 'localforage'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { useBackgroundStore } from './background'
import { useAiriCardStore } from './modules/airi-card'

let app: App | undefined
let pinia: ReturnType<typeof createPinia> | undefined

/** Creates the store in a component setup, where the card store can use i18n. */
function mountStore() {
  let store: ReturnType<typeof useBackgroundStore> | undefined
  pinia = createPinia()
  app = createApp({
    setup() {
      useAiriCardStore()
      store = useBackgroundStore()
      return () => null
    },
  })
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en } })).mount(document.createElement('div'))
  if (!store)
    throw new Error('Background store did not initialize')
  return store
}

afterEach(async () => {
  app?.unmount()
  if (pinia)
    disposePinia(pinia)
  await localforage.clear()
})

function imageBlob() {
  return new Blob([new Uint8Array([0])], { type: 'image/png' })
}

describe('background store titles', () => {
  it('keeps a journal image without a model title untitled', async () => {
    const store = mountStore()

    const id = await store.addBackground('journal', imageBlob(), '  ', 'a lighthouse at dusk', 'card-1')

    expect(store.entries.get(id)?.title).toBe('')
  })

  it('keeps the model title of a journal image', async () => {
    const store = mountStore()

    const id = await store.addBackground('journal', imageBlob(), ' Lighthouse ', 'a lighthouse at dusk', 'card-1')

    expect(store.entries.get(id)?.title).toBe('Lighthouse')
  })

  it('labels a user scene upload without a name', async () => {
    const store = mountStore()

    const id = await store.addBackground('scene', imageBlob(), '')

    expect(store.entries.get(id)?.title).toBe('Untitled Background')
  })
})
