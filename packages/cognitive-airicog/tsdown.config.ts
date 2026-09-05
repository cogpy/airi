import { defineConfig } from 'tsdown'

// The package.json `exports` map advertises one entry per module, and the
// README imports through those subpaths. Without this list tsdown builds only
// src/index.ts, so every subpath resolves to a file that was never emitted.
export default defineConfig({
  entry: [
    './src/index.ts',
    './src/atomspace/index.ts',
    './src/attention/index.ts',
    './src/reasoning/index.ts',
    './src/orchestration/index.ts',
  ],
  sourcemap: true,
  unused: true,
  inlineOnly: false,
})
