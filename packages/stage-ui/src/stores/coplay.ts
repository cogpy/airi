import type { GameOutcome, GamePlayer } from '@proj-airi/cognitive-airicog/coplay'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import type { CoplayBoardView, CoplayTable, TableMoveResult } from '../libs/coplay'

import { errorMessageFrom } from '@moeru/std'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { characterTurnPrompt, createGameMoveTool, findCoplayGame, gameContextMessage, rejectionText } from '../libs/coplay'
import { useChatStore } from './chat'
import { useChatContextStore } from './chat/context-store'
import { useModsServerChannelStore } from './mods/api/channel-server'
import { useAiriCardStore } from './modules/airi-card'
import { useConsciousnessStore } from './modules/consciousness'
import { useParticipantsStore } from './participants'

type GameSessionEventData = WebSocketEventOf<'output:game:session'>['data']
type GameActionEventData = WebSocketEventOf<'output:game:action'>['data']

/**
 * Who plays against the character.
 *
 * - `device`: the person at this stage. Their moves come from
 *   {@link useCoplayStore}'s `submitPartnerMove`, typed or picked in a UI.
 * - `agent`: another AI stage on the server channel. Its moves arrive as
 *   `output:game:action` events through the context bridge.
 */
export interface CoplayPartner {
  participantId: string
  origin: 'device' | 'agent'
  /** Name the character uses for the partner. */
  name?: string
}

/** One line of the game log a UI can show. */
export interface CoplayLogEntry {
  at: number
  /**
   * - `started` / `joined`: a game began here, or this stage joined a peer's.
   * - `move`: someone's move was accepted.
   * - `fallback`: she gave no legal move, so the fallback policy moved for her.
   * - `rejected`: a submitted move was refused; the game did not change.
   * - `ended`: the game reached a result or was stopped.
   */
  kind: 'started' | 'joined' | 'move' | 'fallback' | 'rejected' | 'ended'
  text: string
}

/**
 * Whether a session is being played.
 *
 * - `idle`: no game has been started since the store was created.
 * - `playing`: moves are accepted, and her turns are requested.
 * - `over`: the game has a result or was stopped. The last table stays for a
 *   UI to show the final position until the next game starts.
 */
export type CoplayStatus = 'idle' | 'playing' | 'over'

/** Legal moves while no game is in play; shared so a UI never sees a new empty array. */
const NO_MOVES: readonly string[] = Object.freeze([])

/** Log lines kept for a UI. Older lines are dropped first. */
const LOG_LIMIT = 200

/**
 * Seats the character at a turn-based game with a partner, and plays her side.
 *
 * Not synchronized across windows. One renderer, the host, owns a session:
 * the one where a UI called {@link startSession}, or the one that won the
 * session lock when a peer's game was joined. It alone asks the character to
 * move and publishes her moves, so a game is never played twice by two
 * windows of one stage.
 *
 * State model:
 *
 * - Table (runtime state). The game in play, behind text; see
 *   `libs/coplay/table`. Replaced by the next game, never mutated from
 *   outside except through submitted moves.
 * - Status, view and outcome (runtime state, reactive). `view` is the game
 *   from her seat as text and `outcome` the result so far. Both are refreshed
 *   after every accepted move, because the table itself is not reactive.
 * - Ownership (Web Lock). `coplay:session:<sessionId>` is held while the
 *   game is `playing` and released when it is `over`. Without Web Locks
 *   (tests, older runtimes) every window owns what it starts or joins.
 * - Character turn (runtime state). `characterThinking` is true while her
 *   model call for the current ply runs. At most one call is made per ply.
 * - Game context (chat context registry). After every accepted move, the
 *   position from her seat replaces the previous one in lane `game`, so her
 *   next model call sees it whether or not it is about the game.
 *
 * How a UI drives it:
 *
 * 1. Start: `startSession({ partner: { participantId: DEVICE_PARTICIPANT.id,
 *    origin: 'device', name: 'you' } })` for the local user, or with an
 *    agent's participant id and `origin: 'agent'` for another stage. She
 *    moves first unless `characterMovesFirst` is false.
 * 2. Show `view`, `status`, `outcome`, `characterThinking` and `log`.
 * 3. On the user's move, call `submitPartnerMove(text)`; a rejected result
 *    carries the reason to show. Her reply comes on its own.
 * 4. Stop with `stopSession()`. Turning `modules.coplay.enabled` off on the
 *    active card stops the game too.
 */
