import mqtt, { IClientPublishOptions } from 'mqtt';

interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  frequency: number; // Hz
  precision?: number;
}

interface MetricState {
  value: number;
  target: number;
}

const metrics: MetricDefinition[] = [
  { id: 'speed', label: 'Speed', unit: 'km/h', min: 0, max: 240, frequency: 20 },
  { id: 'rpm', label: 'Engine RPM', unit: 'rpm', min: 600, max: 7500, frequency: 50 },
  { id: 'coolantTemp', label: 'Coolant Temp', unit: '°C', min: 60, max: 110, frequency: 5 },
  { id: 'oilTemp', label: 'Oil Temp', unit: '°C', min: 60, max: 140, frequency: 5 },
  { id: 'oilPressure', label: 'Oil Pressure', unit: 'kPa', min: 100, max: 600, frequency: 10 },
  { id: 'fuelLevel', label: 'Fuel Level', unit: '%', min: 0, max: 100, frequency: 1, precision: 1 },
  { id: 'batteryVoltage', label: 'Battery Voltage', unit: 'V', min: 11.5, max: 14.5, frequency: 2, precision: 2 },
  { id: 'steeringAngle', label: 'Steering Angle', unit: '°', min: -450, max: 450, frequency: 30, precision: 1 },
  { id: 'brakePressure', label: 'Brake Pressure', unit: 'bar', min: 0, max: 120, frequency: 20, precision: 1 },
  { id: 'throttlePosition', label: 'Throttle', unit: '%', min: 0, max: 100, frequency: 30, precision: 1 },
  { id: 'gear', label: 'Gear', unit: '', min: 1, max: 8, frequency: 5 },
  { id: 'ambientTemp', label: 'Ambient Temp', unit: '°C', min: -10, max: 45, frequency: 1, precision: 1 },
  { id: 'intakeTemp', label: 'Intake Temp', unit: '°C', min: 10, max: 70, frequency: 5 },
  { id: 'boostPressure', label: 'Boost Pressure', unit: 'kPa', min: 90, max: 220, frequency: 20, precision: 1 },
  { id: 'suspensionFL', label: 'Suspension FL', unit: 'mm', min: -50, max: 50, frequency: 15, precision: 1 },
  { id: 'suspensionFR', label: 'Suspension FR', unit: 'mm', min: -50, max: 50, frequency: 15, precision: 1 },
  { id: 'suspensionRL', label: 'Suspension RL', unit: 'mm', min: -50, max: 50, frequency: 15, precision: 1 },
  { id: 'suspensionRR', label: 'Suspension RR', unit: 'mm', min: -50, max: 50, frequency: 15, precision: 1 },
  { id: 'gForceLat', label: 'Lateral G', unit: 'g', min: -1.5, max: 1.5, frequency: 30, precision: 2 },
  { id: 'gForceLong', label: 'Longitudinal G', unit: 'g', min: -1.5, max: 1.5, frequency: 30, precision: 2 }
];

const mqttHost = process.env.MQTT_HOST ?? 'localhost';
const mqttPort = Number(process.env.MQTT_PORT ?? '1883');

const client = mqtt.connect({
  protocol: 'mqtt',
  host: mqttHost,
  port: mqttPort,
  clientId: `simulator-${Math.random().toString(16).slice(2, 10)}`,
  clean: false,
  reconnectPeriod: 1000
});

const metricState = new Map<string, MetricState>();

const publishOptions: IClientPublishOptions = {
  qos: 0,
  retain: true
};

client.on('connect', () => {
  console.log(`Simulator connected to MQTT at ${mqttHost}:${mqttPort}`);
});

client.on('reconnect', () => console.log('Simulator reconnecting...'));
client.on('error', (err) => console.error('MQTT error', err));

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function nextTarget(def: MetricDefinition): number {
  return Math.random() * (def.max - def.min) + def.min;
}

function initializeState(def: MetricDefinition): MetricState {
  const base = nextTarget(def);
  return { value: base, target: nextTarget(def) };
}

function updateValue(def: MetricDefinition, state: MetricState): number {
  const bias = 0.02;
  const delta = (state.target - state.value) * bias;
  const noise = (Math.random() - 0.5) * (def.max - def.min) * 0.002;
  let next = state.value + delta + noise;
  if (Math.abs(state.target - next) < (def.max - def.min) * 0.01) {
    state.target = nextTarget(def);
  }
  if (def.id === 'gear') {
    next = Math.round(next);
  }
  state.value = clamp(next, def.min, def.max);
  return state.value;
}

function startMetric(def: MetricDefinition) {
  const state = initializeState(def);
  metricState.set(def.id, state);
  const interval = 1000 / def.frequency;

  const emit = () => {
    const value = updateValue(def, state);
    const timestamp = Date.now();
    const payload = {
      metric: def.id,
      label: def.label,
      unit: def.unit,
      value: Number(value.toFixed(def.precision ?? 0)),
      timestamp
    };
    client.publish(`vehicle/${def.id}`, JSON.stringify(payload), publishOptions, (err) => {
      if (err) {
        console.error(`Failed to publish ${def.id}`, err);
      }
    });
  };

  emit();
  setInterval(emit, interval);
}

metrics.forEach(startMetric);

process.on('SIGTERM', () => {
  client.end(false, () => process.exit(0));
});
