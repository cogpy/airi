import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/cognitive-airicog',
    include: ['src/**/*.test.ts'],
  },
})
