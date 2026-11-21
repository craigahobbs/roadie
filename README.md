# SageRoad

[![PyPI - Status](https://img.shields.io/pypi/status/sageroad)](https://pypi.org/project/sageroad/)
[![PyPI](https://img.shields.io/pypi/v/sageroad)](https://pypi.org/project/sageroad/)
[![GitHub](https://img.shields.io/github/license/craigahobbs/sageroad)](https://github.com/craigahobbs/sageroad/blob/main/LICENSE)
[![PyPI - Python Version](https://img.shields.io/pypi/pyversions/sageroad)](https://pypi.org/project/sageroad/)

SageRoad engineers low-volume roads (driveways, rural access roads, and forest roads) on USGS lidar
terrain, and views the resulting road grading plans in 3D.

The SageRoad application runs in your web browser. Make a plan - the road's start and end points (their
latitudes and longitudes) and its planning notes - and run it: SageRoad builds the site from the USGS 3D
Elevation Program's 1 meter lidar terrain, engineers the road's options from the start point to the
end point, and costs them, and an [Ollama](https://ollama.com) model reads what the notes ask for.
Then view the options' report and 3D views, edit the plan and run it again, and save it to a file.

**[View the example road plan](https://craigahobbs.github.io/sageroad/viewer/#url=../example/example.json)** - an access road up a hill, with its road options' report,
3D views, and 3D explorer - in the SageRoad viewer, on this project's web site. There's nothing to
install. See The example, below.

[![The example road plan's 3D views](https://craigahobbs.github.io/sageroad/example/screenshot.png)](https://craigahobbs.github.io/sageroad/viewer/#url=../example/example.json)

The application needs only Python 3.11 or later. A site must be in the United States, where the USGS
has 1 meter lidar terrain.


## Installing

The application is a Python package - it needs [Python](https://www.python.org/downloads/) 3.11 or
later. Install it from [PyPI](https://pypi.org/project/sageroad/), in a virtual environment:

```
python3 -m venv sageroad-venv
sageroad-venv/bin/pip install sageroad
sageroad-venv/bin/sageroad
```

On Windows, the virtual environment's commands are `sageroad-venv\Scripts\pip` and
`sageroad-venv\Scripts\sageroad` (and `py -m venv sageroad-venv` makes it). `sageroad` opens the application
in your web browser (Ctrl-C stops it - `sageroad -h` lists its options). To update it, run the same
`pip install` with `--upgrade`.

To have a model read your plans' notes, install [Ollama](https://ollama.com), and download a model
that reads images on the application's **Ollama Models** page (a plan's **Run Plan** section links to
it). Without a model, a plan's notes aren't read.

The application runs offline - its page and its planning tools are the package's - except for the
USGS's site data, which a plan's first run (or a run after its site's points, units, margin, or
spacing change) fetches, the list of Ollama's models to download, and Ollama, on this computer (a
model's download, and an Ollama cloud model, use the internet).


## Your first road

1. Run the application (`sageroad-venv/bin/sageroad`), and choose **New Plan**.
2. Give the plan a title, and its start and end points - copy each point's latitude and longitude from
   a map (Google Maps, say), and paste them into its latitude. Write the road's notes: what it's for,
   and what it must avoid or pass through (see The plan's notes, below). **Done** makes the plan.
3. **Run Plan**, with an Ollama model to read the notes (**Ollama Models**, beside it, downloads
   one). The first run fetches the site's data from the USGS - it takes a minute or two, and longer
   for a large site.
4. **View Plan** for its road options' report, and **Save** the plan to a file.


## The SageRoad application

`sageroad` runs the application (or `make run`, in a clone of the repository), and opens it in your web
browser (`Ctrl-C` stops it). Its home page:

- **Open Plan** - choose or drop a plan's JSON file (and its source map image, to show it in the
  report). The files stay on your computer - they're kept in the browser's storage, and the home
  page lists the recent files (remove one with its ✕).
- **New Plan** - a form for the plan's config: its title, units, start and end points, notes, design
  criteria, cost rates, and its site's margin and grid spacing. An empty member is its default - its
  box shows it.

A plan is its config and, once it's run, its **road options**. The opened or new plan is the
**loaded plan** - the home page shows its config (its points, the distance between them, its notes,
criteria, and marks), and what can be done with it:

- **View Plan** - its road options' report (each option's length, maximum grade, earthwork, walls,
  warnings, and cost score, its plan and profile, and its 3D views), and the 3D explorer.
- **Edit Plan** - its config: the notes, say. If the plan has road options, they're from the config
  before - run the plan to engineer them again.
- **Edit Map** - draw its config's marks on its site's map (once it's run): the areas the road must
  avoid (a property line's setback, an easement), the existing roads that the USGS doesn't map (a
  track - the shaded relief shows one's worn trough), and the places the road must pass through.
  The map's backdrop is the site's contours, its topographic map, or its shaded relief, with its
  streams, roads, and road options. Scroll to zoom, and drag to move. Draw an area's corners or a
  road's points with clicks (double-click or Enter finishes, Backspace removes the last point), or
  click a place. Select a mark to rename or delete it, or drag its points. A mark that a run found
  for the notes is dashed - edit it to correct it (it's yours then). **Done** makes the marks the
  plan's. Run the plan again to engineer its road options with the marks - its site's data is kept,
  so the USGS isn't asked for it again.
- **Run Plan** - choose an Ollama model to read its notes (or none - the last model chosen is the
  default). If the notes can't be read - Ollama isn't running, or it has no models - or won't be
  (no model is chosen), or the model doesn't read images (it can't find the notes' places on the
  map), it says so. The run's steps are shown as it goes, with its time, and its result and report when it's
  done. The run is made in the background, so the page goes on while it runs. **Stop** stops it at
  once - and its work is thrown away. The road options it engineers are the plan's, and so are the
  places it found for the notes (see Planning a road, below). A plan that's run again keeps its
  site's data (its terrain,
  streams, roads, and map), so the USGS isn't asked for it again - unless its points, units, margin,
  or spacing changed, or "Fetch the site's data from the USGS again" is checked. **Clear Road
  Options** clears them - the plan keeps its site's data.
- **Save** the plan to its file - the file it was opened from, or saved to - or **Save As** another,
  to duplicate it (and run it with another config, say). In a browser that can't write to a file
  (Firefox and Safari), it's **Download** - the plan's file is downloaded. A plan with road options
  keeps its config and its map image, so it's one file - and a plan without road options is its
  config's file.
- **Close** it - if it has changes that aren't saved, you're asked first.
- **Ollama Models** - Ollama's models on this computer: whether each reads images, its parameters,
  size, and modified date. **Delete** a model, or **Update** it (download it again), and see a
  download's progress (**Stop** stops it). **Download Models** lists the models of Ollama's library -
  filter them by how recent they are, whether your computer runs them (**Compatible** - a local
  model needs about a byte of memory for each of its parameters), their type (local, cloud, or
  MLX - a Mac with Apple silicon's), and their capability (**Vision** - a model that reads images,
  **Chat** - one that answers questions, which an embedding or decision model doesn't, or **All**),
  sort them, and download one of a model's sizes. Each model's capabilities are listed (vision,
  tools, thinking, ...). It starts with the compatible local models that read images, of the last 6
  months, the most recently modified first. A download stops if the page is closed or reloaded -
  you're asked first.

Ollama answers the application's page when it runs on this computer (`http://127.0.0.1:11434`) - the
page asks Ollama itself, for its models, their downloads, and a run's questions.


## Planning a road

A plan's config - its **road site model** - is a JSON file:

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
(the United States' longitudes are negative). A config may also have design criteria (`criteria` -
the road's width and surface, its maximum grade and minimum radius, and more), cost rates
(`costRates`), the distance its site extends beyond the start and end points (`margin`), its terrain
grid's spacing (`spacing`), and its **marks** - the areas the road must avoid
(`exclusions`, polygons of latitudes and longitudes), the existing roads the USGS doesn't map (`roads`
- a track, a driveway - that a road may follow), and the places a road must pass through
(`passThrough`) - draw them with **Edit Map**. The model documentation (linked from the viewer's
report) describes every member.

A run of the plan:

1. **Builds the site.** Its terrain is the USGS 3D Elevation Program's 1 meter elevation models -
   lidar ground elevations - gridded in the plan's coordinates, a map projection centered on the
   site. Its streams are the USGS National Hydrography Dataset's (moved to the bottoms of their
   valleys), its roads and trails and its topographic map image are the USGS National Map's, and its
   marks are the config's.
2. **Reads the notes**, with a model - see The plan's notes, below.
3. **Engineers the road options:**
   - **Existing Roads** - the least-cost road, following the site's existing roads where upgrading
     them costs less than a new road (if it follows any)
   - **New Road** - the least-cost all-new road
   - **Another corridor** - the least-cost road around the middle of those two, through the middle of
     that way (named for its side - "West Corridor"), if it's a real choice: within the grade limit,
     apart from them, and at most three times the least-cost option's cost score. Otherwise the
     plan's description says why there isn't one.
   - **Via PLACE** - a road through each place the road must pass through. A place that's a dead
     end off the road's way - the road would go out to it and return the way it came - is passed
     by: the plan's description says how near the road passes it.

   A road is found by a least-cost lattice search (with radius-constrained turns, and grade, side
   slope, stream crossing, rock, and exclusion costs) - a road doesn't cross itself, run back along
   itself, or run in a stream's channel - its vertical profile is designed by dynamic
   programming (the least earthwork within the grade limits, flatter on switchbacks), and its
   culverts, retaining walls (where a cut or fill slope doesn't meet the ground within the maximum
   slope height), bridges, and turnouts are placed. Each road is searched with three
   weights of the penalty for ground steeper than the design grade, and it's the one with the lowest
   cost score (the other corridor's road is searched with one). A road's cut or fill is 60 feet (18
   meters) deep at most, at its center line (but for a bridge's span) - where the grade limits need
   more, the road is searched again with stricter grades, and if it still does, it isn't a road. A
   road that's over 20 feet (6 meters) deep is held off the ground by its grade limit - its line's
   ground is steeper than its grade for too long (a canyon's floor, say) - so it's searched with the
   stricter grades, too, and it's the road with the lowest cost score: a longer road around often
   costs far less than a long, deep fill. The terrain's unmapped draws that a road crosses are added
   as streams, with culverts, and the roads are engineered again. If the Existing Roads or New Road option runs to the site's edge, or
   there's no road within the grade limit, the site's margin is enlarged by half, and the plan is
   made again - at most twice. On ground too steep for a road at the maximum grade - a canyon's
   walls, say - a run ends with no road, and says where the road it found is too deep.
4. **Keeps the best options** - at most four, in cost score order (another corridor is the first
   that isn't kept) - and writes their descriptions: the plan's facts, what the notes asked for, and
   what the run did with them.


### The plan's notes

The notes are the road's purpose, constraints, and preferences, in your words. A model (an Ollama
model) is asked what they ask for:

- the road's **width** and **surface**, a **maximum grade** and **minimum radius**, and the depth of
  a stream crossing's fill that a **bridge** replaces (the config's own criteria win)
- the **existing roads to rule out** - a private or closed road, say - which the options don't follow
- the **places to avoid**, and the **places to pass through**

A place's coordinates may be in the notes ("the easement's corners are 44.0011, -114.9981; ..."):
three or more corners are an area to avoid, and one point is a place to pass through. Otherwise the
model finds the place on the site's topographic map. Each place it finds is one of the config's marks,
with how it was found - so a plan that's run again doesn't look for it again. Correct a found mark by
editing it on the map (it's yours then), and a mark that was found for a place the notes don't name
any more is removed. A place the model can't find - an easement, a property line - draw on the map. A model's reading of a map is the weakest part of a plan - the plan's description says what
the model found, to be verified. A note the run can't act on is reported, and it's in the plan's
limitations.

The model's questions are small - a paragraph, and a map image - with a JSON answer that's checked:
the model doesn't run the plan. Without a model, the notes aren't read, and the plan is the tools'
alone.

Typical criteria, for the config's design criteria or the notes (from the USFS *Low-Volume Roads
Engineering Best Management Practices Field Guide*, AASHTO low-volume road guidance, and fire codes):

| | Driveway / fire access | Rural access road | Forest / ranch road |
| --- | --- | --- | --- |
| Width | 12-14 ft / 3.7-4.3 m | 14-20 ft / 4.3-6 m | 12-14 ft / 3.7-4.3 m |
| Surface | gravel (asphalt above about 12-15% grade) | gravel or asphalt | gravel or native |
| Maximum grade | 12% (10% where the fire code requires) | 12% | 15% (12% preferred) |
| Minimum radius | 50 ft / 15 m | 50 ft / 15 m | 50 ft / 15 m (70 ft for trucks with trailers) |

The defaults are a 14 foot (4.3 meter) gravel road, a 12% maximum grade (designed 1% under it, and 8%
on switchbacks), a 50 foot (15 meter) minimum radius, a 20 foot (6 meter) maximum wall height, and a
60 foot (18 meter) maximum cut or fill slope height. A dead-end road also needs a turnaround at its
end - it isn't modeled.


## The viewer

The viewer's report - meant to be read and printed - computes each option's earthwork, structures,
and cost score, then shows:

- **Plan options** - a comparison of every option's length, maximum grade, cut, fill, net import or
  export, retaining walls, design warnings, and cost score (select an option to view it)
- **Plan view** - a contour map with the road footprint (cut and fill slopes), structures, station
  ticks, the other options' centerlines, and the outlines of the 3D views. The site's streams, roads,
  and areas are named where their names fit - clear of each other, the road, and the drawing's labels
  (the longest first). Click it to explore the 3D landscape from that point.
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
  daylight - that don't meet the ground within the maximum slope height (retaining walls needed) -
  walls over the maximum height, unprotected stream crossings,
  exclusion areas, and ends that miss the start/end points or don't tie in to the ground
- **Structures** and the **source map** image

The 3D views are drawn from the plan's full elevation grid, as detailed as the computer can draw
quickly. Where a view is zoomed in far enough for the grid's cells to show, the terrain is smoothed -
each grid cell is divided into smaller cells interpolated between the grid points, clamped to each
grid cell's corner elevations. Smooth terrain looks smoother up close but is no more accurate.

On large sites, where the road is too narrow to see at a view's scale, the selected option's road is
also drawn as a highlighted centerline.

The report's "Explore" links open the full-window **3D explorer**, controlled with the mouse:

| Control | Action |
| --- | --- |
| Drag | Move - the ground follows the mouse |
| Right-drag or Shift+drag | Rotate (drag left and right) and tilt (drag up and down) |
| Wheel or pinch | Zoom in and out, around the mouse |
| Double-click | Center the view there and zoom in (Shift+double-click zooms out) |
| Arrows, + / - | Move, and zoom in and out |
| The + / - buttons, North, Top, and Reset | Zoom, face north, view from above, and view the whole site |
| The Exaggeration slider | The vertical exaggeration |
| The ? button | Show or hide the controls' help |
| Esc | Back to the report |

The explorer's URL keeps its view, so it can be reloaded or shared.


### Viewing a road plan

The application views a road plan that's opened, or made by a run. The viewer is also a web site,
[craigahobbs.github.io/sageroad/viewer/](https://craigahobbs.github.io/sageroad/viewer/) (see
Publishing, below), that views plans without installing anything:

- **Open a local plan** - on the viewer's home page, select or drop the plan's JSON file (and its
  source map image, to show it in the report). Local files stay on your computer - they're kept in
  the browser's storage, so the plan's URL works after a reload, and the home page lists the recent
  plans.
- **View a plan URL** - `viewer/#url=<plan.json URL>` (the URL is relative to the viewer). The plan's
  map image is relative to the plan's URL. Plans hosted on another site must allow cross-origin
  requests (CORS).
- **View the example** - the web site's viewer has a link to the example on its home
  page.

The viewer validates every plan it loads against the road plan model (see The road plan model, below), and
reports the first problem it finds.


## The cost score

The cost score is the estimated construction cost in thousands of nominal US dollars - for comparing
plan options, not as a bid estimate. SageRoad computes it from typical 2023-2025 unit rates (state DOT
average bid prices and low-volume road references):

- **Earthwork** by the average end area method. Cross sections every third of a grid cell model the
  road template, cut slopes (1:1 soil, 0.5:1 rock), and fill slopes (1.5:1) on the terrain - a
  slope is followed out from the road's edge to where it meets the ground. Rock excavation applies
  within rock outcrop areas.
- **Mass balance** - shrinkage and swell, borrow (import), waste (export), and overhaul from the mass
  haul diagram beyond the free haul distance
- **Clearing, surfacing, ditches and cross drains, erosion control**, by area or length
- **Culverts, retaining walls (by face area), bridges (by deck area), and turnouts**
- **Existing road upgrades** (by area) - where an option follows an existing road, reshaping, a
  gravel lift, ditch cleaning, and minor widening replace the new road's earthwork, clearing,
  surfacing, and ditches
- **Mobilization** (10%)

A plan's config can override any unit rate (`costRates`, in dollars per metric unit) for local prices.
The default rates:

| Item | Default rate |
| --- | --- |
| Clearing and grubbing | $8,000 / acre of disturbed area |
| Common excavation | $15 / CY |
| Rock excavation | $75 / CY |
| Embankment placement and compaction | $5 / CY |
| Borrow (import) | $20 / CY |
| Waste (export) | $8 / CY |
| Overhaul (beyond 500 ft free haul) | about $3 / CY-mile |
| Native surface finish grading | about $1.25 / SY |
| Aggregate surfacing | about $16 / SY |
| Asphalt paving (with base) | about $33 / SY |
| Concrete paving | about $75 / SY |
| Ditches and cross drains | about $14 / LF of road |
| Culverts | about $120 / LF (18 in) to $250 / LF (36 in), plus $3,000 per end |
| Retaining walls | about $60 / SF of face |
| Bridges | about $250 / SF of deck |
| Existing road upgrade (reshaping, gravel lift, ditch cleaning, minor widening) | about $11 / SY of road |
| Erosion control and revegetation | $3,000 / acre of disturbed area |
| Mobilization | 10% |

Shrinkage: 1 CY of common excavation makes 0.87 CY of compacted fill; rock swells to 1.1 CY.


## The road plan model

A road plan model is a JSON file containing the site topography (an elevation grid with streams,
roads, trails, rock outcrops, and exclusion areas, and its elevation data's sources), the plan's
georeference (its place on the Earth), the start and end points, design criteria, cost rate
overrides, one or more road plan options, and the plan's config (its road site model). Each option
has a road cross section, a centerline alignment (x, y, and grade elevation), and structures
(retaining walls, bridges, culverts, turnouts, and the existing roads it follows).

The model is defined with [Schema Markdown](https://craigahobbs.github.io/schema-markdown-js/language/)
(in `viewer/lib/model.js`), and the viewer validates every plan against it. The viewer's report links
to the model documentation.


## The example

The [example](https://craigahobbs.github.io/sageroad/example/example.json) is an access road up a hill at the south edge of Kennewick,
Washington - not quite half a mile of road, to climb 200 feet. It was made by the application, from
its config, [site.json](https://craigahobbs.github.io/sageroad/example/site.json): the road's start and end points, as latitudes and
longitudes, its planning notes, and its marks - the house lots at the foot of the hill, which the road
must avoid, and an unmapped dirt track to the hilltop, which a road may follow.

The site's terrain is the USGS's 1 meter lidar elevations, and its features are the USGS's roads and
stream, the config's marks, and a draw of the hill that an option crosses, which the run added. The run
read the notes with a local model (the road is gravel, and its grade is 12% at most), and engineered
three options: the least-cost road, which follows the track to the hilltop, an all-new road, and a
road in another corridor, around the hill's west side. The plan keeps its image - the USGS topographic
map of the site, for the report's source map - so the example is one file. Open the config in the
application and run it to make the plan again.

Run the application, and open the example's file to view it - `example/example.json` in the
repository, or [download it](https://craigahobbs.github.io/sageroad/example/example.json). On the project's web site,
[view the example](https://craigahobbs.github.io/sageroad/viewer/#url=../example/example.json) - the site's viewer links to it from its home
page, too.


## Development

SageRoad's development runs from a clone of its repository, on macOS, Linux, and Windows. It needs
`make`, `git`, and `curl` (or `wget`), [Node.js](https://nodejs.org/en/download) 22 or later, and
[Python](https://www.python.org/downloads/) 3.11 or later:

- **macOS** - the Xcode Command Line Tools have `make` and `git` (`xcode-select --install`), and
  Node.js has an installer (or `brew install node`, with [Homebrew](https://brew.sh)).
- **Linux** - your distribution's package manager (`sudo apt install make git curl`, say), and
  Node.js 22 or later - a distribution's own Node.js package may be older.
- **Windows** - the `make` commands need a Unix shell: [MSYS2](https://www.msys2.org/) (run
  `pacman -S --needed make git` in its "MSYS2 UCRT64" terminal), and Node.js's Windows installer. To
  let the MSYS2 terminal find `node`, set the Windows environment variable `MSYS2_PATH_TYPE` to
  `inherit` (`setx MSYS2_PATH_TYPE inherit`, in PowerShell).

```
make run          # run the application from the repository, in the browser
make commit       # the pre-commit gate: the viewer's, the planning tools', and the application's tests and lint
make test         # run the unit tests (TEST=name runs the viewer's and the planning tools' tests of a name)
make lint         # run ESLint on the viewer and the planning tools, and pylint on the application
make site         # stage the project's web site (build/gh-pages/)
make changelog    # update the changelog (CHANGELOG.md) with the commits since its last
make publish      # publish the application's package to PyPI
make clean        # remove the build directories
```

The first `make` command downloads the build's files and npm packages, so it takes a minute. The
top-level makefile delegates to the project's subprojects - run `make` in one for its own targets:

| Directory | Contents |
| --- | --- |
| [viewer/](https://github.com/craigahobbs/sageroad/tree/main/viewer) | The SageRoad viewer - the web application, the road plan model (its schema, validation, earthwork, and cost analysis), and a command line (`bin/sageroad.js`) that prints a plan's analysis and the model documentation. JavaScript, built with [javascript-build](https://github.com/craigahobbs/javascript-build#readme) - see its [README](https://github.com/craigahobbs/sageroad/blob/main/viewer/README.md). |
| `plan/` | The planning tools - the site's USGS lidar terrain and features, road engineering, and a plan's run (`auto`) - which the application runs in the browser, and a command line for their development (`bin/plan.js`). JavaScript, built with [javascript-build](https://github.com/craigahobbs/javascript-build#readme). |
| `app/` | The SageRoad application - a Python package (`sageroad`), built with [python-build](https://github.com/craigahobbs/python-build#readme). Its command line, `sageroad`, serves the front end (the viewer's application and the planning tools, staged in the package) with a [chisel](https://github.com/craigahobbs/chisel#readme) back end - to this computer only. |
| `example/` | The example - its road site model, and its plan |

The planning tools' command line - `node plan/bin/plan.js site`, `options`, `route`, and `auto` -
checks the tools against the USGS's services, and compares their plans when they change. It doesn't
ask a model. `CLAUDE.md` is the repository guide for Claude Code.


### Publishing

`make site` stages the project's web site in `build/gh-pages/`: this README at its root (rendered by
`index.html`, a [MarkdownUp](https://github.com/craigahobbs/markdown-up#readme) page), the example
plan, and the viewer in `viewer/`. `make gh-pages` runs the pre-commit gate, stages the site, and
updates a checkout of the repository's `gh-pages` branch in `../sageroad.gh-pages` - commit and push it
there to publish (GitHub Pages serves the branch).

`make publish` runs the pre-commit gate, builds the package, and uploads it to PyPI (with
[twine](https://twine.readthedocs.io/) - it asks for a PyPI API token, or reads one from `~/.pypirc`).
It publishes only from a working tree without changes. The package's version is
`app/pyproject.toml`'s, and `make changelog` updates `CHANGELOG.md`.

The published viewer is the viewer's complete source - including the earthwork and cost model - and
the site is public. Road plans and map images are user data: don't add them to the site unless
they're meant to be public.
