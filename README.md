# impact-func

The **Impact Function Designer**: a React app for authoring CRC impact
definitions — calibration, model, final clamp and provenance — with a live
chart you can edit directly, contract validation, and exports (definition
JSON, canonical JSON with its `definition_hash`, crc_framework Python, CSV).

Units are chosen from a fixed list (`src/domain/units.ts`); impact units are
narrowed to the impact preset, and any other unit fails validation. **Import**
(top right) loads a definition JSON — pretty or canonical, as the Export panel
produces — or a knots/bins CSV into the editor; an untouched import re-exports
with the same `definition_hash`.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + parity tests
npm run build      # typecheck and build to dist/
```

## Layout

```
src/
  domain/          Pure logic, no React
    presets.ts       Hazard and impact presets, impact-unit formatting
    state.ts         Editor state (fields kept as typed strings), seeding, preset switches
    units.ts         Standard exposure and impact unit tokens
    importer.ts      Definition JSON / CSV → editor state
    evaluate.ts      crc-impact/1 evaluation of each model kind
    definition.ts    Builds impact_definition 1.0 and validates it against the contract
    canonical.ts     crc-canonical-json/1 and the SHA-256 definition hash
    plot.ts          Chart range, sampled curves, ticks, monotonicity
    handles.ts       Drag handles: each writes the same values the form fields edit
    exports.ts       Definition / canonical / Python / CSV export text
  components/      One component per card, plus shared NumField
  App.tsx          Holds state; derives definition, plot and export
design/
  damage-function-designer/   Original design export (reference mockup)
```


## The design reference

`design/damage-function-designer/` is the export from the design tool and is
the source of truth for the look and behaviour. `src/domain/parity.test.ts`
runs the mockup's own logic next to the app for every hazard × impact preset
× model kind × export tab and checks they produce the same definition,
errors, hash, export text and curve, so the app can't drift from the design
unnoticed.

To view the mockup itself (some browsers block its scripts over `file://`):

```bash
python3 -m http.server 4310 --directory design/damage-function-designer
```

Then open http://localhost:4310/Main.dc.html.

When a new export comes out of the design tool, replace that folder's contents
and commit, then run `npm test` to see where the app needs to follow:

```bash
rm -rf design/damage-function-designer && mkdir -p design/damage-function-designer && unzip -o "Damage function designer-html.zip" -d design/damage-function-designer
```
