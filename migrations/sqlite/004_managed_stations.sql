CREATE TABLE IF NOT EXISTS managed_stations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_name TEXT NOT NULL,
    station_address TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_stations_name
ON managed_stations(lower(station_name));

CREATE INDEX IF NOT EXISTS idx_managed_stations_active
ON managed_stations(is_active);
