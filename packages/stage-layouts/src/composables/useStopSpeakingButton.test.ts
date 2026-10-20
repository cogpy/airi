import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useStopSpeakingButton } from './useStopSpeakingButton'

const nowSpeaking = ref(false)
const speechMuted = ref(false)
const setSpeechMutedMock = vi.fn()
const trackSpeechMuteToggledMock = vi.fn()

vi.mock('@proj-airi/stage-ui/stores/audio', () => ({
  useSpeakingStore: () => ({ nowSpeaking }),
}))

vi.mock('@proj-airi/stage-ui/stores/speech-output-control', () => ({
  useSpeechOutputControlStore: () => ({
    activeTurns: [],
    requestStopSpeaking: vi.fn(),
    setSpeechMuted: setSpeechMutedMock,
    speechMuted,
  }),
}))

// The real session store reaches the auth store, which calls `defineStore` at
// import time. Mocking the session store keeps that chain out of the test.
vi.mock('@proj-airi/stage-ui/stores/chat/session-store', () => ({
  useChatSessionStore: () => ({ activeSessionId: 'session-under-test' }),
}))

vi.mock('@proj-airi/stage-ui/composables/use-analytics', () => ({
  useAnalytics: () => ({
    trackSpeechMuteToggled: trackSpeechMuteToggledMock,
    trackTtsStopClicked: vi.fn(),
  }),
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: object) => store,
}))

describe('useStopSpeakingButton', () => {
  // ROOT CAUSE:
  //
  // The mute was committed only after awaiting `resolveSpeakingState()`. While
  // that was pending, `speechMuted` still held the old value, so a second press
  // computed the same target and both presses muted.
  //
  // Fixed by committing the target before the await, leaving only analytics to
  // wait.
  it('mutes immediately while the remote playback state is pending', async () => {
    speechMuted.value = false
    setSpeechMutedMock.mockClear().mockImplementation((muted: boolean) => {
      speechMuted.value = muted
    })
    trackSpeechMuteToggledMock.mockClear()

    let resolveSpeaking!: (speaking: boolean) => void
    const speaking = new Promise<boolean>((resolve) => {
      resolveSpeaking = resolve
    })
    const controls = useStopSpeakingButton({
      resolveSpeakingState: () => speaking,
    })

    const firstToggle = controls.toggleSpeechMuted()
    expect(setSpeechMutedMock).toHaveBeenLastCalledWith(true)

    const secondToggle = controls.toggleSpeechMuted()
    expect(setSpeechMutedMock).toHaveBeenLastCalledWith(false)

    resolveSpeaking(true)
    await Promise.all([firstToggle, secondToggle])
    expect(trackSpeechMuteToggledMock).toHaveBeenCalledWith({ muted: true, was_speaking: true })
    expect(trackSpeechMuteToggledMock).toHaveBeenCalledWith({ muted: false, was_speaking: true })
  })

  // The mute is the user's action; a renderer that cannot reach the output host
  // must not turn a failed analytics lookup into a failed mute.
  it('still mutes when the playback owner cannot be reached', async () => {
    speechMuted.value = false
    setSpeechMutedMock.mockClear().mockImplementation((muted: boolean) => {
      speechMuted.value = muted
    })
    trackSpeechMuteToggledMock.mockClear()

    const controls = useStopSpeakingButton({
      resolveSpeakingState: () => Promise.reject(new Error('output host unavailable')),
    })

    await controls.toggleSpeechMuted()

    expect(setSpeechMutedMock).toHaveBeenCalledExactlyOnceWith(true)
    expect(trackSpeechMuteToggledMock).not.toHaveBeenCalled()
  })
})
