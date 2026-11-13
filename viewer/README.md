# Roadie Viewer

The Roadie viewer is a web application that views Roadie road plan models - the plan's options, plan view, profile, 3D
views, cost breakdown, design warnings, and structures, and a full-window 3D explorer. It also holds the road plan
model itself (its schema, validation, and the earthwork and cost analysis) and the command line behind the project's
`make evaluate` and `make doc`. See the project's [README](../README.md) for what the viewer shows, how to view a
plan, and the 3D explorer's keys.

The viewer is plain JavaScript modules (`index.html`, `app.css`, and `lib/`), served as they are - there's no bundler.
It replaced the project's original viewer, a MarkdownUp application written in BareScript, for performance: its report
was verified identical to that viewer's on real plans before the original was removed, and its URLs are compatible
(`#var.vFile='plan.json'&var.vOption=1`).


## Development

The viewer is built with [javascript-build](https://github.com/craigahobbs/javascript-build#readme):

```sh
make run [FILE=<plan.json>]   # stage the application, then view a road plan in the browser
make commit                   # the pre-commit gate: test, lint, doc, cover, and app
make test [TEST=name]         # the unit tests (node --test)
make lint                     # ESLint
make cover                    # the unit tests, with 100% coverage required
make app                      # stage the application (build/app/)
make check PLANS="<plan.json> ..."      # check the canvas 3D drawings against the SVG drawing
```

The source is ES modules in `lib/`, loaded by `index.html`:

| Module | Contents |
| --- | --- |
| `app.js` | The application - routing on the URL hash, plan loading (URLs and local files), the pages |
| `model.js` | The road plan model - its schema and validation, and the earthwork, structure, and cost analysis |
| `report.js`, `tables.js`, `planView.js`, `view3d.js` | The report, its cost and structures tables, the plan and profile views, and the 3D views |
| `explore.js`, `canvas.js` | The 3D explorer and its canvas drawing |
| `doc.js`, `schemaDoc.js` | The model documentation page, generated from the model's schema |
| `args.js`, `format.js`, `draw.js`, `markdown.js`, `planData.js`, `smoothing.js` | URL arguments, formatting, drawing helpers, Markdown, a loaded plan's cached analyses and drawings, and the 3D drawings' time budget |
| `cli.js` | The command line (`bin/roadie.js`) - not part of the web application |

The road plan model is defined with [Schema Markdown](https://craigahobbs.github.io/schema-markdown-js/language/) (in
`model.js`) and validated with the [schema-markdown](https://github.com/craigahobbs/schema-markdown-js#readme) package -
the viewer validates every plan it loads. The package is the viewer's only dependency: the application serves its
modules next to its own (`schema-markdown/lib/`), and the page's import map resolves them.

The unit tests (`test/`) run the application in [jsdom](https://github.com/jsdom/jsdom#readme) with a fake clock,
IndexedDB, `fetch`, and canvas context (`test/appHelpers.js`). `make check` verifies that the canvas 3D drawings - the
explorer's and the report's - are the SVG drawing's, operation for operation, for whole plans.


### The command line

`bin/roadie.js` prints a plan's analysis and cost, and the model's documentation, as Markdown text:

```sh
node bin/roadie.js evaluate <plan.json> [--detail]   # each option's earthwork, cost, design warnings, and structures
node bin/roadie.js doc                               # the road plan model documentation
```

`--detail` adds each option's station table. The command exits with status 1 if the plan can't be loaded or is invalid.

`tools/render.js` renders a plan's report (with SVG 3D views), the 3D explorer, or the model documentation as HTML from
the command line, `tools/bench.js` times a page in headless Chrome, and `tools/serve.js` serves the application to
this computer's browser (`make run`).


## Performance

The viewer was measured against the original MarkdownUp viewer (served by `markdown-up`) when it replaced it, in
headless Chrome on an Apple Silicon Mac (`tools/bench.js`), from navigation until every drawing is painted:

| Plan | MarkdownUp viewer | Roadie viewer |
| --- | --- | --- |
| Example (1,200 ft site, 3 options) | 377 ms | 74 ms |
| A small site (2 options) | 910 ms | 201 ms |
| A 4 mile road (13 MB of SVG) | 2,468 ms (first content: 2,396 ms) | 418 ms (first content: 126 ms) |
| 3D explorer key press, example | 110 ms | 27 ms |
| 3D explorer key press, the 4 mile road | 375 ms | 40 ms |

Those measurements were of the viewer bundled into a single file. Serving its modules as they are loads within about
5% of the bundle (the page preloads every module).

Where the time goes:

- **The model and drawings** are plain JavaScript - for the 4 mile road, the analysis and every report drawing take
  about 110 ms in Node, versus about 3.3 seconds for the BareScript runtime.
- **The report** renders its text, tables, plan view, and profile first, then draws the 3D views one per task (the
  visible ones first), so the page is readable at once and stays responsive. With canvas 3D views, the 4 mile road's
  whole report is drawn in about 150 ms in headless Chrome.
- **Each plan's analyses, finished grade, report views, and drawings are cached**, so switching options and returning
  from the explorer don't recompute them.
- **The 3D drawings are canvases.** An SVG drawing of a large plan is tens of thousands of elements - most of its time
  was the browser building, styling, laying out, and painting them, not computing them. The canvas drawing is the
  same drawing (`make check` verifies its operations match the SVG drawing exactly), painted directly. The explorer's
  key presses are coalesced into one frame per animation frame, and the road's hover tooltips are found by
  hit-testing. Before printing, the report's 3D views are redrawn at twice their resolution (Chrome prints them as
  vector drawings).
- **The terrain's detail adapts to the computer.** The pages measure how long the 3D drawings take (through the next
  animation frame, so the canvas's rasterization counts) and keep an estimate of the cost of a terrain cell (in local
  storage, so the next visit starts where this one left off). Each drawing is as detailed as fits its time budget:
  the explorer's frames while the view moves, 100 ms (10 frames a second), and a quarter second after the last key,
  500 ms; each report 3D view, 250 ms. The explorer's detail changes only when a frame is well over or under its
  budget, so it doesn't flicker as the view moves. The elevation grid is drawn whole whenever its visible cells fit
  the budget, and grid cells drawn 8 pixels or larger - where their facets show - are smoothed (interpolated) into
  cells as small as 3 pixels, up to 8 x 8 per grid cell. (The command line's SVG report has fixed terrain limits: at
  most 240 cells per side, and no smoothing.)
