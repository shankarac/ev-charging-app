CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(username) REFERENCES users(username)
);

CREATE TABLE IF NOT EXISTS bookings(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    station_name TEXT NOT NULL,
    station_address TEXT NOT NULL,
    distance TEXT NOT NULL,
    booking_time TEXT NOT NULL,
    charger_type TEXT NOT NULL,
    units INTEGER NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Booked',
    payment_status TEXT NOT NULL DEFAULT 'Pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(username) REFERENCES users(username)
);

CREATE INDEX IF NOT EXISTS idx_bookings_username
ON bookings(username);

CREATE INDEX IF NOT EXISTS idx_bookings_station_name
ON bookings(station_name);

CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_token
ON password_reset_tokens(token);

CREATE TABLE IF NOT EXISTS station_notifications(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    username TEXT NOT NULL,
    station_name TEXT NOT NULL,
    station_address TEXT NOT NULL,
    distance TEXT NOT NULL,
    booking_time TEXT NOT NULL,
    charger_type TEXT NOT NULL,
    units INTEGER NOT NULL,
    price REAL NOT NULL,
    booking_history_url TEXT NOT NULL,
    app_dashboard_url TEXT NOT NULL,
    payment_page_url TEXT NOT NULL,
    station_map_url TEXT NOT NULL,
    payment_reference TEXT,
    payment_status TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_station_notifications_station_name
ON station_notifications(station_name);

CREATE INDEX IF NOT EXISTS idx_station_notifications_is_read
ON station_notifications(is_read);
