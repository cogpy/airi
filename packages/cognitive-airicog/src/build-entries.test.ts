import { describe, expect, it } from 'vitest'

interface PackageManifest {
  exports: Record<string, { default: string }>
}

interface BuildConfig {
  entry: string[]
}

describe('build entries', () => {
  // ROOT CAUSE:
  //
  // A subpath in `exports` without a tsdown entry is never built. Tests import
  // source and stay green, but an app that loads the package fails with
  // ERR_MODULE_NOT_FOUND. This happened for ./memory, then for ./coplay.
  //
  // We fixed this by comparing the exports map with the tsdown entry list.
  it('builds one entry for each subpath in the exports map', async () => {
    // Dynamic imports, because the package has no Node types and tsconfig rootDir is src.
    const { default: manifest } = await import(new URL('../package.json', import.meta.url).href) as { default: PackageManifest }
    const { default: config } = await import(new URL('../tsdown.config.ts', import.meta.url).href) as { default: BuildConfig }

    const expectedEntries = Object.values(manifest.exports)
      .map(target => target.default.replace(/^\.\/dist\//, './src/').replace(/\.mjs$/, '.ts'))
      .sort()

    expect([...config.entry].sort()).toEqual(expectedEntries)
  // Loading tsdown.config.ts also loads tsdown and its bundler. That takes
  // about 0.1 s warm, but a cold first run can pass the default 5 s timeout.
  }, 30_000)
})