export const useCoplayStore = defineStore('coplay', () => {
  const participantsStore = useParticipantsStore()
  const { activeCard } = storeToRefs(useAiriCardStore())
  const chatStore = useChatStore()
  const chatContext = useChatContextStore()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel, activeTemperature, activeTopP } = storeToRefs(consciousnessStore)
  const serverChannelStore = useModsServerChannelStore()

  /**
   * Whether the active card plays games. Off by default: nothing can be
   * started, and peers' games are not joined.
   */
  const enabled = computed(() => activeCard.value?.extensions?.airi?.modules?.coplay?.enabled ?? false)

  const table = shallowRef<CoplayTable>()
  const partner = ref<CoplayPartner>()
  const status = ref<CoplayStatus>('idle')
  const view = ref('')
  const outcome = ref<GameOutcome>()
  const characterThinking = ref(false)
  const log = ref<CoplayLogEntry[]>([])
  /** Name of the game in play or last played, for a UI heading. */
  const gameName = ref('')
  /** The position as a grid, or `undefined` for a game with no board view. */
  const board = shallowRef<CoplayBoardView>()
  /** Legal moves for whoever moves next, as text; empty once the game is over. */
  const legalMoves = shallowRef<readonly string[]>(NO_MOVES)
  /** Her seat, so a UI can tell her marks from the partner's. */
  const characterSeat = ref<string>()
  /**
   * Who moves next while a game is played: `character` while her move is
   * being asked for, `partner` while a UI or a peer should move, `undefined`
   * once the game is over.
   */
  const turn = ref<'character' | 'partner'>()

  let releaseOwnership: (() => void) | undefined
  /** Ply her model call was last made for; guards against a second call. */
  let requestedPly = -1

  const isPlaying = computed(() => status.value === 'playing')

  function selfId() {
    return participantsStore.stageParticipantId
  }

  function partnerName() {
    if (partner.value?.name)
      return partner.value.name
    return partner.value?.origin === 'agent' ? 'another agent' : 'the user'
  }

  function selfSeat(current: CoplayTable): string {
    // Every table this store opens seats her exactly once.
    return current.players.find(player => player.kind === 'self')!.seat
  }

  function record(kind: CoplayLogEntry['kind'], text: string) {
    // Partner names such as "you" can open a line, which still reads as a sentence.
    const sentence = text.charAt(0).toUpperCase() + text.slice(1)
    log.value = [...log.value, { at: Date.now(), kind, text: sentence }].slice(-LOG_LIMIT)
  }

  /**
   * Holds the session lock for as long as the game is played, so only one
   * window of this stage plays it. Resolves to the release function, or to
   * `undefined` when another window already holds it.
   */
  function claimOwnership(sessionId: string): Promise<(() => void) | undefined> {
    if (typeof navigator === 'undefined' || !('locks' in navigator) || typeof navigator.locks.request !== 'function')
      return Promise.resolve(() => {})

    return new Promise((resolve) => {
      void navigator.locks.request(`coplay:session:${sessionId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(undefined)
          return undefined
        }
        // The lock is held until this promise settles, which is when the
        // owner calls the release function it was given.
        return new Promise<void>(release => resolve(release))
      })
    })
  }

  function publishSession(current: CoplayTable, phase: 'start' | 'end', reason?: string) {
    if (partner.value?.origin !== 'agent')
      return
    serverChannelStore.send({
      type: 'output:game:session',
      data: {
        sessionId: current.sessionId,
        gameId: current.gameId,
        participantId: selfId(),
        name: activeCard.value?.name,
        phase,
        seats: current.players.map(player => ({ seat: player.seat, participantId: player.participantId })),
        ...(reason ? { reason } : {}),
        at: Date.now(),
      },
    })
  }

  /** Republishes her view of the game to the UI and to the chat context. */
  function refresh(current: CoplayTable) {
    view.value = current.describe(selfSeat(current))
    outcome.value = current.outcome()
    gameName.value = current.gameName
    board.value = current.board()
    legalMoves.value = current.legalMoves()
    characterSeat.value = selfSeat(current)
    const next = current.currentPlayer()
    turn.value = next === undefined ? undefined : next.kind === 'self' ? 'character' : 'partner'
    chatContext.ingestContextMessage(gameContextMessage(current, selfSeat(current), partnerName()))
  }

  /** Ends the game here. Idempotent: a second call does nothing. */
  function finish(text: string) {
    if (status.value !== 'playing')
      return
    status.value = 'over'
    // A stopped game keeps its last position on the board, but nobody moves.
    turn.value = undefined
    legalMoves.value = NO_MOVES
    record('ended', text)
    releaseOwnership?.()
    releaseOwnership = undefined
  }

  function seat(current: CoplayTable, nextPartner: CoplayPartner, release: () => void) {
    releaseOwnership?.()
    table.value = current
    partner.value = nextPartner
    status.value = 'playing'
    requestedPly = -1
    releaseOwnership = release
  }

  /**
   * Applies the consequences of one accepted move, whoever made it: log,
   * view, game context, her published move, the end of the game, and her
   * next turn.
   */
  function afterAccepted(current: CoplayTable, result: Extract<TableMoveResult, { status: 'accepted' }>, kind: 'move' | 'fallback', note?: string) {
    const mover = result.participantId === selfId() ? 'She' : partnerName()
    record(kind, `${mover} played ${result.move}${note ? ` (${note})` : ''}.`)
    refresh(current)

    if (result.participantId === selfId() && partner.value?.origin === 'agent') {
      serverChannelStore.send({
        type: 'output:game:action',
        data: { sessionId: current.sessionId, gameId: current.gameId, participantId: selfId(), move: result.move, at: Date.now() },
      })
    }

    const { outcome: gameOutcome } = result
    if (gameOutcome.status === 'draw') {
      finish('The game is a draw.')
      return
    }
    if (gameOutcome.status === 'win') {
      const winner = current.players.find(player => player.seat === gameOutcome.seat)
      finish(winner?.kind === 'self' ? 'She won.' : `${partnerName()} won.`)
      return
    }

    if (current.currentPlayer()?.participantId === selfId())
      void askCharacterToMove(current)
  }

  /** Whether `current` is still the game in play here. */
  function isLive(current: CoplayTable) {
    return table.value === current && status.value === 'playing'
  }

  /**
   * Her turn: one model call with the `game_move` tool, then the fallback
   * policy if the call ended without a legal move.
   *
   * The tool submits whatever she names. A rejected move is answered to the
   * model with the reason and the legal moves, so she can try again in the
   * same turn. When the call ends and it is still her turn at the same ply,
   * because she skipped the tool, kept naming illegal moves, or the call
   * failed, the fallback policy moves for her and the log says why. The game
   * therefore never waits on the model.
   */
  async function askCharacterToMove(current: CoplayTable) {
    const ply = current.ply()
    if (!isLive(current) || requestedPly === ply || current.currentPlayer()?.participantId !== selfId())
      return
    requestedPly = ply

    let lastRejection: string | undefined
    let failure: string | undefined
    const tool = createGameMoveTool(current, (move) => {
      if (!isLive(current))
        return { status: 'rejected', reason: 'game-over' }

      const result = current.submitText(selfId(), move)
      if (result.status === 'accepted') {
        afterAccepted(current, result, 'move')
        return result
      }
      lastRejection = `"${move}": ${rejectionText(result.reason)}`
      record('rejected', `She named ${lastRejection}.`)
      return result
    })

    characterThinking.value = true
    try {
      const providerId = activeProvider.value
      const model = activeModel.value
      if (!providerId || !model) {
        failure = 'no chat model is configured'
      }
      else {
        const chatProvider = await consciousnessStore.getChatProviderInstance(providerId)
        await chatStore.ingest(characterTurnPrompt(current, selfSeat(current), partnerName()), {
          model,
          chatProvider,
          temperature: activeTemperature.value,
          topP: activeTopP.value,
          tools: [tool],
        })
      }
    }
    catch (error) {
      failure = errorMessageFrom(error) ?? 'the model call failed'
    }
    finally {
      characterThinking.value = false
    }

    if (!isLive(current) || current.ply() !== ply)
      return

    const result = current.submitFallback(selfId())
    if (result.status !== 'accepted')
      return
    const why = failure ?? (lastRejection ? `her last move was ${lastRejection}` : 'she named no move')
    console.info('[coplay] Fallback move:', { sessionId: current.sessionId, move: result.move, why })
    afterAccepted(current, result, 'fallback', `chosen for her: ${why}`)
  }

  /**
   * Starts a game between the character and `partner`, hosted by this window.
   *
   * Throws when the active card has co-play off, a game is already being
   * played, the game id is unknown, or the partner is the character herself.
   * With an agent partner, the start is published as `output:game:session`
   * so the partner's stage can join under the same session id.
   *
   * @default options.gameId 'tic-tac-toe'
   * @default options.characterMovesFirst true
   */
  async function startSession(options: { partner: CoplayPartner, gameId?: string, characterMovesFirst?: boolean }): Promise<CoplayTable> {
    if (!enabled.value)
      throw new Error('Co-play is off for the active character card')
    if (isPlaying.value)
      throw new Error('A game is already being played; stop it first')

    const game = findCoplayGame(options.gameId ?? 'tic-tac-toe')
    if (!game)
      throw new Error(`Unknown game "${options.gameId}"`)
    if (options.partner.participantId === selfId())
      throw new Error('The character cannot play against herself')

    const self: Omit<GamePlayer, 'seat'> = { participantId: selfId(), kind: 'self' }
    const other: Omit<GamePlayer, 'seat'> = { participantId: options.partner.participantId, kind: 'other' }
    const order = (options.characterMovesFirst ?? true) ? [self, other] : [other, self]
    const sessionId = `coplay:${nanoid()}`
    const current = game.open(sessionId, game.seats.map((seatName, index) => ({ ...order[index]!, seat: seatName })))

    // A fresh session id cannot be held by another window.
    const release = await claimOwnership(sessionId) ?? (() => {})
    seat(current, { ...options.partner }, release)
    record('started', `${current.gameName} with ${partnerName()} started.`)
    publishSession(current, 'start')
    refresh(current)
    void askCharacterToMove(current)
    return current
  }

  /**
   * Joins a game that another stage started with this character, from its
   * `output:game:session` start. Resolves to whether this window joined.
   *
   * Ignored (resolves `false`) when co-play is off, a game is already being
   * played, the game is unknown, this stage holds no seat, the publisher holds
   * no seat, or another window of this stage already joined it.
   */
  async function joinSession(event: GameSessionEventData): Promise<boolean> {
    if (!enabled.value || isPlaying.value || event.phase !== 'start')
      return false

    const game = findCoplayGame(event.gameId)
    const ownId = selfId()
    if (!game
      || !event.seats.some(seated => seated.participantId === ownId)
      || !event.seats.some(seated => seated.participantId === event.participantId)) {
      return false
    }

    const release = await claimOwnership(event.sessionId)
    if (!release)
      return false
    // Another start may have been accepted while the lock was requested.
    if (isPlaying.value || !enabled.value) {
      release()
      return false
    }

    let current: CoplayTable
    try {
      current = game.open(event.sessionId, event.seats.map(seated => ({
        seat: seated.seat,
        participantId: seated.participantId,
        kind: seated.participantId === ownId ? 'self' : 'other',
      })))
    }
    catch (error) {
      release()
      console.warn('[coplay] Not joining a game that does not fit its rules:', errorMessageFrom(error))
      return false
    }

    seat(current, { participantId: event.participantId, origin: 'agent', name: event.name }, release)
    record('joined', `Joined ${current.gameName} with ${partnerName()}.`)
    refresh(current)
    void askCharacterToMove(current)
    return true
  }

  /**
   * Plays a move the partner stage published. Returns the result, or
   * `undefined` when the event is not for the game played here: another
   * session id, no game, or the game is over.
   *
   * A rejected move means the two stages disagree about the game. It is
   * logged and dropped; the game here is unchanged.
   */
  function receivePartnerAction(event: GameActionEventData): TableMoveResult | undefined {
    const current = table.value
    if (!current || !isLive(current) || current.sessionId !== event.sessionId || event.participantId === selfId())
      return undefined

    const result = current.submitText(event.participantId, event.move)
    if (result.status === 'accepted') {
      afterAccepted(current, result, 'move')
      return result
    }

    record('rejected', `${partnerName()}'s move "${event.move}" was refused: ${rejectionText(result.reason)}. The two stages may be out of step.`)
    console.warn('[coplay] Rejected partner move:', { sessionId: event.sessionId, move: event.move, reason: result.reason })
    return result
  }

  /** Stops the game played here when its partner stage stopped it. */
  function receiveSessionEnd(event: GameSessionEventData) {
    const current = table.value
    if (!current || !isLive(current) || current.sessionId !== event.sessionId || event.participantId === selfId())
      return
    finish(`${partnerName()} stopped the game${event.reason ? ` (${event.reason})` : ''}.`)
  }

  /**
   * Plays the local user's move. Throws when no game is being played or the
   * partner is another agent, whose moves arrive from the server channel.
   * A rejected move returns its reason and changes nothing.
   */
  function submitPartnerMove(text: string): TableMoveResult {
    const current = table.value
    if (!current || !isLive(current) || !partner.value)
      throw new Error('No game is being played')
    if (partner.value.origin !== 'device')
      throw new Error('The partner is another agent; its moves arrive from the server channel')

    const result = current.submitText(partner.value.participantId, text)
    if (result.status === 'accepted')
      afterAccepted(current, result, 'move')
    else
      record('rejected', `${partnerName()} named "${text}": ${rejectionText(result.reason)}.`)
    return result
  }

  /**
   * Stops the game played here. With an agent partner, the stop is published
   * so the partner's stage stops too. A move she is still thinking about is
   * dropped: the tool refuses it once the game is over.
   */
  function stopSession(reason = 'stopped') {
    const current = table.value
    if (!current || !isLive(current))
      return
    publishSession(current, 'end', reason)
    finish(`The game was stopped (${reason}).`)
  }

  watch(enabled, (on) => {
    if (!on)
      stopSession('co-play turned off')
  })

  return {
    enabled,
    status,
    partner,
    view,
    outcome,
    characterThinking,
    log,
    gameName,
    board,
    legalMoves,
    characterSeat,
    turn,

    startSession,
    joinSession,
    receivePartnerAction,
    receiveSessionEnd,
    submitPartnerMove,
    stopSession,
  }
})
