import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { setupComputerUse } from './index'

const runtimeMock = vi.hoisted(() => ({
  run: vi.fn(async () => ({ argv: ['invoke', '--help'], exitCode: 0, output: 'ok', stderr: '' })),
  readImage: vi.fn(async () => 'data:image/png;base64,xx'),
  dispose: vi.fn(async () => {}),
}))
const createRuntimeMock = vi.hoisted(() => vi.fn(() => runtimeMock))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp/airi-user-data',
  },
  ipcMain: {},
}))

vi.mock('@auv-js/cli/binary', () => ({
  binaryPath: () => '/mock/auv',
}))

vi.mock('@moeru/eventa/adapters/electron/main', async () => {
  const eventa = await import('@moeru/eventa')
  return {
    createContext: () => {
      const context = eventa.createContext()
      return { context, dispose: () => {} }
    },
  }
})

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: vi.fn(),
}))

vi.mock('./runtime', () => ({
  createComputerUseRuntime: createRuntimeMock,
}))

function invokeAsRenderer<TResult>(invoke: unknown, payload: unknown, senderId?: number): Promise<TResult> {
  if (typeof invoke !== 'function')
    throw new TypeError('Expected an Eventa invoke function.')

  return Reflect.apply(invoke, undefined, [payload, senderId === undefined
    ? undefined
    : {
        raw: {
          ipcMainEvent: { sender: { id: senderId } },
        },
      }]) as Promise<TResult>
}

describe('computer use ipc', () => {
  const stageWebContentsId = 7
  let context: ReturnType<typeof createContext>['context']

  beforeEach(() => {
    runtimeMock.run.mockClear()
    runtimeMock.readImage.mockClear()
    runtimeMock.dispose.mockClear()
    createRuntimeMock.mockClear()
    context = createContext(ipcMain).context
    setupComputerUse(context, {
      getAuthorizedWebContentsId: () => stageWebContentsId,
    })
  })

  afterEach(async () => {
    await runtimeMock.dispose()
  })

  // https://github.com/cogpy/airi/pull/12
  it('rejects computer use from a renderer outside the Stage window (PR #12)', async () => {
    // ROOT CAUSE:
    //
    // computerUseRun and computerUseReadImage were registered on the global
    // ipcMain Eventa context with no sender check. Any renderer with the
    // preload could drive AUV even when the chat toggle was off.
    const run = defineInvoke(context, computerUseRun)
    const readImage = defineInvoke(context, computerUseReadImage)

    await expect(invokeAsRenderer(run, { argv: ['invoke', '--help'] }, 99)).rejects.toThrow(
      'Computer use is available only from the Stage window.',
    )
    await expect(invokeAsRenderer(readImage, { path: '/tmp/capture.png' }, 99)).rejects.toThrow(
      'Computer use is available only from the Stage window.',
    )
    expect(runtimeMock.run).not.toHaveBeenCalled()
    expect(runtimeMock.readImage).not.toHaveBeenCalled()
    expect(createRuntimeMock).not.toHaveBeenCalled()
  })

  it('rejects computer use when the Stage window is unavailable (PR #12)', async () => {
    context = createContext(ipcMain).context
    setupComputerUse(context, {
      getAuthorizedWebContentsId: () => undefined,
    })
    const run = defineInvoke(context, computerUseRun)

    await expect(invokeAsRenderer(run, { argv: ['invoke', '--help'] }, stageWebContentsId)).rejects.toThrow(
      'Computer use is available only from the Stage window.',
    )
    expect(runtimeMock.run).not.toHaveBeenCalled()
  })

  it('runs computer use from the Stage window', async () => {
    const run = defineInvoke(context, computerUseRun)
    const readImage = defineInvoke(context, computerUseReadImage)

    await expect(invokeAsRenderer(run, { argv: ['invoke', '--help'] }, stageWebContentsId)).resolves.toEqual({
      argv: ['invoke', '--help'],
      exitCode: 0,
      output: 'ok',
      stderr: '',
    })
    await expect(invokeAsRenderer(readImage, { path: '/tmp/capture.png' }, stageWebContentsId)).resolves.toBe(
      'data:image/png;base64,xx',
    )
    expect(runtimeMock.run).toHaveBeenCalledOnce()
    expect(runtimeMock.readImage).toHaveBeenCalledOnce()
  })
})
