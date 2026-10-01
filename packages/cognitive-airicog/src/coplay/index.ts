/**
 * AiriCog Co-play Module
 *
 * Playing a turn-based game with the user or another agent: the game rules
 * contract, a session that enforces turns and keeps history, a fallback move
 * so the character never stalls a game, and tic-tac-toe as the reference game.
 */

export * from './fallback'
export * from './rules'
export * from './session'
export * from './tic-tac-toe'
