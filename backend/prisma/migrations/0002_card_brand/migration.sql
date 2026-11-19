-- Marca de la tarjeta: con los últimos 4 dígitos, lo único que se guarda de ella (principio X).
-- CreateEnum
CREATE TYPE "CardBrand" AS ENUM ('VISA', 'MASTERCARD', 'DISCOVER', 'OTHER');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "card_brand" "CardBrand" NOT NULL DEFAULT 'OTHER';
