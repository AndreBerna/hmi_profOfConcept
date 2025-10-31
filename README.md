# Automotive HMI Proof of Concept

This repository contains a complete automotive HMI dashboard prototype that runs entirely inside Podman (or Docker) containers. It includes:

- **NanoMQ** MQTT broker with TCP (1883) and WebSocket (8083) endpoints.
- **TypeScript telemetry simulator** that streams ~20 metrics at 1–50 Hz with retained messages.
- **Vue 3 + Vite frontend** that renders the dashboard at 60 FPS using OffscreenCanvas in a dedicated worker, Pinia state management, and mqtt.js for WebSocket connectivity.
- **Podman-compatible compose setup** to orchestrate the broker, simulator, and dashboard.

## Architecture

| Service | Technology | Description |
| --- | --- | --- |
| `nanomq` | [NanoMQ](https://nanomq.io/) | Lightweight MQTT broker exposing MQTT and MQTT over WebSocket endpoints. |
| `simulator` | Node.js + TypeScript | Publishes 20 automotive metrics (`vehicle/<metric>`) with retained messages and configurable update rates. |
| `hmi` | Vue 3, Pinia, mqtt.js | Subscribes to telemetry over WebSocket, batches updates per animation frame, and renders widgets via an OffscreenCanvas worker with dirty-region redraw and a live debug overlay. |

## Prerequisites

- Podman 4.4+ (or Docker 20.10+)
- `podman-compose` plugin (or `docker compose` if using Docker)

## Quick start

```bash
podman compose up -d --build
```

Once all services are healthy, open the dashboard in your browser:

```
http://127.0.0.1:8080
```

You should immediately see 20 animated metrics. Retained MQTT values are replayed on refresh for instant state restoration.

### Stopping the stack

```bash
podman compose down
```

## Development workflow

- **Simulator**: TypeScript source lives in `simulator/src`. Run locally with `npm install && npm run dev`.
- **Frontend**: Vue application in `frontend/`. Run locally via `npm install` then `npm run dev` (uses your local MQTT broker at `ws://localhost:8083/mqtt`).
- **Broker configuration**: Update NanoMQ options in `config/nanomq.conf` as needed.

## Telemetry metrics

The simulator publishes the following metrics (topic `vehicle/<metric>`):

| Metric | Description | Rate |
| --- | --- | --- |
| speed | Vehicle speed (km/h) | 20 Hz |
| rpm | Engine RPM | 50 Hz |
| coolantTemp | Coolant temperature (°C) | 5 Hz |
| oilTemp | Oil temperature (°C) | 5 Hz |
| oilPressure | Oil pressure (kPa) | 10 Hz |
| fuelLevel | Fuel remaining (%) | 1 Hz |
| batteryVoltage | Battery voltage (V) | 2 Hz |
| steeringAngle | Steering angle (°) | 30 Hz |
| brakePressure | Brake pressure (bar) | 20 Hz |
| throttlePosition | Throttle position (%) | 30 Hz |
| gear | Current gear | 5 Hz |
| ambientTemp | Ambient temperature (°C) | 1 Hz |
| intakeTemp | Intake temperature (°C) | 5 Hz |
| boostPressure | Boost pressure (kPa) | 20 Hz |
| suspensionFL | Suspension travel front-left (mm) | 15 Hz |
| suspensionFR | Suspension travel front-right (mm) | 15 Hz |
| suspensionRL | Suspension travel rear-left (mm) | 15 Hz |
| suspensionRR | Suspension travel rear-right (mm) | 15 Hz |
| gForceLat | Lateral acceleration (g) | 30 Hz |
| gForceLong | Longitudinal acceleration (g) | 30 Hz |

Each payload contains `metric`, `label`, `unit`, `value`, and `timestamp` (ms) and is published with the retain flag for instant replay.

## Rendering pipeline highlights

- MQTT updates are queued in Pinia and flushed once per `requestAnimationFrame` to avoid redundant renders.
- A single OffscreenCanvas worker renders all widgets, minimizing main-thread work.
- Dirty-region rendering clears and redraws only the tiles whose data changed.
- A debug overlay surfaces live FPS, render time, and p50/p95 end-to-end latency (publish to pixels).

## Troubleshooting

- **Nothing renders**: Ensure WebSocket port 8083 is reachable (`curl http://127.0.0.1:8083/mqtt` should respond) and that your browser allows insecure WebSocket if using HTTP.
- **Different hostname**: Set `VITE_MQTT_HOST` and `VITE_MQTT_PORT` environment variables before building the `hmi` image if the broker is not on the same host.
- **Podman Desktop**: Podman Desktop defaults to rootless networks; exposing 1883/8083 may require adding them to the rootless allowed ports.
- **Image pull fails with short-name errors**: Podman requires fully qualified image names. The compose file references `docker.io/emqx/nanomq:0.21.4`, but if your registry policy differs update the `image` field accordingly or configure `/etc/containers/registries.conf`.

## License

MIT
