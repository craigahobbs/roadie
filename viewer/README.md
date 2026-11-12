# Roadie Viewer

The Roadie Viewer is a web application that views Roadie road plan models - the plan's options, plan view, profile, 3D
views, cost breakdown, design warnings, and structures, and a full-window 3D explorer. It's plain JavaScript modules
(`index.html`, `app.css`, and `lib/`), served as they are - there's no bundler.

It's a JavaScript rewrite of the Roadie project's MarkdownUp viewer (`../roadie.bare` and `../roadieModel.bare`). Its report
is identical to that viewer's - see [Checking parity](#checking-parity) - except its 3D views, which are drawn on
canvases, from the full elevation grid, and smoothed automatically where their cells are large enough for their facets
to show. Its URLs are compatible (`#var.vFile='plan.json'&var.vOption=1`; the MarkdownUp viewer's "smooth" argument is
ignored).


## Viewing a road plan

- **Open a local plan** - select or drop the plan's JSON file (and its source map image, to show it in the report). Local
  files stay on your computer - they're kept in the browser's IndexedDB, so the plan's URL works after a reload, and
  the home page lists the recent plans.
- **View a plan URL** - `index.html#url=plans/site.json` (or `index.html#var.vFile='plans/site.json'`). The plan's map
  image is relative to the plan's URL. Plans hosted elsewhere must allow cross-origin requests (CORS).

The 3D explorer's keys:

| Keys | Action |
| --- | --- |
| Arrows or W A S D | Move left, right, forward, and back |
| + / - | Zoom in and out |
| Q / E or Shift+Left / Right | Rotate |
| Shift+Up / Down | Tilt - view more from above or from the side |
| R / F or Page Up / Down | Raise and lower the view |
| [ / ] | Less and more vertical exaggeration |
| T, N, 0 | Top view, face north, and reset |
| H | Show or hide the keyboard help |
| Esc | Back to the report |


## Performance

Measured in headless Chrome on an Apple Silicon Mac (`tools/bench.js`), from navigation until every drawing is painted,
against the MarkdownUp viewer served by `markdown-up`:

| Plan | MarkdownUp viewer | Roadie Viewer |
| --- | --- | --- |
| Example (1,200 ft site, 3 options) | 377 ms | 74 ms |
| test1 (2 options) | 910 ms | 201 ms |
| tyler-2 (4 mile road, 13 MB of SVG) | 2,468 ms (first content: 2,396 ms) | 418 ms (first content: 126 ms) |
| 3D explorer key press, example | 110 ms | 27 ms |
| 3D explorer key press, tyler-2 | 375 ms | 40 ms |

Where the time goes:

- **The model and drawings** are plain JavaScript - for tyler-2, the analysis and every report drawing take about 110 ms
  in Node, versus about 3.3 seconds for the BareScript runtime.
- **The report** renders its text, tables, plan view, and profile first, then draws the 3D views one per task (the
  visible ones first), so the page is readable at once and stays responsive. With canvas 3D views, tyler-2's whole
  report is drawn in about 150 ms in headless Chrome.
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
  cells as small as 3 pixels, up to 8 x 8 per grid cell. (The command line's SVG report keeps the MarkdownUp viewer's
  terrain: at most 240 cells per side, and no smoothing.)


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
make parity PLANS="<plan.json> ..."     # check the output against the MarkdownUp viewer's
```

The source is ES modules in `lib/`, loaded by `index.html`:

| Module | Contents |
| --- | --- |
| `app.js` | The application - routing on the URL hash, plan loading (URLs and local files), the pages |
| `model.js`, `schema.js` | The road plan model - its schema and validation, and the earthwork, structure, and cost analysis |
| `report.js`, `planView.js`, `view3d.js` | The report, the plan and profile views, and the 3D views |
| `explore.js`, `canvas.js` | The 3D explorer and its canvas drawing |
| `args.js`, `format.js`, `draw.js`, `markdown.js`, `doc.js` | URL arguments, formatting, drawing helpers, Markdown, and the model documentation |


### Checking parity

`make parity` renders each plan's report (each option) and the model documentation with the MarkdownUp viewer - using
the BareScript JavaScript runtime, the browser's runtime - and with this viewer's command line (`tools/render.js`, whose
3D views are SVG, with the MarkdownUp viewer's terrain), and compares them element by element (`tools/parity.js`). The
check removes the MarkdownUp viewer's "Terrain" (faceted or smooth) links, and allows for one of its bugs: its options
table escapes non-selected option names twice, so a name like "Saddle - North" shows as "Saddle \- North". The canvas
3D drawings - the explorer's and the report's - are checked against the SVG drawing by `make check`.

When the MarkdownUp viewer changes, port the change to the matching function here (the functions and comments follow
`roadie.bare` and `roadieModel.bare`), then run `make parity`.
