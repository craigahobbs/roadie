# Roadie

Roadie engineers low-volume roads from a topographic map and views the resulting road plan models in
a printable report with 3D views. See [README.md](README.md) for the user-facing overview.

- **Planning a road** (`make plan`, `make update`) follows [PLAN.md](PLAN.md) - when asked to plan
  or update a road, follow PLAN.md exactly. The planning tools are `tools/plan_tools.py` (Python).
- **The viewer** is a [MarkdownUp](https://github.com/craigahobbs/markdown-up) application written
  in BareScript: `roadie.md` / `roadie.bare` (report, 3D views, 3D explorer, plan and profile
  views), `roadieModel.bare` (model schema, validation, earthwork, and cost analysis), and
  `roadieCLI.bare` (`make evaluate`, `make doc`). Use the `bare-script` skill when writing BareScript.
- `SPEC.md` is the original viewer specification; `example/` is a small synthetic plan.

## Commands

```sh
make commit                       # the pre-commit gate: BareScript tests, planning tools tests, and lint
make test [TEST=testName]         # BareScript tests (debug mode, 100% coverage required)
make test-tools                   # planning tools tests
make lint                         # BareScript static analysis
make evaluate FILE=<plan.json> [DETAIL=1]   # a plan's analysis and cost from the command line
make run FILE=<plan.json>         # view a plan in the browser
```

## Conventions

- Run `make commit` before committing; it must pass with 100% coverage and lint clean. A clean test
  run prints no `failed with error` lines - each is an invalid builtin argument to fix.
- Commit directly on `main`. Commit messages: a short imperative subject, then a body of bullets
  (or a paragraph) explaining what changed and why.
- New viewer code needs tests in `test/testRoadie.bare` (page renders assert the full mock call log;
  `testRoadieReportViewsLog` builds a report's expected plan/profile/3D views log). Prefer behavior
  assertions over counting on coverage.
- Keep the README's viewer section and key table in sync with the viewer's controls.
- Road plan files and their work directories (`*.work/`, git-ignored) usually live outside the repo.

## Checking the viewer visually

Render a page to HTML with the `bare` CLI and screenshot it with headless Chrome:

```sh
printf "include '../roadie.bare'\n\nroadieMain()\n" > build/driver.bare
build/venv/bin/bare -l build/driver.bare -v vFile "'../example/example.json'" > build/report.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
    --screenshot=build/report.png --window-size=1100,3000 file://$PWD/build/report.html
```

`vFile` is relative to the driver's directory; add `-v vExplore true` for the 3D explorer. The `bare
-l` HTML has no charset, so `°` shows as `Â°` in these screenshots only. For the real page, serve it
with `build/venv/bin/markdown-up -n -p <port> <dir>` (as `make run` does) and screenshot the URL with
`--virtual-time-budget=15000`.

## MarkdownUp gotchas

- Text with `~...~` renders as strikethrough - plan and option descriptions should say "about".
- MarkdownUp never removes a page's `documentSetKeyDown` handler when the app navigates. The 3D
  explorer guards its key handler with a page token in session storage (`roadieNewPageToken`).
- Event handlers can't prevent the browser's default key actions.
