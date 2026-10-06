# Roadie

Roadie engineers low-volume roads (driveways, rural access roads, and forest roads) from a
topographic map image, and views the resulting road grading plans in 3D.

- **`make plan FILE=<plan.png> [OUTPUT=<plan.json>]`** launches a Claude Code session with detailed
  road engineering instructions ([PLAN.md](PLAN.md)). Claude digitizes the map's topography, engineers
  one or more cost-optimal road plan options from the labeled start point to the labeled end point,
  and writes the road plan model (`OUTPUT`, default `<plan>.json`).
- **`make update FILE=<plan.json>`** launches a Claude Code session that
  updates an existing road plan model with review feedback (from the city or county, a surveyor, or
  the owner, for example).
- **`make run FILE=<plan.json>`** opens the road plan model in the Roadie viewer, a
  [MarkdownUp](https://github.com/craigahobbs/markdown-up) application written in
  [BareScript](https://github.com/craigahobbs/bare-script).

![The Roadie viewer](example/screenshot.png)


## The viewer

The viewer computes each option's earthwork, structures, and cost score, then shows:

- **Plan options** - a comparison of every option's length, maximum grade, cut, fill, net import or
  export, retaining walls, design warnings, and cost score (select an option to view it)
- **3D view** - the terrain (with contours) graded to the road's finished surface: the road, cut and
  fill slopes, retaining walls, bridges, culverts, streams, and other features. Rotate, tilt, change
  the vertical exaggeration, or view from the top.
- **Plan view** - a contour map with the road footprint (cut and fill slopes), structures, station
  ticks, and the other options' centerlines
- **Profile** - the ground and road grade along the road, with cut and fill areas, structures, and
  grades over the maximum highlighted
- **Cost** - the cost breakdown by item
- **Design warnings** - grades over the maximum, curves under the minimum radius, slopes that don't
  daylight (retaining walls needed), walls over the maximum height, unprotected stream crossings,
  exclusion areas, and ends that miss the start/end points or don't tie in to the ground
- **Structures** and the **source map** image

`make run` with no `FILE` opens the viewer's home page, which links to the example plan.


## The cost score

The cost score is the estimated construction cost in thousands of nominal US dollars - for comparing
plan options, not as a bid estimate. Roadie computes it from typical 2023-2025 unit rates (state DOT
average bid prices and low-volume road references):

- **Earthwork** by the average end area method. Cross sections every third of a grid cell model the
  road template, cut slopes (1:1 soil, 0.5:1 rock), and fill slopes (1.5:1) against the ground's
  cross slope. Rock excavation applies within rock outcrop areas.
- **Mass balance** - shrinkage and swell, borrow (import), waste (export), and overhaul from the mass
  haul diagram beyond the free haul distance
- **Clearing, surfacing, ditches and cross drains, erosion control**, by area or length
- **Culverts, retaining walls (by face area), bridges (by deck area), and turnouts**
- **Mobilization** (10%)

A plan can override any unit rate (`costRates`) for local prices. See [PLAN.md](PLAN.md#appendix-the-cost-score)
for the default rates.


## Planning a road

```
make plan FILE=site.png
```

The map image must clearly label the road's start and end points and should include a scale bar and
contour interval. The Claude Code session follows [PLAN.md](PLAN.md), which covers reading the map,
digitizing the topography, design criteria, road engineering principles, generating and refining
options, and finalizing the model. It uses these tools:

- [tools/plan_tools.py](tools/plan_tools.py) - image inspection (`info`, `crop`), contour tracing
  (`trace`, `transect`), the topography grid (`grid`), plotting (`plot`), and road engineering
  (`route`, `profile`). `route` finds the least-cost horizontal alignment with a lattice search
  (radius-constrained turns, grade, side slope, stream crossing, rock, and exclusion costs), designs
  the vertical profile by dynamic programming (minimum earthwork within the grade limits, with flatter
  switchbacks), and places culverts, retaining walls, bridges, and turnouts.
- `make evaluate FILE=<plan.json> [DETAIL=1]` - the viewer's own analysis and cost score from the
  command line (with a station-by-station table), so the planner optimizes the same cost the viewer
  shows

The session writes `site.json`, with intermediate files in `site.work/`. Use `OUTPUT` to write the
model elsewhere - for example, to compare planning runs without overwriting earlier ones:

```
make plan FILE=site.png OUTPUT=site-run2.json
```

The intermediate files go next to the output (here, `site-run2.work/`).

The session uses the Opus model at high effort by default. Use `MODEL` and `EFFORT` to change them
(any Claude Code `--model` alias or name, and `--effort` level - `low`, `medium`, `high`, `xhigh`, or
`max`), for both `make plan` and `make update`:

```
make plan FILE=site.png MODEL=sonnet EFFORT=max
```


## Updating a plan

Plans often change after review - the city or county may require a 10% fire code grade, a property
line setback, or a larger culvert, and a surveyor may correct the topography. To update a plan, run:

```
make update FILE=site.json
```

The session asks for the feedback - paste it in, or give the path of a file that contains it. It
follows [Updating a plan](PLAN.md#updating-a-plan): it saves a dated copy of the plan in the work
directory (`site.work/`), restates each feedback item and how it will address it, updates the
criteria, site features, topography, or options (reusing the original session's digitized contours),
re-engineers and re-evaluates the affected options, and adds a revision history to the plan's
description. It finishes with a before-and-after comparison of the options.


## The road plan model

A road plan model is a JSON file containing the site topography (an elevation grid with streams, rock
outcrops, and exclusion areas), the start and end points, design criteria, cost rate overrides, and
one or more road plan options. Each option has a road cross section, a centerline alignment (x, y,
and grade elevation), and structures (retaining walls, bridges, culverts, and turnouts). Run
`make doc` for the model documentation (also linked from the viewer).


## The example

The [example](example/) is a synthetic hillside site. Its topography was digitized from
[example.png](example/example.png) with the planning tools, and its options were engineered with
`route`:

```
make run FILE=example/example.json
```


## Development

```
make commit       # run the BareScript tests (100% coverage), the planning tools tests, and lint
make test         # run the BareScript tests (TEST=testName runs one test)
make test-tools   # run the planning tools tests
make clean        # remove the build directory
```

| File | Purpose |
| --- | --- |
| [roadie.md](roadie.md), [roadie.bare](roadie.bare) | The viewer application and its 3D, plan, and profile drawings |
| [roadieModel.bare](roadieModel.bare) | The road plan model schema, validation, earthwork, and cost analysis |
| [roadieCLI.bare](roadieCLI.bare) | The command-line evaluator (`make evaluate`, `make doc`) |
| [PLAN.md](PLAN.md) | The road planning instructions for Claude Code |
| [tools/plan_tools.py](tools/plan_tools.py) | The planning tools |
| [test/](test/) | The BareScript unit tests |
