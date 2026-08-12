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

CREATE TABLE IF NOT EXISTS sync_locks (
    name TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id TEXT PRIMARY KEY,
    sync_name TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    snapshot_date TEXT,
    initial_cards INTEGER,
    expected_api_cards INTEGER,
    fetched_cards INTEGER NOT NULL DEFAULT 0,
    unique_cards INTEGER NOT NULL DEFAULT 0,
    pages_committed INTEGER NOT NULL DEFAULT 0,
    snapshots_written INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    summary_json TEXT,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at
ON sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS card_sync_stage (
    run_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    is_new INTEGER NOT NULL,
    metadata_changed INTEGER NOT NULL,
    tcgplayer_changed INTEGER NOT NULL,
    cardmarket_changed INTEGER NOT NULL,
    number TEXT,
    name TEXT NOT NULL,
    set_id TEXT,
    set_name TEXT,
    image_small TEXT,
    image_large TEXT,
    raw_json TEXT NOT NULL,
    tcgplayer_prices TEXT,
    cardmarket_prices TEXT,
    tcgplayer_updated_at TEXT,
    cardmarket_updated_at TEXT,
    PRIMARY KEY (run_id, card_id)
);

CREATE TABLE IF NOT EXISTS news_content (
    feed TEXT PRIMARY KEY
        CHECK (feed IN ('general_news', 'biggest_movers')),
    payload_json TEXT NOT NULL
        CHECK (json_valid(payload_json)),
    source_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS justtcg_categories (
    category_key TEXT NOT NULL,
    period TEXT NOT NULL
        CHECK (period IN ('24h', '7d', '30d')),
    payload_json TEXT NOT NULL
        CHECK (json_valid(payload_json)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (category_key, period)
);
