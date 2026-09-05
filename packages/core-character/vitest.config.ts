import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/core-character',
    include: ['src/**/*.test.ts'],
  },
})
