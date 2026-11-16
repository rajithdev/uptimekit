-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('PENDING', 'UP', 'DOWN', 'PAUSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'HEAD');

-- CreateEnum
CREATE TYPE "CheckResult" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INCIDENT_OPENED', 'INCIDENT_RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" "HttpMethod" NOT NULL DEFAULT 'GET',
    "interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
    "expected_status_codes" TEXT NOT NULL DEFAULT '200-299',
    "keyword" TEXT,
    "follow_redirects" BOOLEAN NOT NULL DEFAULT true,
    "failure_threshold" INTEGER NOT NULL DEFAULT 2,
    "recovery_threshold" INTEGER NOT NULL DEFAULT 2,
    "retry_interval_seconds" INTEGER NOT NULL DEFAULT 20,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "MonitorStatus" NOT NULL DEFAULT 'PENDING',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "consecutive_successes" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMP(3),
    "last_response_time_ms" INTEGER,
    "last_status_code" INTEGER,
    "last_error" TEXT,
    "last_status_change_at" TIMESTAMP(3),
    "next_check_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" BIGSERIAL NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "result" "CheckResult" NOT NULL,
    "response_time_ms" INTEGER,
    "status_code" INTEGER,
    "error_type" TEXT,
    "error_message" TEXT,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_rollups_hourly" (
    "monitor_id" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "total_checks" INTEGER NOT NULL DEFAULT 0,
    "up_checks" INTEGER NOT NULL DEFAULT 0,
    "down_checks" INTEGER NOT NULL DEFAULT 0,
    "response_time_sum_ms" BIGINT NOT NULL DEFAULT 0,
    "response_time_count" INTEGER NOT NULL DEFAULT 0,
    "min_response_time_ms" INTEGER,
    "max_response_time_ms" INTEGER,

    CONSTRAINT "check_rollups_hourly_pkey" PRIMARY KEY ("monitor_id","hour")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "cause" TEXT NOT NULL,
    "error_type" TEXT,
    "status_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "user_id" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_down" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_recovery" BOOLEAN NOT NULL DEFAULT true,
    "alert_email" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "recipient" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "monitors_user_id_created_at_idx" ON "monitors"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "monitors_status_next_check_at_idx" ON "monitors"("status", "next_check_at");

-- CreateIndex
CREATE INDEX "checks_monitor_id_checked_at_idx" ON "checks"("monitor_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "checks_checked_at_idx" ON "checks"("checked_at");

-- CreateIndex
CREATE INDEX "check_rollups_hourly_hour_idx" ON "check_rollups_hourly"("hour");

-- CreateIndex
CREATE INDEX "incidents_user_id_started_at_idx" ON "incidents"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_monitor_id_started_at_idx" ON "incidents"("monitor_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_incident_id_type_channel_key" ON "notifications"("incident_id", "type", "channel");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_rollups_hourly" ADD CONSTRAINT "check_rollups_hourly_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written constraints (not expressible in Prisma schema) ───────────────

-- At most ONE unresolved incident per monitor. This is the database-level guarantee that
-- concurrent workers or retried jobs can never open duplicate incidents for the same outage.
CREATE UNIQUE INDEX "incidents_one_open_per_monitor" ON "incidents" ("monitor_id") WHERE "resolved_at" IS NULL;

-- Scheduler hot path: only active monitors are ever claimed.
CREATE INDEX "monitors_due_active_idx" ON "monitors" ("next_check_at") WHERE "status" <> 'PAUSED';

-- Defensive bounds mirroring the Zod validation layer.
ALTER TABLE "monitors"
  ADD CONSTRAINT "monitors_interval_bounds" CHECK ("interval_seconds" BETWEEN 5 AND 86400),
  ADD CONSTRAINT "monitors_timeout_bounds" CHECK ("timeout_ms" BETWEEN 1000 AND 60000),
  ADD CONSTRAINT "monitors_failure_threshold_bounds" CHECK ("failure_threshold" BETWEEN 1 AND 10),
  ADD CONSTRAINT "monitors_recovery_threshold_bounds" CHECK ("recovery_threshold" BETWEEN 1 AND 10),
  ADD CONSTRAINT "monitors_retry_interval_bounds" CHECK ("retry_interval_seconds" BETWEEN 5 AND 3600);

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_resolution_consistent" CHECK ("resolved_at" IS NULL OR "resolved_at" >= "started_at");
