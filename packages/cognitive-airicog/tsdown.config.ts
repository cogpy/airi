import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'atomspace/index': 'src/atomspace/index.ts',
    'attention/index': 'src/attention/index.ts',
    'reasoning/index': 'src/reasoning/index.ts',
    'orchestration/index': 'src/orchestration/index.ts',
    'ontogenesis/index': 'src/ontogenesis/index.ts',
  },
  dts: true,
})
