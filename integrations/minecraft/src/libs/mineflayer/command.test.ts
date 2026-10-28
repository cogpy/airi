import { describe, expect, it } from 'vitest'

import { describeCommandForModel } from './command'

// The command system never replies in game chat under her name. These notes go to the model with
// the chat line, so the model writes any reply.
describe('describeCommandForModel', () => {
  it('returns null for an ordinary chat line', () => {
    expect(describeCommandForModel('hello there', ['status'])).toBeNull()
  })

  it('gives the command list for #help', () => {
    expect(describeCommandForModel('#help', ['status', 'come']))
      .toBe('This chat line is a "#" bot command. The player asks which commands exist. Registered commands: #status, #come.')
  })

  it('tells the model when no handler exists for a command', () => {
    expect(describeCommandForModel('#dance now', []))
      .toBe('This chat line is a "#" bot command. No command handler exists for #dance. Registered commands: none.')
  })

  it('tells the model when a handler ran for a command', () => {
    expect(describeCommandForModel('#status', ['status']))
      .toBe('This chat line is a "#" bot command. A command handler ran for #status. Registered commands: #status.')
  })
})
