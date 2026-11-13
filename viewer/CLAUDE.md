# Roadie Viewer

The Roadie road plan viewer - a JavaScript web application (ES modules in `lib/`, served as is - no bundler) built with
[javascript-build](https://github.com/craigahobbs/javascript-build#readme). It also holds the road plan model and the
command line behind the project's `make evaluate` and `make doc`. See [README.md](README.md).

## Commands

```sh
make commit                  # the pre-commit gate: test, lint, doc, cover (100% required), and app
make test [TEST=name]        # unit tests (node --test)
make lint                    # ESLint (bin/, lib/, test/, tools/)
make cover                   # unit tests with 100% line, branch, and function coverage required
make app                     # stage the application (build/app/)
make run FILE=<plan.json>    # view a plan in the browser
make check PLANS="..."       # the canvas 3D drawings (explorer and report) match the SVG drawing exactly
```

Plans for `check`: `../example/example.json`, and the real plans, which are kept outside the repository (ask where, if
you don't know).

## Conventions

- The road plan model is defined, validated, and documented with Schema Markdown: its schema text is in `model.js`
  (`roadieTypes`), plans are validated with the `schema-markdown` package (`validatePlan` - the application validates
  every plan it loads), and the documentation page and `bin/roadie.js doc` are generated from the type model
  (`schemaDoc.js`). Don't hand-write schema parsing, validation, or documentation.
- `bin/roadie.js` (`lib/cli.js`) is the command line behind the project's `make evaluate` and `make doc` - the planning
  instructions depend on its output, so keep it stable (`test/expected/` has its expected output for the example
  plan). `lib/cli.js` isn't part of the web application.
- New code needs tests (`test/*.test.js`) that assert behavior - exact output, not just coverage. The application's
  tests run in jsdom with the fakes in `test/appHelpers.js`. Coverage ignores and large HTML/SVG snapshots aren't
  used - assert on specific elements and counts, and keep `test/expected/` files small.
- The browser's 3D drawings (the explorer and the report's 3D views) are canvas operations (`canvas.js`) from the same
  `view3DParts` code as the SVG 3D views - run `make check` after changing either. Their terrain point limit adapts to
  a time budget (`smoothing.js`); `make check` uses the fixed `smoothLimitsCanvas`. Add `?debug` to the page URL to
  log each 3D drawing's operations, grid step, smoothing, and timing.
- Number formatting is `toFixed`'s (`fixed`/`fixedTrim`/`px` in `format.js`), and `round` is
  `Math.round(x * 10 ** d) / 10 ** d` - the drawings and the command line's output depend on them.
- `index.html` preloads every application module (a unit test checks the list) - add a `modulepreload` link with a new
  module. Its import map resolves the `schema-markdown` package, which `make app` stages next to `lib/`.
- ESLint's `id-length` rule allows the coordinate names `x`, `y`, and `z` (`ESLINT_ARGS` in the makefile) - other names
  are two characters or longer.
- Optimizations must leave the output byte-identical - compare `tools/render.js` output (the report and `--explore`)
  and `bin/roadie.js evaluate --detail` against a baseline, then time the change against the baseline in the same
  session: in Node with `tools/render.js --time`, and in Chrome with `tools/bench.js` (serve `build/app` and a plan
  directory). Add `?debug` to the page URL for render timing in the console.
- Plans and map images are user data - never commit them here (the repository and its Pages site may be public).
