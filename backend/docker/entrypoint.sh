#!/bin/sh
# Arranque de la api en docker compose: migraciones → seed si la base está vacía → servidor.
set -eu

echo "Aplicando migraciones..."
./node_modules/.bin/prisma migrate deploy

echo "Cargando datos de prueba si la base está vacía..."
./node_modules/.bin/tsx prisma/seed.ts --if-empty

echo "Iniciando la api..."
exec node dist/main.js
