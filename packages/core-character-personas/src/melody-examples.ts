/* eslint-disable no-console -- This file is a demonstration script; printing the
   walkthrough to stdout is its entire purpose, so the repository's ban on
   console.log outside warn/error/info does not apply here. */

/**
 * Melody Ontogenetic Humour System - Example Usage
 *
 * This example shows how Melody's genome plans a multi-layered joke, how a
 * language model writes it, and how the genome learns from the response.
 * Every joke comes from the model. Without one, the examples show the
 * instruction that they would send.
 */

import type { HumourContext, JokeGenerator } from './melody-ontogenetic-humour'

import {
  constructLayeredJoke,
  createMelodyHumourGenome,
  detectHumourOpportunity,
  evaluateJokeFitness,
  evolveHumourGenome,
  jokeInstruction,
  planLayeredJoke,
} from './melody-ontogenetic-humour'

const contexts: Array<{ title: string, context: HumourContext }> = [
  { title: 'Supportive', context: { message: 'I\'m feeling a bit down today...', emotionalTone: 'supportive', audienceComfort: 0.5 } },
  { title: 'Playful', context: { message: 'I totally destroyed that boss fight! I\'m amazing!', emotionalTone: 'playful', audienceComfort: 0.8 } },
  { title: 'Tech talk', context: { message: 'Check out my new RTX 4090 setup!', emotionalTone: 'tech-enthusiastic', audienceComfort: 0.9 } },
]

/** Plans and, with a model, writes one joke for each context. */
async function exampleLayeredJokes(generate: JokeGenerator | undefined) {
  const genome = createMelodyHumourGenome()

  for (const { title, context } of contexts) {
    console.log(`\n=== ${title}: "${context.message}" ===\n`)

    if (!detectHumourOpportunity(context, genome)) {
      console.log('No humour opportunity. Melody answers without a joke.')
      continue
    }

    if (!generate) {
      console.log(jokeInstruction(planLayeredJoke(context, genome), context))
      continue
    }

    const joke = await constructLayeredJoke(context, genome, generate)
    if (!joke) {
      console.log('The model wrote nothing usable, so Melody makes no joke.')
      continue
    }
    console.log('Layers:', ['wholesome', ...(joke.plan.sarcastic ? ['sarcastic'] : []), ...(joke.plan.innuendo ? ['innuendo'] : [])].join(', '))
    console.log('Timing:', joke.plan.deliveryTiming, 'ms')
    console.log('Melody:', joke.text)
  }
}

/** Shows how the genome learns when the model's jokes land. */
async function exampleLearningFromFeedback(generate: JokeGenerator) {
  console.log('\n=== Ontogenetic Learning ===\n')

  let genome = createMelodyHumourGenome()
  console.log('Initial sarcasm:', genome.sarcasticDelivery)

  for (let i = 0; i < 3; i++) {
    const joke = await constructLayeredJoke({ message: 'I\'m the best!', emotionalTone: 'playful', audienceComfort: 0.8 }, genome, generate)
    if (!joke)
      continue

    // Treat each joke as one that landed, to show the genome moving.
    const fitness = evaluateJokeFitness(joke, { laughed: true, positiveReaction: true, comfortable: true })
    genome = evolveHumourGenome(genome, fitness, 'sarcastic')

    console.log(`\nIteration ${i + 1}: ${joke.text}`)
    console.log('  Fitness:', fitness.overallScore.toFixed(3), ' Sarcasm:', genome.sarcasticDelivery.toFixed(3))
  }
}

/** Runs the examples. Pass a generator to have a model write the jokes. */
async function runAllExamples(generate?: JokeGenerator) {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║  Melody Ontogenetic Humour System - Examples          ║')
  console.log('║  The genome plans the joke, and the model writes it    ║')
  console.log('╚════════════════════════════════════════════════════════╝')

  await exampleLayeredJokes(generate)
  if (generate)
    await exampleLearningFromFeedback(generate)
  else
    console.log('\nSet AIRI_EXAMPLES_BASE_URL and AIRI_EXAMPLES_MODEL to have a model write the jokes.')
}

export { runAllExamples }
