import type { ccv3 } from '@proj-airi/ccc'

import type { AiriCard, AiriExtension } from '../types/airiCard'

import JSZip from 'jszip'

import { exportToJSON } from '@proj-airi/ccc'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import vexaCardText from '../../presets/character-cards/vexa/card.json?raw'
import vexaManifestText from '../../presets/character-cards/vexa/manifest.json?raw'

import { DisplayModelFormat, useDisplayModelsStore } from '../stores/display-models'
import { exportAiriCardPackage, importAiriCardPackage } from './airi-card-import-export'

describe('airi card package import/export', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('exports shareable fields, sanitizes runtime state, and restores display models', async () => {
    const displayModelsStore = useDisplayModelsStore()
    const fetch = vi.fn(async () => new Response('preset-vrm-model'))
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue({
      id: 'preset-vrm-1',
      format: DisplayModelFormat.VRM,
      type: 'url' as const,
      url: '/assets/avatar.vrm',
      name: 'AvatarSample_A',
      importedAt: 1,
    })
    mockAddDisplayModel(displayModelsStore, 'display-model-imported')

    const exported = await exportAiriCardPackage({ card: createCard(), displayModelsStore })
    const zip = await JSZip.loadAsync(await exported.arrayBuffer())
    const cardJson = await readJson<ccv3.CharacterCardV3>(zip, 'card.json')
    const imported = await importAiriCardPackage({ file: new File([exported], 'card.zip'), displayModelsStore })
    const airi = airiFrom(cardJson)

    expect(fetch).toHaveBeenCalledWith('/assets/avatar.vrm')
    expect(await readJson(zip, 'manifest.json')).toMatchObject({ format: 'airi-character-card', version: 1, resources: { displayModel: { path: 'models/body-model.vrm', format: DisplayModelFormat.VRM, name: 'AvatarSample_A.vrm' } } })
    expect(await zip.file('models/body-model.vrm')?.async('string')).toBe('preset-vrm-model')
    expect(cardJson.data).toMatchObject({ name: 'AIRI / Test Card', creator: '', tags: [], mes_example: '' })
    expect(airi.modules).toMatchObject({ consciousness: { provider: 'openai', model: 'gpt-4o' }, speech: { provider: 'elevenlabs', model: 'eleven', voice_id: 'alloy' } })
    expect(airi.modules).not.toHaveProperty('activeBackgroundId')
    expect(airi.modules.artistry).not.toHaveProperty('workflowId')
    expect(airi.agents).toEqual({})
    expect(displayModelsStore.addDisplayModel).toHaveBeenCalledWith(DisplayModelFormat.VRM, expect.objectContaining({ name: 'AvatarSample_A.vrm' }))
    expect(airiFrom(imported).modules.displayModelId).toBe('display-model-imported')
  })

  it('applies the share-field whitelist to externally edited package JSON', async () => {
    const displayModelsStore = useDisplayModelsStore()
    const source = exportToJSON(createCard('preset-live2d-1'))
    source.data.extensions.third_party = { token: 'do-not-import' }

    const imported = await importAiriCardPackage({
      file: await packageFile(source),
      displayModelsStore,
    })
    const airi = airiFrom(imported)

    expect(imported.data).toMatchObject({
      name: 'AIRI / Test Card',
      nickname: 'Tester',
      character_version: '1.2.3',
      description: 'Description',
      creator: '',
      tags: [],
      mes_example: '',
    })
    expect(imported.data.extensions).not.toHaveProperty('third_party')
    expect(airi.modules).not.toHaveProperty('activeBackgroundId')
    expect(airi.modules.artistry).not.toHaveProperty('workflowId')
    expect(airi.agents).toEqual({})
  })

  // ROOT CAUSE:
  //
  // The import whitelist copied only provider, speech and artistry settings,
  // so a shared card lost whether its character speaks first or plays games.
  //
  // We fixed this by copying initiative and co-play settings, field by field,
  // keeping only values of the right type.
  it('keeps typed initiative and co-play settings and drops the rest', async () => {
    const source = exportToJSON(createCard('preset-live2d-1'))
    const modules = (source.data.extensions.airi as AiriExtension).modules as Record<string, unknown>
    modules.initiative = { enabled: true, threshold: 0.2, refractorySeconds: Number.NaN, nameTopics: 'yes', converseWithAgents: false, unknownFlag: true }
    modules.coplay = { enabled: true, extra: 1 }

    const imported = await importAiriCardPackage({ file: await packageFile(source), displayModelsStore: useDisplayModelsStore() })

    expect(airiFrom(imported).modules.initiative).toEqual({ enabled: true, threshold: 0.2, converseWithAgents: false })
    expect(airiFrom(imported).modules.coplay).toEqual({ enabled: true })
  })

  it('imports nothing autonomous from a card that sets no behaviour', async () => {
    const imported = await importAiriCardPackage({ file: await packageFile(exportToJSON(createCard('preset-live2d-1'))), displayModelsStore: useDisplayModelsStore() })

    expect(airiFrom(imported).modules).not.toHaveProperty('initiative')
    expect(airiFrom(imported).modules).not.toHaveProperty('coplay')
  })

  it('imports the bundled Vexa preset with her behaviour settings', async () => {
    // The preset files go into the archive byte for byte, as a user zips them.
    const zip = new JSZip()
    zip.file('manifest.json', vexaManifestText)
    zip.file('card.json', vexaCardText)
    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'vexa.zip')

    const imported = await importAiriCardPackage({ file, displayModelsStore: useDisplayModelsStore() })

    expect(imported.data.name).toBe('Vexa')
    expect(imported.data.system_prompt).toContain('game_move')
    expect(airiFrom(imported).modules.initiative).toMatchObject({ enabled: true, yieldWhenInterrupted: false })
    expect(airiFrom(imported).modules.coplay).toEqual({ enabled: true })
  })

  it('classifies invalid packages', async () => {
    const emptyZip = new JSZip()
    const invalidJsonZip = new JSZip()
    const displayModelsStore = useDisplayModelsStore()
    invalidJsonZip.file('manifest.json', '{')
    const cases = [
      [new File(['not zip'], 'card.zip'), { code: 'invalid-file', message: 'Invalid zip file' }],
      [new File([await emptyZip.generateAsync({ type: 'arraybuffer' })], 'empty.zip'), { code: 'missing-file' }],
      [new File([await invalidJsonZip.generateAsync({ type: 'arraybuffer' })], 'invalid-json.zip'), { cause: expect.any(SyntaxError), code: 'invalid-file' }],
      [await packageFile(exportToJSON(createCard()), { version: 2 }), { code: 'invalid-file' }],
    ] as const

    for (const [file, expected] of cases)
      await expect(importAiriCardPackage({ file, displayModelsStore })).rejects.toMatchObject(expected)
  })

  it('preserves Tachie archives and their compound extension', async () => {
    const displayModelsStore = useDisplayModelsStore()
    vi.spyOn(displayModelsStore, 'getDisplayModel').mockResolvedValue({
      id: 'tachie-model',
      format: DisplayModelFormat.TachieZip,
      type: 'file',
      file: new File(['tachie-model'], 'character.tachie.zip'),
      name: 'character.tachie.zip',
      importedAt: 1,
    })
    mockAddDisplayModel(displayModelsStore, 'imported-tachie')

    const exported = await exportAiriCardPackage({
      card: createCard('tachie-model'),
      displayModelsStore,
    })
    const zip = await JSZip.loadAsync(await exported.arrayBuffer())
    const imported = await importAiriCardPackage({
      file: new File([exported], 'card.zip'),
      displayModelsStore,
    })

    expect(await readJson(zip, 'manifest.json')).toMatchObject({
      resources: {
        displayModel: {
          path: 'models/body-model.tachie.zip',
          format: DisplayModelFormat.TachieZip,
          name: 'character.tachie.zip',
        },
      },
    })
    expect(await zip.file('models/body-model.tachie.zip')?.async('string')).toBe('tachie-model')
    expect(displayModelsStore.addDisplayModel).toHaveBeenCalledWith(
      DisplayModelFormat.TachieZip,
      expect.objectContaining({ name: 'character.tachie.zip' }),
    )
    expect(airiFrom(imported).modules.displayModelId).toBe('imported-tachie')
  })
})

