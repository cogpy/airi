import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { IpcMainEvent } from 'electron'

import { join, sep } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import { computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createComputerUseRuntime } from './runtime'

interface ElectronInvokeOptions {
  raw?: { ipcMainEvent?: IpcMainEvent }
}

function requireComputerUseEvent(
  invokeOptions: ElectronInvokeOptions | undefined,
  getAuthorizedWebContentsId: () => number | undefined,
): void {
  const event = invokeOptions?.raw?.ipcMainEvent
  const authorizedWebContentsId = getAuthorizedWebContentsId()
  if (!event || authorizedWebContentsId === undefined || event.sender.id !== authorizedWebContentsId)
    throw new Error('Computer use is available only from the Stage window.')
}

/** Registers host-owned computer use. The executable is resolved only on the first call. */
export function setupComputerUse(
  context: ReturnType<typeof createContext>['context'],
  options: {
    getAuthorizedWebContentsId: () => number | undefined
  },
) {
  let runtime: ReturnType<typeof createComputerUseRuntime> | undefined
  let stopped = false
  function getRuntime() {
    if (stopped)
      throw new Error('Computer use has stopped.')
    if (!runtime) {
      const executable = binaryPath()
      runtime = createComputerUseRuntime({
        // Native executables cannot run inside Electron's archive.
        binaryPath: app.isPackaged ? executable.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`) : executable,
        storeRoot: join(app.getPath('userData'), 'computer-use'),
      })
    }
    return runtime
  }
  defineInvokeHandler(context, computerUseRun, (input, invokeOptions) => {
    requireComputerUseEvent(invokeOptions, options.getAuthorizedWebContentsId)
    return getRuntime().run(input)
  })
  defineInvokeHandler(context, computerUseReadImage, (input, invokeOptions) => {
    requireComputerUseEvent(invokeOptions, options.getAuthorizedWebContentsId)
    return getRuntime().readImage(input)
  })
  onAppBeforeQuit(async () => {
    stopped = true
    await runtime?.dispose()
  })
}
