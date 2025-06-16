import './style.css'
import * as d3 from 'd3';
import { CellIndex, generateRegions, Point, RegionGenerationMethod, RegionGenerationStep, setRandomSeed } from './generator.ts';

const WIDTH = 800;
const HEIGHT = 600;

const canvas = document.getElementById('voronoiCanvas') as HTMLCanvasElement;
const ctx = canvas?.getContext('2d') as CanvasRenderingContext2D;
if (ctx == null) {
  throw new Error('Canvas context not available. Ensure the canvas element exists and is correctly referenced.');
}


const animationStepInput = document.getElementById('animationStep') as HTMLInputElement;
const regionGenerationMethodSelect = document.getElementById('regionGenerationMethod') as HTMLSelectElement;
const regionCountSlider = document.getElementById('regionCount') as HTMLInputElement;
const minRegionSizeSlider = document.getElementById('minRegionSize') as HTMLInputElement;
const iterationsSlider = document.getElementById('iterations') as HTMLInputElement;
const stepDescriptionElement = document.getElementById('stepDescription') as HTMLElement;
const statusElement = document.getElementById('status') as HTMLElement;


function generatePoints(n: number): Point[] {
  const points: Point[] = Array.from({ length: n }, () => [
    Math.random() * WIDTH,
    Math.random() * HEIGHT
  ]);
  return points;
}

// Compute centroids for Lloyd relaxation
function computeCentroids(voronoi: d3.Voronoi<Point>, points: Point[]): Point[] {
  return points.map((_, i) => d3.polygonCentroid(voronoi.cellPolygon(i)));
}

// Draw the base diagram with points only
function drawVoronoi(voronoi: d3.Voronoi<Point>, points: Point[]) {
  const computedStyle = getComputedStyle(canvas);
  const getColor = (cssVarName: string) => computedStyle.getPropertyValue(cssVarName).trim();

  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // Draw cells
  ctx.strokeStyle = getColor('--gray-4');
  ctx.beginPath();
  voronoi.render(ctx);
  ctx.stroke();

  // Draw points
  ctx.fillStyle = "red";
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// Draw the diagram with regions
function drawVoronoiWithRegions(voronoi: d3.Voronoi<Point>, step: RegionGenerationStep) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const colors = d3.schemeCategory10.concat(d3.schemeSet3);
  const cellCount = voronoi.delaunay.points.length;
  const computedStyle = getComputedStyle(canvas);
  const getColor = (cssVarName: string) => computedStyle.getPropertyValue(cssVarName).trim();

  for (let i = 0 as CellIndex; i < cellCount; i++) {
    const region = step.getRegion(i);
    const cell = voronoi.cellPolygon(i);
    if (!cell) continue;

    ctx.beginPath();
    ctx.moveTo(...cell[0]);
    for (let j = 1; j < cell.length; j++) {
      ctx.lineTo(...cell[j]);
    }
    ctx.closePath();

    ctx.lineWidth = 1;
    ctx.fillStyle = "transparent";
    ctx.strokeStyle = getColor('--map-empty-cell-stroke');

    if (region.regionId != null) {
      ctx.fillStyle = colors[region.regionId % colors.length];
      ctx.strokeStyle = getColor('--map-filled-cell-stroke');
      ctx.fill();
    }
    ctx.stroke();

    if (step.activeRegionFrontier.has(i)) {
      ctx.strokeStyle = getColor('--map-frontier-cell-stroke');
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (region.regionId != null) {
      ctx.save();
      ctx.globalAlpha = 0.2; // Make the non-frontier cells semi-transparent
      ctx.fillStyle = getColor('--bg');
      ctx.fill();
      ctx.restore();
    }

    // Draw the cell index and region ID
    if (cellCount < 300) {
      ctx.fillStyle = (region.regionId != null)
        ? getColor('--map-filled-cell-text-color')
        : getColor('--map-empty-cell-text-color');
      ctx.font = '12px sans-serif';
      const [cx, cy] = d3.polygonCentroid(cell);
      const text = `${i}`;
      ctx.textAlign = 'center';
      ctx.fillText(text, cx, cy);
    }
  }
}

type GeneratedMap = {
  points: Point[];
  voronoi: d3.Voronoi<Point>;
  steps: RegionGenerationStep[];
};

function regenerateMap(points: Point[]): GeneratedMap {
  statusElement.textContent = '';
  statusElement.classList.remove('error');

  const regionCount = parseInt(regionCountSlider.value);
  const minRegionSize = parseInt(minRegionSizeSlider.value);
  const iterations = parseInt(iterationsSlider.value);

  for (let i = 0; i < iterations; i++) {
    const delaunay = d3.Delaunay.from(points);
    const voronoi = delaunay.voronoi([0, 0, WIDTH, HEIGHT]);
    points = computeCentroids(voronoi, points);
  }

  const delaunay = d3.Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, WIDTH, HEIGHT]);

  setRandomSeed(0.123456789); // Set a fixed seed for reproducibility

  const method = regionGenerationMethodSelect.value as RegionGenerationMethod;
  let steps: RegionGenerationStep[];
  try {
    steps = Array.from(generateRegions(voronoi, points.length, regionCount, minRegionSize, method));
  } catch (error) {
    console.error("Error generating regions:", error);
    statusElement.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    statusElement.classList.add('error');
    return { points, voronoi, steps: [] };
  }
  animationStepInput.max = (steps.length - 1).toString();
  return { points, voronoi, steps };
}

function redraw(generatedMap: GeneratedMap, stepIndex?: number) {
  stepIndex ??= parseInt(animationStepInput.value);
  const method = regionGenerationMethodSelect.value as RegionGenerationMethod;
  if (method === RegionGenerationMethod.None) {
    drawVoronoi(generatedMap.voronoi, generatedMap.points);
  }
  else if (generatedMap.steps.length > 0) {
    const step = generatedMap.steps[stepIndex];
    stepDescriptionElement.textContent = step.stepDescription;
    drawVoronoiWithRegions(generatedMap.voronoi, step);
  }
}

const inputsThatShouldRegenerate = [
  '#regionCount',
  '#minRegionSize',
  '#iterations',
  '#numPoints'
];
const numPointsInput = document.getElementById('numPoints') as HTMLInputElement;
let points = generatePoints(parseInt(numPointsInput.value));
let generatedMap: GeneratedMap;

numPointsInput.addEventListener('input', (event) => {
  const numPoints = parseInt((event.target as HTMLInputElement).value);
  points = generatePoints(numPoints);
  // regenerating the map is already handled by the input event listeners attached to `inputsThatShouldRegenerate`
});

inputsThatShouldRegenerate.forEach(selector => {
  document.querySelector(selector)?.addEventListener('input', () => { regenerateAndRedraw(); });
});
regionGenerationMethodSelect.addEventListener('change', () => { onGenerationMethodChanged(); });
animationStepInput.addEventListener('input', () => {
  redraw(generatedMap);
  // console.debug(generatedMap.steps[parseInt(animationStepInput.value)]);
});

// Initial generation and drawing
onGenerationMethodChanged();


function regenerateAndRedraw() {
  generatedMap = regenerateMap(points);
  redraw(generatedMap);
}

function onGenerationMethodChanged() {
  regenerateAndRedraw();
  const method = regionGenerationMethodSelect.value as RegionGenerationMethod;
  const conditionalSettings = document.querySelectorAll('.conditional-setting-group') as NodeListOf<HTMLFieldSetElement>;
  conditionalSettings.forEach(group => {
    group.hidden = group.disabled = (group.dataset.mapgenMethod !== method);
  });
}


