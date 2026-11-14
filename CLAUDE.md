# Roadie

Roadie engineers low-volume roads on USGS lidar terrain and views the resulting road plan models in
a printable report with 3D views. See [README.md](README.md) for the user-facing overview.

The project is two subprojects, and the top-level makefile delegates to them:

- **The viewer** (`viewer/`, JavaScript, [javascript-build](https://github.com/craigahobbs/javascript-build#readme)) -
  the web application (report, plan and profile views, 3D views, and 3D explorer), the road plan model (its Schema
  Markdown schema, validation, earthwork, and cost analysis), and the command line behind `make evaluate` and
  `make doc`. See [viewer/CLAUDE.md](viewer/CLAUDE.md).
- **The planning tools** (`plan/`, JavaScript, [javascript-build](https://github.com/craigahobbs/javascript-build#readme)) -
  `plan/bin/plan.js` (`plan/lib/`) and the planning instructions, [plan/PLAN.md](plan/PLAN.md). A road is planned
  from a road site model (`<plan>.site.json` - the road's start and end points, as latitudes and longitudes, and its
  planning notes): the tools build the site from the USGS 3D Elevation Program's 1 meter lidar terrain, and engineer
  its road options. **Planning a road** (`make plan`, `make update`) follows PLAN.md - when asked to plan or update
  a road, follow PLAN.md exactly. The planning session runs in `plan/`. See [plan/README.md](plan/README.md).

`example/` is a small synthetic plan. `index.html` renders this project's README on its web site.

## Commands

```sh
make commit                       # the pre-commit gate: the subprojects' tests and lint (at 100% coverage)
make test [TEST=name]             # the viewer's unit tests (TEST runs one) and the planning tools' unit tests
make lint                         # ESLint (the viewer and the planning tools)
make plan FILE=<plan>.site.json   # plan a road (a Claude Code session)
make evaluate FILE=<plan.json> [DETAIL=1]   # a plan's analysis and cost from the command line
make doc                          # the road plan model documentation
make run FILE=<plan.json>         # view a plan in the browser
make site                         # stage the web site (build/gh-pages/): README, example, and viewer/
```

Run `make` in `viewer/` or `plan/` for a subproject's own targets (e.g.
`make -C viewer test TEST=name`, `make -C viewer check`, `make -C plan lint`).

## Conventions

- Run `make commit` before committing; it must pass - the viewer and the planning tools (`plan/`) with 100% coverage
  and every lint clean.
- Commit directly on `main`. Commit messages: a short imperative subject, then a body of bullets
  (or a paragraph) explaining what changed and why.
- The road plan model stays defined, validated, and documented with Schema Markdown (see viewer/CLAUDE.md), and the
  viewer validates every plan it loads.
- The planning tools use the viewer's model (`plan/lib/` imports `viewer/lib/` - its schema, cost rates, topography,
  and drawing code). Their route search and profile design have their own cross sections (`plan/lib/design.js`, a
  retaining wall where a slope doesn't daylight) - keep them consistent with `viewer/lib/model.js`'s.
- The planning tools' tests never use the network - the USGS services and elevation models are faked
  (`plan/test/terrainHelpers.js`). To check the tools against the real services, plan a site in the scratchpad
  (`node plan/bin/plan.js site <site.json> <plan.json>`, then `route` and `plot`).
- The planning tools, not the planning session's model, do the plan's engineering and write the plan file
  (`route` follows existing roads, `feature`, `keep`, and `describe` edit the plan) - so that sessions on different
  models get the same roads, with fewer tokens. When a session writes code for something every plan needs, make
  it a tool, and keep the tools' reports short (they're a session's context). Keep PLAN.md and the session's
  allowed commands (`plan/Makefile`) in step with the tools.
- The road site model is defined and validated with Schema Markdown, like the road plan model (`plan/lib/site.js`).
- Keep the README's viewer section and key table in sync with the viewer's controls.
- `FILE` and `OUTPUT` paths are relative to the directory `make` runs in - the top-level makefile makes them absolute
  before delegating.
- Road plan files and their work directories (`*.work/`, git-ignored) usually live outside the repo - they're user
  data, so don't add them to the repo or the web site.

## Checking the viewer visually

Stage and serve the application with a plan (its directory is served as `plan/`), and screenshot it with headless
Chrome:

```sh
make -C viewer app
node viewer/tools/serve.js viewer/build/app 8931 --plan example/example.json &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
    --virtual-time-budget=15000 --screenshot=viewer/build/report.png --window-size=1100,3000 \
    "http://127.0.0.1:8931/#var.vFile='plan%2Fexample.json'"
```

Add `&var.vExplore=true` to the URL for the 3D explorer, or use `#var.vDoc=true` for the model documentation. To
render a page without a browser, `node viewer/tools/render.js <plan.json> [--explore | --doc]` writes its HTML (with
SVG 3D views).

## Performance work

- Optimizations must leave the output byte-identical - for the viewer, see viewer/CLAUDE.md; for the planning tools,
  compare their written plans and images against a baseline, then time the change against the baseline in the same
  session.
