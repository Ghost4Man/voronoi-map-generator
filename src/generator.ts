import * as d3 from 'd3';

export type Point = [number, number];
export type CellIndex = number & { readonly __tag: unique symbol }
export type RegionId = number & { readonly __tag: unique symbol }

export type RegionMap = {
  /** Maps cell/point index to region ID */
  getRegion(cellIndex: CellIndex): { regionId: RegionId | undefined };
}

export type RegionGenerationStep = RegionMap & {
  /**
   * Description of the action performed in this step, e.g., "Filled cell 42 with region 3"
   */
  stepDescription: string;
  /**
   * Cells that are currently part of the frontier of the active region
   */
  activeRegionFrontier: Set<CellIndex>;
}

export enum RegionGenerationMethod {
  FloodFill = 'floodFill',
  None = 'none'
}

type Region = {
  id: RegionId,
  /**
   * Cells that are part of the current region but not surrounded by it
   * (some of their neighbor cells belong to other regions)
   */
  frontier: Set<CellIndex>
}

let rngSeed = Math.random();
let lcg: () => number;
let randomInt: d3.RandomInt;
let randomUniform: d3.RandomUniform;
// Make sure to always use `randomInt` and `randomUniform` for
// random number generation to ensure reproducibility

export function setRandomSeed(seed: number): void {
  rngSeed = seed;
  lcg = d3.randomLcg(rngSeed);
  randomInt = d3.randomInt.source(lcg);
  randomUniform = d3.randomUniform.source(lcg);
}

/**
 * Generate random regions using flood fill
 * @param voronoi The Voronoi diagram instance
 * @param pointCount Total number of points
 * @param desiredRegions Number of regions to generate
 * @param minRegionSize Minimum size of each region
 * @return A sequence of (animation) steps, each step represented by an array mapping each point to its region ID
 */
export function* generateRegions(
  voronoi: d3.Voronoi<d3.Delaunay.Point>,
  pointCount: number,
  desiredRegions: number,
  minRegionSize: number,
  method: RegionGenerationMethod
): Generator<RegionGenerationStep> {

  const noRegion = { regionId: undefined };

  if (desiredRegions <= 0 || minRegionSize <= 0 || method === RegionGenerationMethod.None) {
    const regionMap: RegionGenerationStep = {
      getRegion: _ => noRegion,
      stepDescription: '',
      activeRegionFrontier: new Set<CellIndex>()
    }; // Initial empty region map
    yield regionMap;
    return; // No regions to generate
  }

  if (method === RegionGenerationMethod.FloodFill) {
    yield* generateRegionsFloodFill(voronoi, pointCount, desiredRegions, minRegionSize);
  } else {
    throw new Error(`Unknown region generation method: ${method}`);
  }
}

/**
 * Generate random regions using flood fill
 * @param voronoi The Voronoi diagram instance
 * @param pointCount Total number of points
 * @param regionCount Number of regions to generate
 * @param minRegionSize Minimum size of each region
 * @return A sequence of (animation) steps, each step represented by a mapping from each point/cell to its region ID
 */
