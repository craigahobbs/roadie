# Roadie Planning Tools

The Roadie road planning tools - the command line tools that a road planning session (`make plan`) engineers a road
with - and the road planning instructions, [PLAN.md](PLAN.md). The tools are JavaScript (ES modules in `lib/`) built
with [javascript-build](https://github.com/craigahobbs/javascript-build#readme), and they use the
[Roadie viewer](../viewer/README.md)'s road plan model. See the project's [README](../README.md).

The tools are being converted from Python: until the conversion is complete, the Python tools in `legacy/` plan the
roads.

```sh
node bin/plan.js doc    # the road site model documentation
```
