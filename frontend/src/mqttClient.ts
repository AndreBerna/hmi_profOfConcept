import mqtt, { type MqttClient } from 'mqtt';
import { useMetricsStore, type MetricPayload } from './stores/metrics';

let client: MqttClient | null = null;

function resolveBrokerUrl(): string {
  const host = (import.meta.env.VITE_MQTT_HOST as string) || window.location.hostname || '127.0.0.1';
  const port = (import.meta.env.VITE_MQTT_PORT as string) || '8083';
  return `ws://${host}:${port}/mqtt`;
}

export function ensureMqttConnection(): MqttClient {
  if (client) {
    return client;
  }

  const store = useMetricsStore();

  client = mqtt.connect(resolveBrokerUrl(), {
    clean: false,
    reconnectPeriod: 1000,
    clientId: `hmi-${Math.random().toString(16).slice(2, 10)}`,
    keepalive: 30
  });

  client.on('connect', () => {
    client?.subscribe('vehicle/#', (err) => {
      if (err) {
        console.error('Failed to subscribe to vehicle topics', err);
      }
    });
  });

  client.on('message', (_topic, payload) => {
    try {
      const decoded = JSON.parse(payload.toString()) as MetricPayload;
      store.addMeasurement(decoded);
    } catch (err) {
      console.error('Failed to parse MQTT payload', err);
    }
  });

  client.on('error', (err) => {
    console.error('MQTT client error', err);
  });

  return client;
}
