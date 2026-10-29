import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import JournalToolCallBlock from './journal-tool-call-block.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => disposePinia(pinia))

/** Renders the block and opens the tool call shell, which starts closed. */
async function renderBlock(props: { toolName: string, args: object, state?: 'executing' | 'done' | 'error' }) {
  const screen = await render(JournalToolCallBlock, {
    props: { toolName: props.toolName, args: JSON.stringify(props.args), state: props.state },
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  await screen.getByRole('button').first().click()
  return screen
}

describe('journal tool call block', () => {
  it('shows only the model text when a text journal entry has no title', async () => {
    const screen = await renderBlock({ toolName: 'text_journal', args: { action: 'create', content: 'The rain came back tonight.' }, state: 'done' })

    await expect.element(screen.getByText('The rain came back tonight.')).toBeVisible()
    expect(screen.container.textContent).not.toContain('Journal Entry')
  })

  it('shows the model title when the text journal entry has one', async () => {
    const screen = await renderBlock({ toolName: 'text_journal', args: { action: 'create', title: 'Rain', content: 'It came back.' }, state: 'done' })

    await expect.element(screen.getByRole('heading', { name: 'Rain' })).toBeVisible()
  })

  it('does not say the entry is saved while the tool runs', async () => {
    const screen = await renderBlock({ toolName: 'text_journal', args: { action: 'create', content: 'A note.' }, state: 'executing' })

    await expect.element(screen.getByText('Saving to long-term memory')).toBeVisible()
    expect(screen.container.textContent).not.toContain('Saved to long-term memory')
  })

  it('says the entry is saved after the tool is done', async () => {
    const screen = await renderBlock({ toolName: 'text_journal', args: { action: 'create', content: 'A note.' }, state: 'done' })

    await expect.element(screen.getByText('Saved to long-term memory')).toBeVisible()
  })

  it('shows only the model prompt for an image entry with no title, and no fixed footer', async () => {
    const screen = await renderBlock({ toolName: 'image_journal', args: { action: 'create', prompt: 'a lighthouse at dusk', mode: 'widget' }, state: 'executing' })

    await expect.element(screen.getByText('a lighthouse at dusk')).toBeVisible()
    expect(screen.container.textContent).not.toContain('Untitled Image')
    expect(screen.container.textContent).not.toContain('Spawning an artistry widget')
  })
})