function mockAddDisplayModel(store: ReturnType<typeof useDisplayModelsStore>, id = 'unused') {
  return vi.spyOn(store, 'addDisplayModel').mockImplementation(async (format, file) => ({
    id,
    format,
    type: 'file' as const,
    file,
    name: file.name,
    importedAt: 1,
  }))
}

function createCard(displayModelId = 'preset-vrm-1'): AiriCard {
  return {
    name: 'AIRI / Test Card',
    nickname: 'Tester',
    version: '1.2.3',
    description: 'Description',
    creator: 'Hidden creator',
    messageExample: [['{{user}}: hidden']],
    tags: ['hidden'],
    extensions: {
      airi: {
        modules: {
          consciousness: { provider: 'openai', model: 'gpt-4o' },
          vision: { provider: 'ollama', model: 'llava' },
          speech: { provider: 'elevenlabs', model: 'eleven', voice_id: 'alloy', pitch: 1 },
          displayModelId,
          activeBackgroundId: 'background-secret',
          artistry: { provider: 'replicate', model: 'flux', workflowId: 'workflow-secret' },
        },
        agents: { minecraft: { prompt: 'secret', enabled: true } },
      },
    },
  }
}

async function packageFile(cardJson: ccv3.CharacterCardV3, manifestOverrides: Record<string, unknown> = {}) {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({
    format: 'airi-character-card',
    version: 1,
    card: { path: 'card.json', spec: 'chara_card_v3' },
    ...manifestOverrides,
  }))
  zip.file('card.json', JSON.stringify(cardJson))
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'card.zip')
}

async function readJson<T = Record<string, unknown>>(zip: JSZip, path: string): Promise<T> {
  return JSON.parse(await zip.file(path)!.async('string')) as T
}

function airiFrom(card: ccv3.CharacterCardV3): AiriExtension {
  return card.data.extensions.airi as AiriExtension
}
