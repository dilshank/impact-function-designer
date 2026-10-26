# impact-func

Home of the **Damage function designer**: a tool for calibrating, modelling,
clamping and exporting damage (impact) functions.

## Layout

```
design/
  damage-function-designer/   Design export (reference mockup)
    Main.dc.html              The artboard: template + logic + styles
    support.js, vendor/       Runtime used to render the mockup; not part of the design
    README.md                 Notes from the design tool export
```

The mockup's sections are Calibration (exposure, impact), Model, the chart,
Final clamp, Provenance and Export.

## Viewing the design

Some browsers block the scripts over `file://`, so serve the folder:

```bash
python3 -m http.server 8000 --directory design/damage-function-designer
```

Then open http://localhost:8000/Main.dc.html.

## Updating the design

When a new export comes out of the design tool, replace the contents of
`design/damage-function-designer/` with it and commit, so the git history
tracks each design revision:

```bash
rm -rf design/damage-function-designer && mkdir -p design/damage-function-designer && unzip -o "Damage function designer-html.zip" -d design/damage-function-designer
```
