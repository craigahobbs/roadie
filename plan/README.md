# Roadie Planning Tools

The Roadie road planning tools - the command line tools that a road planning session (`make plan`) engineers a road
with - and the road planning instructions, [PLAN.md](PLAN.md). The tools are JavaScript (ES modules in `lib/`) built
with [javascript-build](https://github.com/craigahobbs/javascript-build#readme), and they use the
[Roadie viewer](../viewer/README.md)'s road plan model. See the project's [README](../README.md).

```sh
node bin/plan.js site <site.json> <plan.json>    # create a plan's site from a road site model - its lidar terrain
node bin/plan.js plot <plan.json> <plot.png>     # plot a plan - its terrain, features, and options
node bin/plan.js locate <plan.json> <lat,long>   # a latitude and longitude's plan coordinates (--xy: the reverse)
node bin/plan.js route <plan.json> -n NAME       # engineer a road option - its alignment, profile, and structures
node bin/plan.js profile <plan.json> -n NAME     # re-design an option's profile and structures
node bin/plan.js doc [site | plan]               # the road site model's documentation - or the road plan model's
```

`make plan FILE=<plan>.site.json` and `make update FILE=<plan.json>` launch a planning session (Claude Code) that
follows [PLAN.md](PLAN.md) with these tools, and `make evaluate FILE=<plan.json>` prints a plan's analysis and cost
(the viewer's).

A road site model (`<name>.site.json`) is a road's start and end points, as latitudes and longitudes, and its
planning instructions. `site` finds the USGS 3D Elevation Program's 1 meter elevation models of the site (lidar
ground elevations), reads the site's part of them (it's cached in the plan's work directory,
`<plan>.work/terrain/`), and grids them in the plan's coordinates - a transverse Mercator projection centered on
the site. The newest survey's elevations are used, and an older survey's where the newer have none. The site's
features are the USGS National Map's streams, roads, and trails, and the site's exclusion areas, and its
topographic map image (`<plan>.png`) is the National Map's.

`plot` draws a plan for the planning session to study: its terrain, shaded (lit from the northwest) with contours,
its features, each option's line with its stations and structures, and the plan's coordinates along its sides.

`route` searches for the least-cost horizontal alignment on a lattice with heading states (so its turns have the
minimum radius), designs the vertical profile by dynamic programming (the minimum earthwork cost within the grade
limits, within the maximum cut and fill depth of the ground), and places the structures (`lib/route.js`,
`lib/profile.js`, `lib/structures.js`). It's a port of the Python planning tools' (`legacy/`), which are kept, for
comparison, until the JavaScript tools are validated on a real site.
