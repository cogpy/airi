export interface CommandContext {
  sender: string
  isCommand: boolean
  command: string
  args: string[]
}

export function parseCommand(sender: string, message: string): CommandContext {
  const isCommand = message.startsWith('#')
  const command = message.split(' ')[0]
  const args = message.split(' ').slice(1)
  return { sender, isCommand, command, args }
}

/**
 * Describes a `#` command chat line for the model, so the model writes any reply to it.
 *
 * Use when:
 * - A player chat line reaches the brain. The command system itself never replies in game chat.
 *
 * Returns:
 * - A note with the command status and the registered command list, or null when the line is not a command.
 *
 * Before:
 * - `"#help"` with `["status"]`
 *
 * After:
 * - `'This chat line is a "#" bot command. The player asks which commands exist. Registered commands: #status.'`
 */
export function describeCommandForModel(message: string, registeredCommands: string[]): string | null {
  const { isCommand, command } = parseCommand('', message)
  if (!isCommand)
    return null

  const name = command.slice(1)
  const list = registeredCommands.length > 0
    ? registeredCommands.map(registered => `#${registered}`).join(', ')
    : 'none'

  let status: string
  if (registeredCommands.includes(name))
    status = `A command handler ran for #${name}.`
  else if (name === 'help')
    status = 'The player asks which commands exist.'
  else
    status = `No command handler exists for #${name}.`

  return `This chat line is a "#" bot command. ${status} Registered commands: ${list}.`
}
