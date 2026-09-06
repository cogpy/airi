import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/memory-timecrystal',
    include: ['src/**/*.test.ts'],
  },
})
