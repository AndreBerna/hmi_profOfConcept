export interface MetricDescriptor {
  metric: string;
  label: string;
  unit: string;
}

interface MetricRenderState extends MetricDescriptor {
  value: number;
  timestamp: number;
}

interface InitMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  metrics: MetricDescriptor[];
  width: number;
  height: number;
  devicePixelRatio: number;
}

interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
  devicePixelRatio: number;
}

interface MetricBatchMessage {
  type: 'metricsBatch';
  updates: MetricRenderState[];
}

type WorkerMessage = InitMessage | ResizeMessage | MetricBatchMessage;

declare const self: DedicatedWorkerGlobalScope;

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 1280;
let height = 720;
let dpr = 1;
let metrics: MetricDescriptor[] = [];
const metricState = new Map<string, MetricRenderState>();
const dirtyMetrics = new Set<string>();
let needsFullRedraw = true;
let lastFrameTime = performance.now();
let fps = 60;
let renderMs = 0;
const latencySamples: number[] = [];

const backgroundColor = '#0c1018';
const cardColor = '#1f2a3b';
const accentColor = '#4dd0e1';
const valueColor = '#f4faff';
const textColor = '#9db0c6';

function ensureContext() {
  if (!canvas) {
    return;
  }
  ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D context');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.textBaseline = 'middle';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resize(nextWidth: number, nextHeight: number, nextDpr: number) {
  width = nextWidth;
  height = nextHeight;
  dpr = nextDpr;
  if (!canvas) {
    return;
  }
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ensureContext();
  dirtyMetrics.clear();
  metrics.forEach((m) => dirtyMetrics.add(m.metric));
  needsFullRedraw = true;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function computeCardRect(index: number) {
  const columns = 4;
  const gap = 16;
  const cardWidth = (width - gap * (columns + 1)) / columns;
  const cardHeight = 120;
  const xIndex = index % columns;
  const yIndex = Math.floor(index / columns);
  const x = gap + xIndex * (cardWidth + gap);
  const y = gap + yIndex * (cardHeight + gap);
  return { x, y, cardWidth, cardHeight };
}

function drawMetric(metric: MetricRenderState, index: number) {
  if (!ctx) {
    return;
  }
  const { x, y, cardWidth, cardHeight } = computeCardRect(index);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, cardWidth, cardHeight);
  ctx.clip();

  ctx.fillStyle = cardColor;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(x, y, cardWidth, cardHeight);
  ctx.globalAlpha = 1;

  ctx.fillStyle = accentColor;
  ctx.fillRect(x, y, 4, cardHeight);

  ctx.fillStyle = textColor;
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.fillText(metric.label, x + 20, y + 30);

  ctx.fillStyle = valueColor;
  ctx.font = '48px "Rajdhani", sans-serif';
  const valueText = `${metric.value}`;
  ctx.fillText(valueText, x + 20, y + cardHeight / 2 + 10);

  ctx.fillStyle = textColor;
  ctx.font = '20px "Segoe UI", sans-serif';
  ctx.fillText(metric.unit, x + 20, y + cardHeight - 28);

  ctx.restore();
}

function clearMetricArea(index: number) {
  if (!ctx) {
    return;
  }
  const { x, y, cardWidth, cardHeight } = computeCardRect(index);
  ctx.clearRect(x - 2, y - 2, cardWidth + 4, cardHeight + 4);
}

function drawBackground() {
  if (!ctx) {
    return;
  }
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
}

function renderFrame(now: DOMHighResTimeStamp) {
  if (!ctx) {
    self.requestAnimationFrame(renderFrame);
    return;
  }

  const frameDelta = now - lastFrameTime;
  if (frameDelta > 0) {
    fps = 1000 / frameDelta;
  }
  lastFrameTime = now;

  const start = performance.now();
  if (needsFullRedraw) {
    drawBackground();
    metrics.forEach((descriptor, index) => {
      const state = metricState.get(descriptor.metric);
      if (state) {
        drawMetric(state, index);
      }
    });
    needsFullRedraw = false;
    dirtyMetrics.clear();
  } else if (dirtyMetrics.size > 0) {
    metrics.forEach((descriptor, index) => {
      if (dirtyMetrics.has(descriptor.metric)) {
        clearMetricArea(index);
        const state = metricState.get(descriptor.metric);
        if (state) {
          drawMetric(state, index);
        }
      }
    });
    dirtyMetrics.clear();
  }
  renderMs = performance.now() - start;

  const latencyP50 = quantile(latencySamples, 0.5);
  const latencyP95 = quantile(latencySamples, 0.95);

  self.postMessage({
    type: 'debug',
    fps,
    renderMs,
    latencyP50,
    latencyP95
  });

  self.requestAnimationFrame(renderFrame);
}

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const data = event.data;
  switch (data.type) {
    case 'init': {
      canvas = data.canvas;
      metrics = data.metrics;
      resize(data.width, data.height, data.devicePixelRatio);
      metrics.forEach((descriptor) => {
        metricState.set(descriptor.metric, {
          ...descriptor,
          value: 0,
          timestamp: 0
        });
        dirtyMetrics.add(descriptor.metric);
      });
      ensureContext();
      needsFullRedraw = true;
      self.requestAnimationFrame(renderFrame);
      break;
    }
    case 'resize': {
      resize(data.width, data.height, data.devicePixelRatio);
      break;
    }
    case 'metricsBatch': {
      data.updates.forEach((update) => {
        const state = metricState.get(update.metric);
        if (!state) {
          metricState.set(update.metric, { ...update });
        } else {
          state.value = update.value;
          state.timestamp = update.timestamp;
        }
        latencySamples.push(performance.now() - update.timestamp);
        if (latencySamples.length > 360) {
          latencySamples.splice(0, latencySamples.length - 360);
        }
        dirtyMetrics.add(update.metric);
      });
      break;
    }
    default:
      break;
  }
});
