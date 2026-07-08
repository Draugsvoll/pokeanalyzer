CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    number TEXT,
    name TEXT NOT NULL,
    set_id TEXT,
    set_name TEXT,
    image_small TEXT,
    image_large TEXT,
    raw_json TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    recorded_at DATE NOT NULL,
    tcgplayer_prices TEXT,
    cardmarket_prices TEXT,
    tcgplayer_updated_at TEXT,
    cardmarket_updated_at TEXT,

    UNIQUE(card_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_card_date
ON price_snapshots(card_id, recorded_at);