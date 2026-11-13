# Roadie Planning Tools

The Roadie road planning tools - the command line tools that a road planning session (`make plan`) engineers a road
with - and the road planning instructions, [PLAN.md](PLAN.md). The tools are JavaScript (ES modules in `lib/`) built
with [javascript-build](https://github.com/craigahobbs/javascript-build#readme), and they use the
[Roadie viewer](../viewer/README.md)'s road plan model. See the project's [README](../README.md).

The tools are being converted from Python: until the conversion is complete, the Python tools in `legacy/` plan the
roads.

```sh
node bin/plan.js site <site.json> <plan.json>    # create a plan's site from a road site model - its lidar terrain
node bin/plan.js doc                             # the road site model documentation
```

A road site model (`<name>.site.json`) is a road's start and end points, as latitudes and longitudes, and its
planning instructions. `site` finds the USGS 3D Elevation Program's 1 meter elevation models of the site (lidar
ground elevations), reads the site's part of them (it's cached in the plan's work directory,
`<plan>.work/terrain/`), and grids them in the plan's coordinates - a transverse Mercator projection centered on
the site. The newest survey's elevations are used, and an older survey's where the newer have none. The site's
features are the USGS National Map's streams, roads, and trails, and the site's exclusion areas, and its
topographic map image (`<plan>.png`) is the National Map's.
