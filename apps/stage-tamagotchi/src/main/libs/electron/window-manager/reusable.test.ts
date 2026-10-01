import { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { createReusableWindow } from './reusable'

// NOTICE:
// A test double for the real `BrowserWindow`, which needs the Electron binary.
// It has only what `createReusableWindow` calls on the window it creates.
// Removal condition: unit tests running inside an Electron-based test runner.
vi.mock('electron', () => ({
  BrowserWindow: class {
    readonly close = vi.fn()
    readonly isDestroyed = vi.fn(() => false)
    readonly on = vi.fn()
    readonly webContents = { isDestroyed: () => false, isCrashed: () => false }
  },
}))

/** A reusable window whose setup finishes only when the test says so. */
function createDeferredReusableWindow() {
  const created: BrowserWindow[] = []
  const pending: Array<() => void> = []
  const reusable = createReusableWindow(() => new Promise<BrowserWindow>((resolve) => {
    pending.push(() => {
      const window = new BrowserWindow()
      created.push(window)
      resolve(window)
    })
  }))
  return { reusable, created, finishSetup: () => pending.shift()?.() }
}

describe('createReusableWindow', () => {
  it('closes a window whose creation a close overtook, and creates a new one on the next open', async () => {
    const { reusable, created, finishSetup } = createDeferredReusableWindow()

    const opening = reusable.getWindow()
    reusable.close()
    finishSetup()

    await expect(opening).rejects.toThrow('Window closed during creation')
    expect(created[0].close).toHaveBeenCalled()
    expect(reusable.getOpenWindow()).toBeUndefined()

    // The discarded creation must not stay cached, or the window could never
    // open again until the app restarts.
    const reopening = reusable.getWindow()
    finishSetup()
    await expect(reopening).resolves.toBe(created[1])
  })

  it('closes the open window, then creates a new one instead of handing out the destroyed one', async () => {
    const { reusable, created, finishSetup } = createDeferredReusableWindow()
    const opening = reusable.getWindow()
    finishSetup()
    await opening

    reusable.close()
    expect(created[0].close).toHaveBeenCalled()

    vi.mocked(created[0].isDestroyed).mockReturnValue(true)
    expect(reusable.getOpenWindow()).toBeUndefined()

    const reopening = reusable.getWindow()
    finishSetup()
    await expect(reopening).resolves.toBe(created[1])
  })

  it('creates a new window when open follows close before the old window is destroyed', async () => {
    // ROOT CAUSE:
    //
    // If close() runs before the window is destroyed, getWindow() returns it.
    // close() left the cached window set, and ensureWindow returns it while
    // the renderer is still available.
    //
    // We fixed this by forgetting the cached window in close().
    const { reusable, created, finishSetup } = createDeferredReusableWindow()
    const opening = reusable.getWindow()
    finishSetup()
    await opening

    reusable.close()
    expect(created[0].isDestroyed()).toBe(false)
    expect(reusable.getOpenWindow()).toBeUndefined()

    const reopening = reusable.getWindow()
    finishSetup()
    await expect(reopening).resolves.toBe(created[1])
    expect(created[0].close).toHaveBeenCalled()
  })

  it('creates a new window when open follows close while creation is still in flight', async () => {
    // ROOT CAUSE:
    //
    // If close() runs while creation is in flight, the next getWindow()
    // receives that promise, and the promise rejects.
    // close() left the setup promise set, so ensureWindow returned it.
    //
    // We fixed this by forgetting that promise in close(). A later open
    // creates a new window.
    const { reusable, created, finishSetup } = createDeferredReusableWindow()

    const opening = reusable.getWindow()
    reusable.close()
    const reopening = reusable.getWindow()
    const joining = reusable.getWindow()

    finishSetup()
    await expect(opening).rejects.toThrow('Window closed during creation')
    expect(created[0].close).toHaveBeenCalled()

    const afterDiscard = reusable.getWindow()
    finishSetup()
    const reopened = await reopening
    expect(reopened).toBe(created[1])
    await expect(joining).resolves.toBe(reopened)
    await expect(afterDiscard).resolves.toBe(reopened)
    expect(created).toHaveLength(2)
  })
})
