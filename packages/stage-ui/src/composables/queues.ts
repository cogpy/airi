import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { EmotionPayload } from '../constants/emotions'

import { sleep } from '@moeru/std'
import { createQueue } from '@proj-airi/stream-kit'

import { parseActEmotion } from '../libs/affect/act-emotion'

export function useEmotionsMessageQueue(emotionsQueue: UseQueueReturn<EmotionPayload>) {
  return createQueue<string>({
    handlers: [
      async (ctx) => {
        const emotion = parseActEmotion(ctx.data)
        if (emotion) {
          ctx.emit('emotion', emotion)
          emotionsQueue.enqueue(emotion)
        }
      },
    ],
  })
}

export function useDelayMessageQueue() {
  function splitDelays(content: string) {
    if (!(/<\|DELAY:\d+\|>/i.test(content))) {
      return {
        ok: false,
        delay: 0,
      }
    }

    const delayExecArray = /<\|DELAY:(\d+)\|>/i.exec(content)

    const delay = delayExecArray?.[1]
    if (!delay) {
      return {
        ok: false,
        delay: 0,
      }
    }

    const delaySeconds = Number.parseFloat(delay)

    if (delaySeconds <= 0 || Number.isNaN(delaySeconds)) {
      return {
        ok: true,
        delay: 0,
      }
    }

    return {
      ok: true,
      delay: delaySeconds,
    }
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        const { ok, delay } = splitDelays(ctx.data)
        if (ok) {
          ctx.emit('delay', delay)
          await sleep(delay * 1000)
        }
      },
    ],
  })
}
