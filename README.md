# Roadie

Roadie engineers low-volume roads (driveways, rural access roads, and forest roads) on USGS lidar
terrain, and views the resulting road grading plans in 3D.

- **`make plan FILE=<plan>.site.json [OUTPUT=<plan.json>]`** launches a Claude Code session with detailed
  road engineering instructions ([PLAN.md](plan/PLAN.md)). The road site model (`FILE`) has the road's
  start and end points - their latitudes and longitudes - and its planning notes. Claude builds the
  site from the USGS 3D Elevation Program's 1 meter lidar terrain, engineers one or more cost-optimal
  road plan options from the start point to the end point, and writes the road plan model (`OUTPUT`,
  default `<plan>.json`).
- **`make update FILE=<plan.json>`** launches a Claude Code session that
  updates an existing road plan model with review feedback (from the city or county, a surveyor, or
  the owner, for example).
- **`make run FILE=<plan.json>`** opens the road plan model in the Roadie viewer, a JavaScript web
  application.

![The Roadie viewer](example/screenshot.png)

Roadie has two parts: the **viewer** ([viewer/](viewer/)) and the **planning tools and instructions**
(`plan/`) - both JavaScript. It requires `make` and Node.js 22 or later - and
[Claude Code](https://claude.com/claude-code) to plan and update roads. A site must be in the United
States, where the USGS has 1 meter lidar terrain.


## The viewer

The viewer's report - meant to be read and printed - computes each option's earthwork, structures,
and cost score, then shows:

- **Plan options** - a comparison of every option's length, maximum grade, cut, fill, net import or
  export, retaining walls, design warnings, and cost score (select an option to view it)
- **Plan view** - a contour map with the road footprint (cut and fill slopes), structures, station
  ticks, the other options' centerlines, and the outlines of the 3D views. Click it to explore the 3D
  landscape from that point.
- **Profile** - the ground and road grade along the road, with cut and fill areas, structures, and
  grades over the maximum highlighted
- **3D views** - the terrain (with contours) graded to the road's finished surface: the road, cut and
  fill slopes, retaining walls, bridges, culverts, streams, station labels, and other features. The
  first view is always the whole site. When the road is too narrow to see in it, views of equal road
  segments follow, from the start to the end. Every view keeps the overview's general orientation, so
  the reader stays oriented across the views. Each looks across its road segment - preferably upslope,
  where the road's cuts into the hillsides and its fill slopes face the viewer - at the lowest tilt
  that shows all of its road (from straight above, if the terrain hides parts of it at every tilt).
- **Cost** - the cost breakdown by item
- **Design warnings** - grades over the maximum, curves under the minimum radius, slopes that don't
  daylight (retaining walls needed), walls over the maximum height, unprotected stream crossings,
  exclusion areas, and ends that miss the start/end points or don't tie in to the ground
- **Structures** and the **source map** image

The 3D views are drawn from the plan's full elevation grid, as detailed as the computer can draw
quickly. Where a view is zoomed in far enough for the grid's cells to show, the terrain is smoothed -
each grid cell is divided into smaller cells interpolated between the grid points, clamped to each
grid cell's corner elevations. Smooth terrain looks smoother up close but is no more accurate.

On large sites, where the road is too narrow to see at a view's scale, the selected option's road is
also drawn as a highlighted centerline.

The report's "Explore" links open the full-window **3D explorer**, controlled with the keyboard:

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


### Viewing a road plan

`make run FILE=<plan.json>` serves the viewer and the plan's directory locally, and opens the plan in
the browser. `make run` with no `FILE` opens the viewer's home page.

The viewer is also a web site (see [Publishing](#publishing)) that views plans without installing
anything:

- **Open a local plan** - on the viewer's home page, select or drop the plan's JSON file (and its
  source map image, to show it in the report). Local files stay on your computer - they're kept in
  the browser's storage, so the plan's URL works after a reload, and the home page lists the recent
  plans.
- **View a plan URL** - `viewer/#url=<plan.json URL>` (the URL is relative to the viewer). The plan's
  map image is relative to the plan's URL. Plans hosted on another site must allow cross-origin
  requests (CORS).

The viewer validates every plan it loads against the [road plan model](#the-road-plan-model), and
reports the first problem it finds.


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
- **Existing road upgrades** (by area) - where an option follows an existing road, reshaping, a
  gravel lift, ditch cleaning, and minor widening replace the new road's earthwork, clearing,
  surfacing, and ditches
- **Mobilization** (10%)

A plan can override any unit rate (`costRates`) for local prices. See [PLAN.md](plan/PLAN.md#appendix-the-cost-score)
for the default rates.


## Planning a road

A road is planned from a **road site model** - a JSON file with the road's start and end points and
its planning notes:

```json
{
    "title": "Hillside Driveway",
    "units": "feet",
    "start": {
        "latitude": 44.0000, "longitude": -115.0000,
        "label": "County Rd",
        "description": "At the gate on the county road"
    },
    "end": {
        "latitude": 44.0030, "longitude": -114.9960,
        "label": "House site",
        "description": "The bench above the creek"
    },
    "notes": [
        "A single-lane gravel driveway with fire apparatus access.",
        "Stay off the creek's east bank."
    ]
}
```

The points' latitudes and longitudes are decimal degrees, as a phone or a map application gives them
(the United States' longitudes are negative). A point's `label` and `description`, and the `notes` -
the road's purpose, constraints, and preferences - are the planning session's instructions. A site may
also have exclusion areas (`exclusions` - polygons of latitudes and longitudes the road must avoid),
design criteria (`criteria`), cost rates (`costRates`), the distance its topography extends beyond the
start and end points (`margin`), and its topography grid's spacing (`spacing`). Run
`node plan/bin/plan.js doc` for the road site model's documentation.

```
make plan FILE=driveway.site.json
```

The Claude Code session follows [PLAN.md](plan/PLAN.md), which covers reading and verifying the site,
design criteria, road engineering principles, generating and refining options, and finalizing the
model. It uses these tools:

- `plan/bin/plan.js` - the planning tools:
  - `site` creates the plan's site from the road site model. Its topography is the USGS 3D Elevation
    Program's 1 meter elevation models - lidar ground elevations: `site` finds the site's models,
    reads only the site's part of each (it's cached in the work directory), and grids them in the
    plan's coordinates, a map projection centered on the site. It adds the site's streams (the USGS
    National Hydrography Dataset's), its roads and trails and its topographic map image (the USGS
    National Map's), and its exclusion areas. A site the USGS has no 1 meter elevation models of
    can't be planned.
  - `plot` plots the plan - its shaded terrain, contours, features, and options - for the session to
    study (all of it, or a part of it for a closer look), and `locate` converts latitudes and
    longitudes to the plan's coordinates.
  - `route` and `profile` engineer a road option. `route` finds the least-cost horizontal alignment
    with a lattice search (radius-constrained turns, grade, side slope, stream crossing, rock, and
    exclusion costs), designs the vertical profile by dynamic programming (minimum earthwork within
    the grade limits, with flatter switchbacks), and places culverts, retaining walls, bridges, and
    turnouts.
- `make evaluate FILE=<plan.json> [DETAIL=1]` - the viewer's own analysis and cost score from the
  command line (with a station-by-station table), so the planner optimizes the same cost the viewer
  shows

The session writes `driveway.json` (and the site's topographic map image, `driveway.png`), with
intermediate files in `driveway.work/`. Use `OUTPUT` to write the model elsewhere - for example, to
compare planning runs without overwriting earlier ones:

```
make plan FILE=driveway.site.json OUTPUT=driveway-run2.json
```

The intermediate files go next to the output (here, `driveway-run2.work/`).

The session uses the Opus model at high effort by default. Use `MODEL` and `EFFORT` to change them
(any Claude Code `--model` alias or name, and `--effort` level - `low`, `medium`, `high`, `xhigh`, or
`max`), for both `make plan` and `make update`:

```
make plan FILE=driveway.site.json MODEL=sonnet EFFORT=max
```

Use `OLLAMA=1` to run the session on a local or cloud [Ollama](https://ollama.com) model instead
(it launches Claude Code with `ollama launch claude`). `MODEL` then names the Ollama model; without
it, Ollama picks the model (prompting if needed):

```
make plan FILE=driveway.site.json OLLAMA=1 MODEL=qwen3.8:27b-mlx
```

Use `GROK=1` to run the session with the [Grok CLI](https://docs.x.ai/build/overview) (`grok`) instead of Claude Code.
`MODEL` then names the Grok model; without it, Grok uses its default model:

```
make plan FILE=driveway.site.json GROK=1 MODEL=grok-4.6
```


## Updating a plan

Plans often change after review - the city or county may require a 10% fire code grade, a property
line setback, or a larger culvert, and the owner may move the house site. To update a plan, run:

```
make update FILE=driveway.json
```

The session asks for the feedback - paste it in, or give the path of a file that contains it. It
follows [Updating a plan](plan/PLAN.md#updating-a-plan): it saves a dated copy of the plan in the work
directory (`driveway.work/`), restates each feedback item and how it will address it, updates the
criteria, site features, site, or options, re-engineers and re-evaluates the affected options, and
adds a revision history to the plan's description. It finishes with a before-and-after comparison of
the options.


## The road plan model

A road plan model is a JSON file containing the site topography (an elevation grid with streams,
roads, rock outcrops, and exclusion areas, and its elevation data's sources), the plan's georeference
(its place on the Earth), the start and end points, design criteria, cost rate overrides, and one or
more road plan options. Each option has a road cross section, a centerline alignment (x, y,
and grade elevation), and structures (retaining walls, bridges, culverts, turnouts, and the existing roads
it follows).

The model is defined with [Schema Markdown](https://craigahobbs.github.io/schema-markdown-js/language/)
(in `viewer/lib/model.js`), and the viewer and `make evaluate` validate every plan against it. Run
`make doc` for the model documentation (also linked from the viewer's report).


## The example

The [example](example/example.json) is a synthetic hillside site - its topography was digitized from
a drawn map, [example.png](example/example.png), so it has no georeference - and its options were
engineered with `route`:

```
make run FILE=example/example.json
```

On the project's web site, [view the example](viewer/#url=../example/example.json).


## Development

```
make commit       # the pre-commit gate: the viewer's and the planning tools' tests and lint
make test         # run the viewer's and the planning tools' unit tests (TEST=name runs one viewer test)
make lint         # run ESLint on the viewer and pylint on the planning tools
make site         # stage the project's web site (build/gh-pages/)
make clean        # remove the build directories
```

The top-level makefile delegates to the project's two subprojects - run `make` in either for its own
targets:

| Directory | Contents |
| --- | --- |
| [viewer/](viewer/) | The Roadie viewer - the web application, the road plan model (its schema, validation, earthwork, and cost analysis), and the command line behind `make evaluate` and `make doc`. JavaScript, built with [javascript-build](https://github.com/craigahobbs/javascript-build#readme) - see its [README](viewer/README.md). |
| `plan/` | The planning tools (`bin/plan.js`) - the road site model, the site's USGS lidar terrain and features, plotting, and road engineering - and the road planning instructions for Claude Code ([PLAN.md](plan/PLAN.md)). JavaScript, built with [javascript-build](https://github.com/craigahobbs/javascript-build#readme). |
| `example/` | The example plan |

`CLAUDE.md` is the repository guide for Claude Code.


### Publishing

`make site` stages the project's web site in `build/gh-pages/`: this README at its root (rendered by
`index.html`, a [MarkdownUp](https://github.com/craigahobbs/markdown-up#readme) page), the planning
instructions, the example plan, and the viewer in `viewer/`. `make gh-pages` runs the pre-commit gate, stages the site, and
updates a checkout of the repository's `gh-pages` branch in `../roadie.gh-pages` - commit and push it
there to publish (GitHub Pages serves the branch).

The published viewer is the viewer's complete source - including the earthwork and cost model - and
the site is public. Road plans and map images are user data: don't add them to the site unless
they're meant to be public.
