import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { EmotionPayload } from '../constants/emotions'

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
