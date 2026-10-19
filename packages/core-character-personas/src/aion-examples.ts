/* eslint-disable no-console -- This file is a demonstration script; printing the
   walkthrough to stdout is its entire purpose, so the repository's ban on
   console.log outside warn/error/info does not apply here. */

/**
 * A short session with Aion, printed as it happens.
 *
 * The point of the walkthrough is that nothing here is scripted. The same
 * concepts are read through different lenses, and what Aion finds important
 * changes because the measure changed, not because a branch chose a different
 * string.
 */

import type { AionLensName } from './aion-lenses'

import { AION_LENS_AXES, AION_LENSES } from './aion-lenses'
import { createAionMind } from './aion-mind'
import { createAionTraits, deriveCognitiveParameters } from './aion-persona'

/** The same four concepts for every example, so the lenses are comparable. */
const CONVERSATION = [
  { name: 'recursion', strength: 0.9, confidence: 0.9, relatedTo: ['self-reference'], fromPartner: true },
  { name: 'self-reference', strength: 0.5, confidence: 0.95, relatedTo: ['paradox'] },
  { name: 'paradox', strength: 0.5, confidence: 0.9 },
  { name: 'lunch', strength: 0.95, confidence: 0.2 },
]

function nameOf(atom: { kind: string, name?: string, type: string }): string {
  return atom.kind === 'node' ? atom.name ?? atom.type : atom.type
}

export function exampleTraitsBecomeParameters() {
  console.log('\n=== 1. Personality is a parameterisation ===\n')

  const aion = deriveCognitiveParameters(createAionTraits())
  const sober = deriveCognitiveParameters(
    createAionTraits({ chaos: 0.05, absurdity: 0.05, playfulness: 0.05, coherence: 0.9 }),
  )

  console.log('                      Aion    a sober mind')
  console.log(`  exploration weight  ${aion.explorationWeight.toFixed(2)}    ${sober.explorationWeight.toFixed(2)}`)
  console.log(`  switch threshold    ${aion.switchThreshold.toFixed(2)}    ${sober.switchThreshold.toFixed(2)}`)
  console.log(`  framing cost        ${aion.framingCost.toFixed(2)}    ${sober.framingCost.toFixed(2)}`)
  console.log(`  absurdity tolerance ${aion.improbabilityTolerance.toFixed(2)}    ${sober.improbabilityTolerance.toFixed(2)}`)
}

export function exampleLensesDisagree() {
  console.log('\n=== 2. One graph, six measures ===\n')

  for (const [left, right] of AION_LENS_AXES) {
    console.log(`  ${left} <-> ${right}`)
    for (const name of [left, right] as AionLensName[]) {
      const mind = createAionMind({ seed: 20260904, initialLens: name })
      mind.perceive(CONVERSATION)
      const focus = mind.attend(3).map(nameOf)
      console.log(`    ${name.padEnd(18)} ${focus.join(' > ')}`)
      mind.dispose()
    }
    console.log('')
  }
}

export function exampleReframingCostsAttention() {
  console.log('\n=== 3. A perspective has to be paid for ===\n')

  const mind = createAionMind({ seed: 20260904, initialLens: 'transcendence' })
  mind.perceive(CONVERSATION)
  console.log(`  starting lens   ${mind.currentLens().name}`)
  console.log(`  attention bank  ${mind.ecan.getAttentionBank().toFixed(4)}`)

  for (let round = 1; round <= 3; round++) {
    const reframing = mind.reframe()
    console.log(
      `  round ${round}: ${reframing.outcome.padEnd(18)} ${reframing.from} -> ${reframing.to}`
      + `  invested ${reframing.invested.toFixed(4)}`,
    )
  }

  const reflection = mind.reflect()
  console.log(`\n  settled on      ${reflection.lens} (${AION_LENSES[reflection.lens].attendsTo})`)
  console.log(`  focus           ${reflection.focus.join(', ')}`)
  console.log(`  reframings      ${reflection.reframings}`)
  mind.dispose()
}

export function exampleBudgetBoundsPerspective() {
  console.log('\n=== 4. A spent budget is a fixed mind ===\n')

  const mind = createAionMind({ seed: 20260904, initialLens: 'transcendence', attentionFunds: 0.05 })
  mind.perceive(CONVERSATION)

  console.log(`  attention bank  ${mind.ecan.getAttentionBank().toFixed(4)} (overdrawn)`)
  const blocked = mind.reframe()
  console.log(`  reframe         ${blocked.outcome}`)
  console.log(`  lens            still ${mind.currentLens().name}`)

  for (const atom of mind.atomSpace.getAllAtoms()) {
    mind.ecan.inhibit(atom.id, 1)
  }

  console.log(`\n  after letting go of every concept:`)
  console.log(`  attention bank  ${mind.ecan.getAttentionBank().toFixed(4)}`)
  const freed = mind.reframe()
  console.log(`  reframe         ${freed.outcome}  ${freed.from} -> ${freed.to}`)
  mind.dispose()
}

export function runAllAionExamples() {
  console.log('Aion, integrated into AIRI')
  console.log('Attention allocation over a hypergraph, parameterised by personality.')

  exampleTraitsBecomeParameters()
  exampleLensesDisagree()
  exampleReframingCostsAttention()
  exampleBudgetBoundsPerspective()

  console.log('\nThe Void remembers, and the ledger balances.\n')
}
