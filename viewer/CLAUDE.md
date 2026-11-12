# Roadie Viewer

The Roadie road plan viewer - a JavaScript web application (ES modules in `lib/`, served as is - no bundler) built with
[javascript-build](https://github.com/craigahobbs/javascript-build#readme). It's a rewrite of the project's MarkdownUp
viewer (`../roadie.bare` and `../roadieModel.bare`), which it replaces. See [README.md](README.md).

## Commands

```sh
make test [TEST=name]        # unit tests (node --test)
make lint                    # ESLint
make cover                   # unit tests with 100% coverage required
make commit                  # the pre-commit gate: test, lint, doc, cover, and app
make app                     # stage the application (build/app/)
make run FILE=<plan.json>    # view a plan in the browser
make check PLANS="..."       # the canvas 3D drawings (explorer and report) match the SVG drawing exactly
make parity PLANS="..."      # output identical to the MarkdownUp viewer's (BareScript JS runtime)
```

Real plans for `check` and `parity`: `../example/example.json`, `../../roadie-tests/test*.json`,
`../../roadie-tyler-*/boise-stitched-usgs-topo-layout2.json`.

## Conventions

- The road plan model is defined, validated, and documented with Schema Markdown: its schema text is in `model.js`
  (`roadieTypes`), plans are validated with the `schema-markdown` package (`validatePlan` - the application validates
  every plan it loads), and the documentation page and `bin/roadie.js doc` are generated from the type model
  (`schemaDoc.js`). Don't hand-write schema parsing, validation, or documentation.
- `bin/roadie.js` (`lib/cli.js`) is the command line behind the project's `make evaluate` and `make doc` - the planning
  instructions depend on its output, so keep it stable. `lib/cli.js` isn't part of the web application.

- The report (as `tools/render.js` renders it - SVG 3D views, with the MarkdownUp viewer's terrain) must stay identical
  to the MarkdownUp viewer's, apart from its "Terrain" links - port Roadie viewer changes function by
  function (same names, order of floating-point operations, and comments), then run `make parity` on all the plans
  above. Number formatting must match BareScript's: `numberToFixed` is `toFixed` (`fixed`/`fixedTrim`/`px` in
  `format.js`), `mathRound` is `Math.round(x * 10 ** d) / 10 ** d` (`round`), and `mathLog(x, b)` is
  `Math.log(x) / Math.log(b)`.
- The browser's 3D drawings (the explorer and the report's 3D views) are canvas operations (`canvas.js`) from the same
  `view3DParts` code as the SVG 3D views - run `make check` after changing either. Their terrain point limit adapts to
  a time budget (`smoothing.js`); `make check` uses the fixed `smoothLimitsCanvas`. Add `?debug` to the page URL to
  log each 3D drawing's operations, grid step, smoothing, and timing.
- `index.html` preloads every application module (a unit test checks the list) - add a `modulepreload` link with a new
  module. Its import map resolves the `schema-markdown` package, which `make app` stages next to `lib/`.
- Measure performance changes in Chrome with `tools/bench.js` (serve `build/app` and a plan directory), and in
  Node with `tools/render.js --time`. Add `?debug` to the page URL for render timing in the console.
- Plans and map images are user data - never commit them here (the repository and its Pages site may be public).
