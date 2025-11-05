<template>
  <div class="dashboard">
    <canvas ref="canvasRef" class="dashboard__canvas"></canvas>
    <div class="dashboard__overlay">
      <div class="overlay-row">
        <span>FPS</span>
        <strong>{{ debug.fps.toFixed(1) }}</strong>
      </div>
      <div class="overlay-row">
        <span>Render (ms)</span>
        <strong>{{ debug.renderMs.toFixed(2) }}</strong>
      </div>
      <div class="overlay-row">
        <span>Latency p50 (ms)</span>
        <strong>{{ debug.latencyP50.toFixed(1) }}</strong>
      </div>
      <div class="overlay-row">
        <span>Latency p95 (ms)</span>
        <strong>{{ debug.latencyP95.toFixed(1) }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useMetricsStore } from '../stores/metrics';
import { ensureMqttConnection } from '../mqttClient';
import type { MetricDescriptor } from '../workers/renderWorker';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const workerRef = ref<Worker | null>(null);
let animationId: number | null = null;

const METRIC_DESCRIPTORS: MetricDescriptor[] = [
  { metric: 'speed', label: 'Speed', unit: 'km/h' },
  { metric: 'rpm', label: 'Engine RPM', unit: 'rpm' },
  { metric: 'coolantTemp', label: 'Coolant Temp', unit: '°C' },
  { metric: 'oilTemp', label: 'Oil Temp', unit: '°C' },
  { metric: 'oilPressure', label: 'Oil Pressure', unit: 'kPa' },
  { metric: 'fuelLevel', label: 'Fuel Level', unit: '%' },
  { metric: 'batteryVoltage', label: 'Battery Voltage', unit: 'V' },
  { metric: 'steeringAngle', label: 'Steering Angle', unit: '°' },
  { metric: 'brakePressure', label: 'Brake Pressure', unit: 'bar' },
  { metric: 'throttlePosition', label: 'Throttle', unit: '%' },
  { metric: 'gear', label: 'Gear', unit: '' },
  { metric: 'ambientTemp', label: 'Ambient Temp', unit: '°C' },
  { metric: 'intakeTemp', label: 'Intake Temp', unit: '°C' },
  { metric: 'boostPressure', label: 'Boost Pressure', unit: 'kPa' },
  { metric: 'suspensionFL', label: 'Suspension FL', unit: 'mm' },
  { metric: 'suspensionFR', label: 'Suspension FR', unit: 'mm' },
  { metric: 'suspensionRL', label: 'Suspension RL', unit: 'mm' },
  { metric: 'suspensionRR', label: 'Suspension RR', unit: 'mm' },
  { metric: 'gForceLat', label: 'Lateral G', unit: 'g' },
  { metric: 'gForceLong', label: 'Longitudinal G', unit: 'g' }
];

const metricsStore = useMetricsStore();
const debug = reactive(metricsStore.debug);

function startFrameLoop() {
  const loop = () => {
    const updates = metricsStore.dequeueBatch();
    if (updates.length && workerRef.value) {
      workerRef.value.postMessage({ type: 'metricsBatch', updates });
    }
    animationId = requestAnimationFrame(loop);
  };
  animationId = requestAnimationFrame(loop);
}

function setupWorker(canvas: HTMLCanvasElement) {
  const offscreen = canvas.transferControlToOffscreen();
  const worker = new Worker(new URL('../workers/renderWorker.ts', import.meta.url), {
    type: 'module'
  });

  workerRef.value = worker;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  worker.postMessage(
    {
      type: 'init',
      canvas: offscreen,
      metrics: METRIC_DESCRIPTORS,
      width,
      height,
      devicePixelRatio: window.devicePixelRatio || 1
    },
    [offscreen]
  );

  worker.addEventListener('message', (event) => {
    const data = event.data;
    if (data?.type === 'debug') {
      const { fps, renderMs, latencyP50, latencyP95 } = data;
      metricsStore.updateDebug({ fps, renderMs, latencyP50, latencyP95 });
    }
  });
}

function handleResize() {
  if (!workerRef.value || !canvasRef.value) {
    return;
  }
  const width = canvasRef.value.clientWidth || canvasRef.value.width;
  const height = canvasRef.value.clientHeight || canvasRef.value.height;
  workerRef.value.postMessage({
    type: 'resize',
    width,
    height,
    devicePixelRatio: window.devicePixelRatio || 1
  });
}

onMounted(() => {
  ensureMqttConnection();
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }
  canvas.width = 1280;
  canvas.height = 720;
  canvas.style.width = '1280px';
  canvas.style.height = '720px';
  setupWorker(canvas);
  window.addEventListener('resize', handleResize);
  startFrameLoop();
});

onBeforeUnmount(() => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }
  window.removeEventListener('resize', handleResize);
  workerRef.value?.terminate();
});
</script>

<style scoped>
.dashboard {
  position: relative;
  width: 1280px;
  height: 720px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(77, 208, 225, 0.2);
}

.dashboard__canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.dashboard__overlay {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(12, 16, 24, 0.82);
  color: #e2ecf7;
  padding: 12px 16px;
  border-radius: 12px;
  font-family: 'Segoe UI', sans-serif;
  font-size: 14px;
  min-width: 180px;
  border: 1px solid rgba(77, 208, 225, 0.35);
  backdrop-filter: blur(6px);
}

.overlay-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.overlay-row:last-of-type {
  margin-bottom: 0;
}

.overlay-row strong {
  font-family: 'Rajdhani', sans-serif;
  font-size: 18px;
  color: #4dd0e1;
}
</style>
