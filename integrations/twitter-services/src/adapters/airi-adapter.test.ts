import type { WebSocketEvents } from '@proj-airi/server-sdk'

import type { Context } from '../core/browser/context'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { data: unknown }) => Promise<void> | void>(),
  send: vi.fn(),
  postTweet: vi.fn(async () => 'tweet-id'),
  likeTweet: vi.fn(async () => true),
  retweet: vi.fn(async () => true),
  searchTweets: vi.fn(async () => []),
  getUserProfile: vi.fn(),
  getTimeline: vi.fn(async () => []),
}))

vi.mock('@proj-airi/server-sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@proj-airi/server-sdk')>()

  class Client {
    onEvent(event: string, handler: (event: { data: unknown }) => Promise<void> | void) {
      mocks.handlers.set(event, handler)
    }

    send(payload: unknown) {
      mocks.send(payload)
      return true
    }
  }

  return { ...original, Client }
})

vi.mock('../core/services/tweet', () => ({
  useTwitterTweetServices: () => ({
    postTweet: mocks.postTweet,
    likeTweet: mocks.likeTweet,
    retweet: mocks.retweet,
    searchTweets: mocks.searchTweets,
  }),
}))
vi.mock('../core/services/timeline', () => ({
  useTwitterTimelineServices: () => ({ getTimeline: mocks.getTimeline }),
}))
vi.mock('../core/services/user', () => ({
  useTwitterUserServices: () => ({ getUserProfile: mocks.getUserProfile }),
}))
vi.mock('../core/browser/context', () => ({
  initBrowser: vi.fn(),
  useContext: vi.fn(),
  useSessionFileAsync: vi.fn(),
}))

const { AiriAdapter } = await import('./airi-adapter')

function sparkCommand(metadata: Record<string, unknown>, lane = 'x'): WebSocketEvents['spark:command'] {
  return {
    id: 'command-event',
    commandId: 'command-1',
    interrupt: false,
    priority: 'normal',
    intent: 'action',
    contexts: [{ id: 'ctx-1', contextId: 'ctx-1', lane, strategy: ContextUpdateStrategy.AppendSelf, text: 'X action', metadata }],
  }
}

describe('airiAdapter', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    vi.clearAllMocks()
    // eslint-disable-next-line no-new
    new AiriAdapter({} as Context, { credentials: {} })
  })

  // ROOT CAUSE:
  //
  // Any `input:text` that started with `post tweet:` was posted word for word on her X account.
  // The adapter must not act on raw input. Only the character (the model) requests X actions.
  it('does not act on input:text', () => {
    expect(mocks.handlers.has('input:text')).toBe(false)
    expect(mocks.postTweet).not.toHaveBeenCalled()
  })

  it('posts only the tweet text that the model wrote in a spark:command', async () => {
    await mocks.handlers.get('spark:command')!({ data: sparkCommand({ action: 'post', text: 'Model-written tweet' }) })

    expect(mocks.postTweet).toHaveBeenCalledWith('Model-written tweet')
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'spark:emit',
      data: expect.objectContaining({ eventId: 'command-1', state: 'done' }),
    }))
  })

  it('likes and retweets the tweet IDs that the model chose', async () => {
    await mocks.handlers.get('spark:command')!({ data: sparkCommand({ action: 'like', tweetId: '123' }) })
    await mocks.handlers.get('spark:command')!({ data: sparkCommand({ action: 'retweet', tweetId: '456' }) })

    expect(mocks.likeTweet).toHaveBeenCalledWith('123')
    expect(mocks.retweet).toHaveBeenCalledWith('456')
  })

  it('ignores spark:command events that are not for X', async () => {
    await mocks.handlers.get('spark:command')!({ data: sparkCommand({ action: 'post', text: 'Hello' }, 'game') })
    await mocks.handlers.get('spark:command')!({ data: sparkCommand({ action: 'post', text: '   ' }) })

    expect(mocks.postTweet).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('reports a failed action to the model as context, not as a post', async () => {
    mocks.postTweet.mockRejectedValueOnce(new Error('rate limited'))

    await mocks.handlers.get('spark:command')!({ data: sparkCommand({ action: 'post', text: 'Hi' }) })

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'spark:emit',
      data: expect.objectContaining({ state: 'dropped', note: 'rate limited' }),
    }))
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'context:update',
      data: expect.objectContaining({ lane: 'x', text: expect.stringContaining('rate limited') }),
    }))
  })

  it('publishes the X capabilities to the character after authentication', async () => {
    await mocks.handlers.get('module:authenticated')!({ data: { authenticated: true } })

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'context:update',
      data: expect.objectContaining({ contextId: 'x:capabilities', lane: 'x' }),
    }))
  })
})
