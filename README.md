# Voronoi Map Generator

A simple demo of generating fictional political maps (of countries, regions, ...) using Voronoi diagrams (with Lloyd relaxation), e.g. for procedural map generation in games.

## Development

This project uses Deno 2.3.6+ and Vite 6.3.5+.

To launch the dev server, run:

```bash
deno task dev
```

## TODO

- [x] basic flood-fill (growing from a seed) algorithm
- [ ] more algorithms (methods)
- [x] step slider (to step through the algorithm)
- [x] canvas rendering
- [ ] SVG rendering
  - [ ] zoom
  - [ ] pan
- [ ] throttle/debounce setting changes
- [ ] non-blocking computation
- [ ] export?
- [ ] configurable display (e.g. whether to highlight the frontier)
- [ ] LOD (show more detail as you zoom in)
