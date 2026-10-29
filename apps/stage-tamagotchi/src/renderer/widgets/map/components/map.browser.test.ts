import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'

import Map from './Map.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

describe('map widget', () => {
  it('shows no trip details that the model did not give', async () => {
    const screen = await render(Map, { props: { eta: '12 min' } })

    await expect.element(screen.getByText('12 min')).toBeVisible()
    const text = screen.container.textContent ?? ''
    for (const madeUp of ['Airport', 'Transit', 'Smooth ride', 'You', 'Midtown', 'Central', 'Skyline'])
      expect(text).not.toContain(madeUp)
    expect(screen.container.querySelectorAll('.map-stop')).toHaveLength(0)
  })

  it('shows the trip details that the model gave', async () => {
    const screen = await render(Map, {
      props: {
        destinationLabel: 'Harbor',
        mode: 'Walk',
        status: 'Light rain',
        stops: [{ x: 40, y: 50, label: 'Bridge' }],
      },
    })

    await expect.element(screen.getByText('To Harbor')).toBeVisible()
    await expect.element(screen.getByText('Walk')).toBeVisible()
    await expect.element(screen.getByText('Light rain')).toBeVisible()
    expect(screen.container.querySelectorAll('.map-stop')).toHaveLength(1)
  })
})
