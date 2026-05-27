CREATE TABLE IF NOT EXISTS managed_stations(
    id SERIAL PRIMARY KEY,
    station_name TEXT NOT NULL,
    station_address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_stations_name
ON managed_stations(lower(station_name));

CREATE INDEX IF NOT EXISTS idx_managed_stations_active
ON managed_stations(is_active);
