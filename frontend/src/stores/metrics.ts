import { defineStore } from 'pinia';
import { reactive } from 'vue';

export interface MetricPayload {
  metric: string;
  label: string;
  unit: string;
  value: number;
  timestamp: number;
}

export interface DebugStats {
  fps: number;
  renderMs: number;
  latencyP50: number;
  latencyP95: number;
}

export const useMetricsStore = defineStore('metrics', () => {
  const metrics = reactive<Record<string, MetricPayload>>({});
  const queue: MetricPayload[] = [];
  const debug = reactive<DebugStats>({ fps: 0, renderMs: 0, latencyP50: 0, latencyP95: 0 });

  function addMeasurement(payload: MetricPayload) {
    metrics[payload.metric] = payload;
    queue.push(payload);
  }

  function dequeueBatch(): MetricPayload[] {
    if (queue.length === 0) {
      return [];
    }
    return queue.splice(0, queue.length);
  }

  function updateDebug(next: Partial<DebugStats>) {
    Object.assign(debug, next);
  }

  return {
    metrics,
    debug,
    addMeasurement,
    dequeueBatch,
    updateDebug
  };
});
