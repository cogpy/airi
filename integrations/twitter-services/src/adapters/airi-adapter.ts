import type { Context } from '../core/browser/context'
import type { Tweet } from '../core/services/tweet'
import type { TwitterServices } from '../types/services'
import type { XAction } from './x-spark-actions'

import { randomUUID } from 'node:crypto'

import * as fs from 'node:fs/promises'

/**
 * Airi Adapter
 * Adapts the X service as an Airi module
 */
import { errorMessageFrom } from '@moeru/std'
import { Client, ContextUpdateStrategy } from '@proj-airi/server-sdk'

import { getDefaultConfig } from '../config/types'
import { initBrowser, useContext, useSessionFileAsync } from '../core/browser/context'
import { useTwitterTimelineServices } from '../core/services/timeline'
import { useTwitterTweetServices } from '../core/services/tweet'
import { useTwitterUserServices } from '../core/services/user'
import { logger } from '../utils/logger'
import { findXActionInSparkCommand, X_ACTION_LANE, xCapabilityContextText } from './x-spark-actions'

export interface AiriAdapterConfig {
  url?: string
  token?: string
  credentials: {
    apiKey?: string
    apiSecret?: string
    accessToken?: string
    accessTokenSecret?: string
  }
}

export interface XConfig {
  apiKey?: string
  apiSecret?: string
  accessToken?: string
  accessTokenSecret?: string
}

export class AiriAdapter {
  private client: Client
  private ctx: Context
  private twitterServices: TwitterServices
  private config: AiriAdapterConfig

  constructor(ctx: Context, config: AiriAdapterConfig) {
    this.ctx = ctx
    this.config = config
    this.client = new Client({
      name: 'x',
      url: config.url || 'ws://localhost:6121/ws',
      token: config.token,
      possibleEvents: [
        'module:authenticate',
        'module:authenticated',
        'module:announce',
        'ui:configure',
        'spark:command',
        'spark:emit',
        'context:update',
      ],
    })

    this.twitterServices = {
      timeline: useTwitterTimelineServices(this.ctx),
      tweet: useTwitterTweetServices(this.ctx),
      user: useTwitterUserServices(this.ctx),
    }

    // Set up event handlers
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Handle configuration from UI
    this.client.onEvent('ui:configure', async (event) => {
      if (event.data && event.data.moduleName === 'x' && event.data.config && isXConfig(event.data.config)) {
        logger.main.log('Received configuration from UI for X module')
        logger.main.log('Twitter configuration received:', event.data.config)

        // Check if any credentials have changed
        const newCreds = event.data.config
        const credKeys: (keyof AiriAdapterConfig['credentials'])[] = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret']
        const credsChanged = credKeys.some(key => key in newCreds && newCreds[key] !== this.config.credentials[key])

        if (credsChanged) {
          // Update the configuration with the new credentials
          this.config.credentials = {
            ...this.config.credentials,
            ...newCreds,
          }

          logger.main.log('X credentials updated from configuration, re-initializing session.')

          // If Twitter API keys are provided, we might need to re-authenticate
          // For now, we'll clear the session to force re-authentication
          // since the session might be tied to the previous API credentials
          try {
            // Close existing browser context and create a new one with fresh session
            if (this.ctx.browser)
              await this.ctx.browser.close()
            await this.reinitializeBrowserContext()

            logger.main.log('Browser context reinitialized with new credentials')
          }
          catch (error) {
            logger.main.errorWithError('Failed to reinitialize browser context with new credentials:', error)
          }
        }
      }
      else if (event.data && event.data.moduleName === 'x') {
        // Log error if config is not valid
        logger.main.error('Invalid configuration received for X module')
      }
    })

    // The adapter does not act on `input:text`. User text goes to the character (the model).
    // The character requests X actions with `spark:command`, and the adapter does only those actions.
    this.client.onEvent('spark:command', async (event) => {
      const action = findXActionInSparkCommand(event.data)
      if (!action)
        return

      await this.handleXAction(event.data.commandId, action)
    })

    // Handle authentication
    this.client.onEvent('module:authenticated', async (event) => {
      if (event.data.authenticated) {
        logger.main.log('X module authenticated with AIRI server')
        this.publishCapabilities()
      }
      else {
        logger.main.warn('X module authentication failed')
      }
    })
  }

  /**
   * Tells the character which X actions she can request.
   */
  private publishCapabilities(): void {
    this.client.send({
      type: 'context:update',
      data: {
        id: randomUUID(),
        contextId: 'x:capabilities',
        lane: X_ACTION_LANE,
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: xCapabilityContextText,
      },
    })
  }

  /**
   * Sends the result of an X action back to the character as context.
   *
   * The text is data for the model. The model decides what to say about it.
   */
  private publishResult(commandId: string, text: string): void {
    this.client.send({
      type: 'context:update',
      data: {
        id: randomUUID(),
        contextId: `x:result:${commandId}`,
        lane: X_ACTION_LANE,
        strategy: ContextUpdateStrategy.AppendSelf,
        text,
      },
    })
  }

