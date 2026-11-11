-- ZameenDost D1 schema (SQLite). Geometries are GeoJSON text; area is recomputed server-side.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  language TEXT NOT NULL DEFAULT 'ur' CHECK (language IN ('ur','en')),
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  district TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_farms_user ON farms(user_id);
CREATE TABLE fields (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  geometry_geojson TEXT NOT NULL,
  area_ha REAL NOT NULL,
  centroid_lat REAL NOT NULL,
  centroid_lon REAL NOT NULL,
  elevation_m REAL,
  crop TEXT NOT NULL,
  planting_date TEXT NOT NULL,
  soil TEXT NOT NULL,
  soil_confirmed INTEGER NOT NULL DEFAULT 0,
  irrigation_method TEXT NOT NULL CHECK (irrigation_method IN ('flood','basin','furrow','sprinkler','drip')),
  water_source TEXT CHECK (water_source IN ('canal','electric_tubewell','diesel_pump','solar_pump','mixed')),
  pump_kw REAL, pump_discharge_m3h REAL, pump_head_m REAL, pump_efficiency REAL,
  fuel_l_per_h REAL, tariff_per_kwh REAL, diesel_price_per_l REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fields_user ON fields(user_id);
CREATE TABLE irrigation_reports (
  id TEXT PRIMARY KEY,
  field_id TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('yes','no','partial')),
  pumping_hours REAL, gross_depth_mm REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (field_id, date)
);
CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  field_id TEXT NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (field_id, date)
);
CREATE TABLE weather_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
CREATE TABLE daily_usage (day TEXT NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, metric));