function* generateRegionsFloodFill(
  voronoi: d3.Voronoi<d3.Delaunay.Point>,
  pointCount: number,
  regionCount: number,
  minRegionSize: number
): Generator<RegionGenerationStep> {

  if (pointCount < regionCount * minRegionSize) {
    throw new Error(`Not enough points to generate ${regionCount} regions with minimum size ${minRegionSize}.`);
  }

  let step = 0;
  const regionAssignment: RegionId[] = new Array(pointCount).fill(-1 as RegionId);
  const stepWhenCellWasFilled: number[] = new Array(pointCount).fill(Infinity); // Track when each cell was filled (for animation)
  const regions: Region[] = initializeRegions(regionCount, regionAssignment); // (writes to `regionAssignment` and `stepWhenCellWasFilled`)
  const growableRegions = new Set<RegionId>(regions.map(r => r.id)); // Regions that can still grow (have frontier cells)

  yield createStep(step, regionAssignment, -1, "Initialized regions in random locations.");
  step++;

  // Iteratively add cells to regions one by one, until we fill the whole space (all cells are assigned).

  while (growableRegions.size > 0) {
    const region = selectRandomItemFromIterable(growableRegions)!; // pick a region to fill
    const cell = pickCellToFill(regions[region], regionAssignment, voronoi);
    if (cell === undefined) {
      // If no cell can be filled, remove the region from the growable set
      growableRegions.delete(region);
      continue; // Skip to the next iteration
    }

    // Fill the cell
    regionAssignment[cell] = region; // Assign the cell to the region
    stepWhenCellWasFilled[cell] = step; // Mark when this cell was filled
    regions[region].frontier.add(cell); // Add the newly filled cell to the frontier of the region
    pruneFrontierCells(regions[region]); // Remove any cells that are no longer frontier cells

    if (step > 10000) {
      throw new Error("Too many steps, likely an infinite loop. Check the region generation logic.");
    }

    yield createStep(step, regionAssignment, region, `Filled cell ${cell} with region ${region}`);
    step++;
  }

  function createStep(step: number, regionAssignment: RegionId[], region: number, description: string): RegionGenerationStep {
    return {
      getRegion: (cellIndex: CellIndex) => ({
        regionId: (step >= stepWhenCellWasFilled[cellIndex] && regionAssignment[cellIndex] > -1)
          ? regionAssignment[cellIndex]
          : undefined
      }),
      stepDescription: description,
      activeRegionFrontier: new Set<CellIndex>(regions[region]?.frontier ?? [])
    };
  }

  function initializeRegions(regionCount: number, regionAssignment: RegionId[]): Region[] {
    const regions: Region[] = [];
    for (let i = 0; i < regionCount; i++) {
      const startCell = repeatUntilPasses(
        () => randomInt(0, pointCount)() as CellIndex,
        (cellIndex) => regionAssignment[cellIndex] === -1
      );
      regions.push({
        id: i as RegionId,
        frontier: new Set<CellIndex>([startCell])
      });
      regionAssignment[startCell] = i as RegionId; // Assign the starting cell to the region
      stepWhenCellWasFilled[startCell] = step; // Mark when this cell was filled
    }
    return regions;
  }

  function pruneFrontierCells(region: Region): void {
    // remove any cells that are no longer frontier cells (i.e., all neighbors are already assigned to the region)
    for (const cell of region.frontier) {
      const neighbors = voronoi.neighbors(cell) as Iterable<CellIndex>;
      if ([...neighbors].every(n => regionAssignment[n] === region.id)) {
        region.frontier.delete(cell);
      }
    }
  }
}

function pickCellToFill(region: Region, regionAssignment: RegionId[], voronoi: d3.Voronoi<Point>): CellIndex | undefined {
  // collect all neighbors of the frontier cells that are not already assigned to a region
  const availableNeighbors = new Set<CellIndex>();
  for (const cell of region.frontier) {
    const neighbors = voronoi.neighbors(cell) as Iterable<CellIndex>;
    for (const neighbor of neighbors) {
      if (regionAssignment[neighbor] === -1) {
        availableNeighbors.add(neighbor);
      }
    }
  }
  
  // sort by score and pick the one with the highest score
  const sortedNeighbors = d3.sort(
    [...availableNeighbors]
      .map(n => ({ cellIndex: n, score: computeScore(n, [...voronoi.neighbors(n)] as CellIndex[], regionAssignment, region.id) })),
    n => -n.score,
    n => n.cellIndex // to break ties, we can use the cell index as a secondary criterion
  );

  return sortedNeighbors[0]?.cellIndex; // Pick the highest-score neighbor
}

function computeScore(_cellIndex: CellIndex, neighbors: CellIndex[], regionAssignment: RegionId[], regionId: RegionId): number {
  // higher-score cells will be added first
  // Score is based on the number of neighbors that are already part of the same region
  const countOfNeighborsInSameRegion = neighbors
    .filter(n => regionAssignment[n] === regionId)
    .length;

  return countOfNeighborsInSameRegion;
}

function selectRandomItemFromIterable<T>(available: Iterable<T> & { size: number }): T | undefined {
  const randomIndex = randomInt(0, available.size)();
  let currentIndex = 0;
  for (const value of available) {
    if (currentIndex === randomIndex) return value;
    currentIndex++;
  }
  return undefined;
}

function repeatUntilPasses<T>(fn: () => T, predicate: (value: T) => boolean): T {
  let value: T;

  do {
    value = fn();
  } while (!predicate(value));

  return value;
}
