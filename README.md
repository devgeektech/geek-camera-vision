# VisionOps

On-prem desk occupancy for an office CCTV recorder. It detects people and measures how long each drawn desk is occupied. It does not identify anyone.

The recorder is Dahua-style. Each camera row stores the host, port, username, password, channel, and subtype separately. The RTSP path is `/cam/realmonitor?channel=N&subtype=S`.

## Apps

- `apps/web` — Next.js desk. Live, Cameras, Desks, and Reports.
- `apps/api` — Fastify API and Socket.IO.
- `apps/worker` — FFmpeg ingest and YOLOv8n person detection.
- `packages/db` — Prisma and Postgres.
- `packages/shared` — occupancy timing, geometry, and the detection post-process.

A camera streams only when it has at least one enabled desk, or while its camera page is open. Detection runs one frame at a time.

## Local development

Postgres is published on port **5433** so it does not fight a Windows Postgres already using 5432.

```powershell
copy .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
node scripts/download-model.mjs
pnpm dev
```

Open http://localhost:3000. The API is on port 4000.

Fill `.env` before the first start. Required values include `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `WORKER_SHARED_SECRET`. `.env` is gitignored.

`pnpm dev` is the development process. `docker compose up` also builds and starts the API, worker, and web, and those containers take ports 3000 and 4000. Do not run the full compose stack while `pnpm dev` is running.

FFmpeg must be on `PATH`, or set `FFMPEG_PATH` to the executable. The person model is `models/yolov8n.onnx`. The ONNX file is not committed. See `models/README.md`.

## Cameras on a new server

There is no camera dump in git. When the API starts, it creates the recorder channels from the environment if `CAMERA_HOST`, `CAMERA_USERNAME`, and `CAMERA_PASSWORD` are set.

```
CAMERA_HOST=192.168.1.245
CAMERA_PORT=554
CAMERA_USERNAME=
CAMERA_PASSWORD=
CAMERA_CHANNELS=1-12
CAMERA_SUBTYPE=1
```

`CAMERA_CHANNELS=1-12` saves Channel 1 through Channel 12. A channel that already exists is updated with that username, password, and port. It is not duplicated.

The server must be able to reach the recorder on port 554. Rows can exist and still stay offline when the host is unreachable.

Desks are stored in Postgres, not in the repo. A fresh database has the seeded cameras and no desks. Draw them again, or restore the database if the drawn desks should move with the deploy.

## Occupancy

A sit is confirmed after 8 seconds. A desk becomes vacant after 45 seconds empty. Business hours for the daily report are 09:00–18:00 `Asia/Kolkata`.

Occupied time counts only while the desk was actually being watched. A visit left open while the server was off does not fill the next morning. Utilization is occupied / (occupied + vacant). Unknown time is excluded.

## Production compose

```powershell
docker compose up -d
```

Postgres, the API, the worker, and the web start together. Put the same `.env` next to `docker-compose.yml` before building. The worker image expects FFmpeg and reads the ONNX file from `./models`.
