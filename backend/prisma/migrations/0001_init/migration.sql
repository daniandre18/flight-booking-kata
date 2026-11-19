-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FlightStatus" AS ENUM ('SCHEDULED', 'DELAYED', 'CANCELLED', 'SOLD_OUT');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED');

-- CreateEnum
CREATE TYPE "FlightEventType" AS ENUM ('SEAT_HELD', 'SEAT_RELEASED', 'SEAT_BOOKED', 'FLIGHT_UPDATED');

-- CreateTable
CREATE TABLE "airports" (
    "code" CHAR(3) NOT NULL,
    "city" TEXT NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "flights" (
    "id" UUID NOT NULL,
    "flight_number" TEXT NOT NULL,
    "origin" CHAR(3) NOT NULL,
    "destination" CHAR(3) NOT NULL,
    "scheduled_departure_at" TIMESTAMPTZ(3) NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "fare" INTEGER NOT NULL,
    "status" "FlightStatus" NOT NULL DEFAULT 'SCHEDULED',
    "capacity" SMALLINT NOT NULL DEFAULT 180,
    "seq" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seats" (
    "id" UUID NOT NULL,
    "flight_id" UUID NOT NULL,
    "row" SMALLINT NOT NULL,
    "letter" CHAR(1) NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "held_by" UUID,
    "hold_expires_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "code" CHAR(6) NOT NULL,
    "flight_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_email" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "card_last4" CHAR(4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_seats" (
    "booking_id" UUID NOT NULL,
    "seat_id" UUID NOT NULL,
    "passenger_name" TEXT NOT NULL,

    CONSTRAINT "booking_seats_pkey" PRIMARY KEY ("booking_id","seat_id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "client_id" UUID NOT NULL,
    "key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "booking_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("client_id","key")
);

-- CreateTable
CREATE TABLE "flight_events" (
    "flight_id" UUID NOT NULL,
    "seq" BIGINT NOT NULL,
    "type" "FlightEventType" NOT NULL,
    "seat_code" VARCHAR(3),
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flight_events_pkey" PRIMARY KEY ("flight_id","seq")
);

-- CreateIndex
CREATE INDEX "flights_origin_destination_departure_at_idx" ON "flights"("origin", "destination", "departure_at");

-- CreateIndex
CREATE UNIQUE INDEX "flights_flight_number_scheduled_departure_at_key" ON "flights"("flight_number", "scheduled_departure_at");

-- CreateIndex
CREATE INDEX "seats_flight_id_status_idx" ON "seats"("flight_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seats_flight_id_row_letter_key" ON "seats"("flight_id", "row", "letter");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings"("code");

-- CreateIndex
CREATE INDEX "bookings_code_buyer_email_idx" ON "bookings"("code", "buyer_email");

-- CreateIndex
CREATE UNIQUE INDEX "booking_seats_seat_id_key" ON "booking_seats"("seat_id");

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_origin_fkey" FOREIGN KEY ("origin") REFERENCES "airports"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_destination_fkey" FOREIGN KEY ("destination") REFERENCES "airports"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_events" ADD CONSTRAINT "flight_events_flight_id_fkey" FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Restricciones que Prisma no expresa (data-model.md). Si se generan nuevas
-- migraciones con `prisma migrate dev`, revisar que no eliminen estos objetos.
-- ---------------------------------------------------------------------------

-- flights.origin <> flights.destination; departure_at >= scheduled_departure_at; arrival_at > departure_at
ALTER TABLE "flights"
  ADD CONSTRAINT "flights_origin_destination_check" CHECK ("origin" <> "destination"),
  ADD CONSTRAINT "flights_departure_not_before_schedule_check" CHECK ("departure_at" >= "scheduled_departure_at"),
  ADD CONSTRAINT "flights_arrival_after_departure_check" CHECK ("arrival_at" > "departure_at"),
  ADD CONSTRAINT "flights_fare_positive_check" CHECK ("fare" > 0),
  ADD CONSTRAINT "flights_seq_non_negative_check" CHECK ("seq" >= 0);

-- seats.row 1–30, seats.letter A–F, y HELD ⇔ dueño y vencimiento presentes
ALTER TABLE "seats"
  ADD CONSTRAINT "seats_row_range_check" CHECK ("row" BETWEEN 1 AND 30),
  ADD CONSTRAINT "seats_letter_range_check" CHECK ("letter" IN ('A', 'B', 'C', 'D', 'E', 'F')),
  ADD CONSTRAINT "seats_hold_consistency_check" CHECK (
    ("status" = 'HELD') = ("held_by" IS NOT NULL AND "hold_expires_at" IS NOT NULL)
  );

-- bookings.code: 6 caracteres A-Z0-9; total positivo
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_code_format_check" CHECK ("code" ~ '^[A-Z0-9]{6}$'),
  ADD CONSTRAINT "bookings_total_positive_check" CHECK ("total" > 0),
  ADD CONSTRAINT "bookings_card_last4_check" CHECK ("card_last4" ~ '^[0-9]{4}$');

-- Índices parciales para el límite de 4, el reloj compartido y el barrido de vencidos
CREATE INDEX "seats_flight_id_held_by_held_idx" ON "seats" ("flight_id", "held_by") WHERE "status" = 'HELD';
CREATE INDEX "seats_hold_expires_at_held_idx" ON "seats" ("hold_expires_at") WHERE "status" = 'HELD';
