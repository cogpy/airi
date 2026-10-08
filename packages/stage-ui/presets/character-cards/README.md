# Character card presets

Each folder holds an AIRI character card package as source files: a
`manifest.json` and a `card.json` (Character Card V3). The app imports a
package as one `.zip` file.

## Import a preset

1. Zip the two files of a preset folder, with both files at the top level of
   the archive:

   ```bash
   cd packages/stage-ui/presets/character-cards/vexa
   zip vexa.zip manifest.json card.json
   ```

2. In AIRI, open **Settings → AIRI Card**, select the upload area, and
   choose the `.zip` file.

## Presets

| Folder | Character | Behaviour turned on |
|--------|-----------|---------------------|
| `vexa` | Vexa: a chaotic, sarcastic AI VTuber who is kind underneath. Inspired by Neuro-sama, not affiliated with her or her creator. | Speaks first during a lull (initiative), plays turn-based games (co-play) |

A card's `extensions.airi.modules` can turn on AIRI behaviours: `initiative`
(speak first, yield when talked over, talk with other AI characters) and
`coplay` (play games). An import keeps only fields of the right type, so a
card that does not set a behaviour leaves it off.

`src/services/airi-card-import-export.test.ts` imports each preset through
the real importer, so a preset that no longer imports fails the tests.
