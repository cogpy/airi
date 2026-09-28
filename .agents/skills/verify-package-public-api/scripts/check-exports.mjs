#!/usr/bin/env node
// Proves that every subpath in a package's `exports` map actually resolves.
//
// A green build is not evidence: tsdown emits whatever its entry list names, and
// `exports` points wherever it points. The two drift apart silently, and the only
// symptom is a module-not-found in a consumer. So load each target for real.
//
// Usage:
//   node check-exports.mjs packages/<name>
//   node check-exports.mjs packages/<name> ./atomspace=createAtomSpace .=createAiriCog
//
// Extra arguments pin an expected symbol to a subpath; a subpath with no pin only
// has to load and expose something.

import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const NODE_MODULE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'])

const [packageDir, ...pins] = process.argv.slice(2)

if (!packageDir) {
  console.error('usage: check-exports.mjs <package-dir> [<subpath>=<symbol> ...]')
  process.exit(2)
}

// One subpath may be pinned to several symbols, so collect rather than overwrite.
const expected = new Map()
for (const pin of pins) {
  const separator = pin.indexOf('=')
  if (separator === -1) {
    console.error(`bad pin ${pin} — expected <subpath>=<symbol>`)
    process.exit(2)
  }
  const subpath = pin.slice(0, separator)
  const symbol = pin.slice(separator + 1)
  expected.set(subpath, [...(expected.get(subpath) ?? []), symbol])
}

const root = resolve(packageDir)
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
// A string `exports` value is the package's single "." entry.
const exportsMap = typeof pkg.exports === 'string'
  ? { '.': pkg.exports }
  : pkg.exports ?? {}

if (Object.keys(exportsMap).length === 0) {
  console.error(`${pkg.name} declares no exports — nothing to check`)
  process.exit(2)
}

let failed = false

for (const [subpath, entry] of Object.entries(exportsMap)) {
  // A string entry is its own target; an object entry carries conditions.
  const target = typeof entry === 'string' ? entry : entry.default ?? entry.import
  if (!target) {
    failed = true
    console.error(`FAIL ${subpath} — no default/import condition to load`)
    continue
  }

  const pinned = expected.get(subpath) ?? []

  // Node can only evaluate JavaScript modules. Other public targets (JSON, CSS,
  // fonts, worklets, wildcards) are sound when the file or parent directory exists.
  if (!isNodeModuleTarget(target)) {
    if (!targetExists(root, target)) {
      failed = true
      console.error(`FAIL ${subpath} -> ${target} — file not found`)
    }
    else if (pinned.length > 0) {
      failed = true
      console.error(`FAIL ${subpath} -> ${target} — missing ${pinned.join(', ')}`)
    }
    else {
      console.log(`ok   ${subpath} -> ${target}`)
    }
    continue
  }

  try {
    const module = await import(pathToFileURL(resolve(root, target)).href)
    const names = Object.keys(module)
    const missing = pinned.filter(name => !names.includes(name))

    if (missing.length > 0) {
      failed = true
      console.error(`FAIL ${subpath} -> ${target} — missing ${missing.join(', ')}`)
    }
    else if (names.length === 0) {
      failed = true
      console.error(`FAIL ${subpath} -> ${target} — loads but exports nothing`)
    }
    else {
      console.log(`ok   ${subpath} -> ${target} [${names.length} exports]`)
    }
  }
  catch (error) {
    failed = true
    console.error(`FAIL ${subpath} -> ${target} — ${error.message}`)
  }
}

// Pins name APIs the caller asked us to prove. A missing subpath is the
// documented-but-never-declared failure this check exists to catch.
for (const subpath of expected.keys()) {
  if (!Object.hasOwn(exportsMap, subpath)) {
    failed = true
    console.error(`FAIL ${subpath} — not declared in exports`)
  }
}

const total = Object.keys(exportsMap).length
console.log(failed ? '\nexports are NOT sound' : `\nall ${total} ${total === 1 ? 'export resolves' : 'exports resolve'}`)
process.exit(failed ? 1 : 0)

function isNodeModuleTarget(target) {
  if (target.includes('*') || target.includes('.worklet.'))
    return false
  return NODE_MODULE_EXTENSIONS.has(extname(target))
}

function targetExists(root, target) {
  if (!target.includes('*'))
    return existsSync(resolve(root, target))

  const prefix = target.slice(0, target.indexOf('*'))
  const slash = prefix.lastIndexOf('/')
  return existsSync(resolve(root, slash === -1 ? '.' : prefix.slice(0, slash)))
}
