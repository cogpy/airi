import type { App, ComputedRef } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAiriRuntimePrompt } from './use-airi-runtime-prompt'

const BUILT_IN_SAMPLE = '<|ACT {"emotion":"neutral"}|><|DELAY 1|> This sample line only shows the token\nformat. <|ACT {"emotion":"curious"}|><|DELAY 1|> A new token starts where the feeling changes.'

const apps: App[] = []

function mountPrompt(options: Parameters<typeof useAiriRuntimePrompt>[0]) {
  let prompt: ComputedRef<string> | undefined
  const app = createApp({
    setup() {
      prompt = useAiriRuntimePrompt(options)
      return () => null
    },
  })
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en } })).mount(document.createElement('div'))
  apps.push(app)
  if (!prompt)
    throw new Error('Runtime prompt did not initialize')
  return prompt
}

afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
})

describe('useAiriRuntimePrompt with the English messages', () => {
  it('shows the built-in sample where the emotion prompt introduces it', () => {
    const prompt = mountPrompt({}).value

    expect(prompt).toContain(`ACT payloads are JSON objects:\n\n${BUILT_IN_SAMPLE}\n\nACT JSON format`)
    expect(prompt).not.toContain('{example}')
  })

  it('uses the built-in sample when the card gives blank text', () => {
    const prompt = mountPrompt({ emotionExample: () => '  \n ' }).value

    expect(prompt).toContain(BUILT_IN_SAMPLE)
  })

  it('shows the card sample in place of the built-in one, unescaped', () => {
    const sample = '<|ACT {"emotion":"happy"}|> Hehe, a {curly} pipe | here.'
    const prompt = mountPrompt({ emotionExample: () => sample }).value

    expect(prompt).toContain(`ACT payloads are JSON objects:\n\n${sample}\n\nACT JSON format`)
    expect(prompt).not.toContain('only shows the token')
  })

  it('follows the sample when it changes', () => {
    const sample = ref('<|ACT {"emotion":"happy"}|> First.')
    const prompt = mountPrompt({ emotionExample: () => sample.value })

    expect(prompt.value).toContain('First.')

    sample.value = '<|ACT {"emotion":"sad"}|> Second.'

    expect(prompt.value).toContain('Second.')
    expect(prompt.value).not.toContain('First.')
  })
})
