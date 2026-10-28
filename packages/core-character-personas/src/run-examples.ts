#!/usr/bin/env tsx
/**
 * Run the character examples for this package.
 *
 * Melody's jokes come from an OpenAI-compatible chat model. Set
 * `AIRI_EXAMPLES_BASE_URL` (for example `http://localhost:11434/v1/`),
 * `AIRI_EXAMPLES_MODEL`, and, if the server needs one, `AIRI_EXAMPLES_API_KEY`.
 */
import type { JokeGenerator } from './melody-ontogenetic-humour'

import process from 'node:process'

import { runAllAionExamples } from './aion-examples'
import { runAllExamples } from './melody-examples'

function chatCompletionGenerator(baseURL: string, model: string, apiKey: string | undefined): JokeGenerator {
  return async (instruction) => {
    const response = await fetch(new URL('chat/completions', baseURL), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: instruction }] }),
    })
    if (!response.ok)
      throw new Error(`Chat completion failed: ${response.status} ${response.statusText}`)
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    return body.choices?.[0]?.message?.content ?? ''
  }
}

const { AIRI_EXAMPLES_BASE_URL: baseURL, AIRI_EXAMPLES_MODEL: model, AIRI_EXAMPLES_API_KEY: apiKey } = process.env

runAllExamples(baseURL && model ? chatCompletionGenerator(baseURL, model, apiKey) : undefined)
  .then(runAllAionExamples)
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
