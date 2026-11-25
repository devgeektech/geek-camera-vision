-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "vendor" TEXT NOT NULL DEFAULT 'dahua',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 554,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "channel" INTEGER NOT NULL DEFAULT 3,
    "subtype" INTEGER NOT NULL DEFAULT 1,
    "path" TEXT,
    "transport" TEXT NOT NULL DEFAULT 'tcp',
    "targetFps" INTEGER NOT NULL DEFAULT 2,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.45,
    "anchor" TEXT NOT NULL DEFAULT 'foot',
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastFrameAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeskZone" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#0f766e',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "occupyConfirmMs" INTEGER,
    "vacantConfirmMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeskZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OccupancyEvent" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "deskZoneId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "personCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OccupancyEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OccupancySession" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "deskZoneId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "maxPersonCount" INTEGER NOT NULL DEFAULT 1,
    "durationSeconds" INTEGER,

    CONSTRAINT "OccupancySession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Camera_name_key" ON "Camera"("name");
CREATE UNIQUE INDEX "Camera_host_channel_subtype_key" ON "Camera"("host", "channel", "subtype");
CREATE INDEX "Camera_enabled_idx" ON "Camera"("enabled");
CREATE INDEX "Camera_status_idx" ON "Camera"("status");
CREATE UNIQUE INDEX "DeskZone_cameraId_name_key" ON "DeskZone"("cameraId", "name");
CREATE INDEX "DeskZone_cameraId_idx" ON "DeskZone"("cameraId");
CREATE INDEX "OccupancyEvent_deskZoneId_occurredAt_idx" ON "OccupancyEvent"("deskZoneId", "occurredAt");
CREATE INDEX "OccupancyEvent_cameraId_occurredAt_idx" ON "OccupancyEvent"("cameraId", "occurredAt");
CREATE INDEX "OccupancySession_deskZoneId_startedAt_idx" ON "OccupancySession"("deskZoneId", "startedAt");
CREATE INDEX "OccupancySession_deskZoneId_endedAt_idx" ON "OccupancySession"("deskZoneId", "endedAt");
CREATE INDEX "OccupancySession_startedAt_idx" ON "OccupancySession"("startedAt");
CREATE UNIQUE INDEX "OccupancySession_one_open_per_zone" ON "OccupancySession"("deskZoneId") WHERE "endedAt" IS NULL;

ALTER TABLE "DeskZone" ADD CONSTRAINT "DeskZone_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OccupancyEvent" ADD CONSTRAINT "OccupancyEvent_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OccupancyEvent" ADD CONSTRAINT "OccupancyEvent_deskZoneId_fkey" FOREIGN KEY ("deskZoneId") REFERENCES "DeskZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OccupancySession" ADD CONSTRAINT "OccupancySession_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OccupancySession" ADD CONSTRAINT "OccupancySession_deskZoneId_fkey" FOREIGN KEY ("deskZoneId") REFERENCES "DeskZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