  private sendEmit(commandId: string, state: 'queued' | 'done' | 'dropped', note: string): void {
    this.client.send({
      type: 'spark:emit',
      data: {
        id: randomUUID(),
        eventId: commandId,
        state,
        note,
        destinations: ['proj-airi:stage-*'],
      },
    })
  }

  /**
   * Runs one X action that the character requested.
   *
   * All tweet text comes from the action, which the model wrote.
   */
  private async handleXAction(commandId: string, action: XAction): Promise<void> {
    this.sendEmit(commandId, 'queued', `X action ${action.action} received`)

    try {
      const result = await this.runXAction(action)
      logger.main.log(`X action ${action.action} done`)
      this.sendEmit(commandId, 'done', `X action ${action.action} done`)
      this.publishResult(commandId, result)
    }
    catch (error: unknown) {
      const message = errorMessageFrom(error) ?? 'Unknown error'
      logger.main.errorWithError(`X action ${action.action} failed:`, error)
      this.sendEmit(commandId, 'dropped', message)
      this.publishResult(commandId, `Your X action "${action.action}" failed: ${message}`)
    }
  }

  private async runXAction(action: XAction): Promise<string> {
    switch (action.action) {
      case 'post': {
        await this.twitterServices.tweet.postTweet(action.text)
        return `You posted this tweet on X: ${action.text}`
      }
      case 'like': {
        await this.twitterServices.tweet.likeTweet(action.tweetId)
        return `You liked the tweet ${action.tweetId} on X.`
      }
      case 'retweet': {
        await this.twitterServices.tweet.retweet(action.tweetId)
        return `You retweeted the tweet ${action.tweetId} on X.`
      }
      case 'search': {
        const tweets = await this.twitterServices.tweet.searchTweets(action.query)
        return [
          `X search results for "${action.query}" (${tweets.length} tweets):`,
          ...tweets.slice(0, 5).map((t: Tweet) => `- [${t.id}] @${t.author.username}: ${t.text.substring(0, 200)}`),
        ].join('\n')
      }
      case 'user': {
        const profile = await this.twitterServices.user.getUserProfile(action.username)
        return [
          `X profile of @${profile.username}:`,
          `Display name: ${profile.displayName}`,
          `Bio: ${profile.bio ?? '(none)'}`,
          `Followers: ${profile.followersCount ?? 'unknown'}`,
          `Following: ${profile.followingCount ?? 'unknown'}`,
        ].join('\n')
      }
      case 'timeline': {
        const tweets = await this.twitterServices.timeline.getTimeline({ count: action.count ?? 10 })
        return [
          `Your X timeline (${tweets.length} tweets):`,
          ...tweets.map((t: Tweet) => `- [${t.id}] @${t.author.username}: ${t.text.substring(0, 200)}`),
        ].join('\n')
      }
    }
  }

  /**
   * Start the AiriAdapter and connect to the AIRI server
   */
  async start(): Promise<void> {
    logger.main.log('Starting Airi adapter for X...')
    try {
      await this.client.connect()
      logger.main.log('Airi adapter for X started successfully')
    }
    catch (error) {
      logger.main.errorWithError('Failed to start Airi adapter for X:', error)
      throw error
    }
  }

  /**
   * Stop the AiriAdapter and disconnect from the AIRI server
   */
  async stop(): Promise<void> {
    logger.main.log('Stopping Airi adapter for X...')
    try {
      this.client.close()
      logger.main.log('Airi adapter for X stopped')
    }
    catch (error) {
      logger.main.errorWithError('Error stopping Airi adapter for X:', error)
      throw error
    }
  }

  /**
   * Reinitialize the browser context to refresh session state
   * This is needed when credentials are updated from the UI
   */
  private async reinitializeBrowserContext(): Promise<void> {
    try {
      // Clear the session file to force re-authentication with new credentials
      const sessionFile = await useSessionFileAsync()

      // Clear the session file to force re-authentication
      await fs.writeFile(
        sessionFile,
        JSON.stringify({ cookies: [], origins: [] }, null, 2),
      )

      logger.main.log('Session file cleared, re-initializing browser context')

      // Use the updated configuration with new credentials
      const config = {
        ...getDefaultConfig(),
        credentials: {
          ...getDefaultConfig().credentials,
          ...this.config.credentials,
        },
      }

      await initBrowser(config)

      // Update the context reference
      this.ctx = useContext()

      // Reinitialize services with the new context
      this.twitterServices = {
        timeline: useTwitterTimelineServices(this.ctx),
        tweet: useTwitterTweetServices(this.ctx),
        user: useTwitterUserServices(this.ctx),
      }

      logger.main.log('Browser context reinitialized successfully with new credentials')
    }
    catch (error) {
      logger.main.errorWithError('Failed to reinitialize browser context:', error)
      throw error
    }
  }
}

function isXConfig(config: unknown): config is XConfig {
  if (typeof config !== 'object' || config === null)
    return false
  const c = config as Record<string, unknown>
  const checkStringOrUndefined = (key: string) => typeof c[key] === 'string' || typeof c[key] === 'undefined'

  return checkStringOrUndefined('apiKey')
    && checkStringOrUndefined('apiSecret')
    && checkStringOrUndefined('accessToken')
    && checkStringOrUndefined('accessTokenSecret')
}
