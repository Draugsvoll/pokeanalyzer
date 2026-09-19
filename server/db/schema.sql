CREATE TABLE IF NOT EXISTS sync_locks (
    name TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS news_content (
    feed TEXT PRIMARY KEY
        CHECK (feed IN ('general_news', 'biggest_movers')),
    payload_json TEXT NOT NULL
        CHECK (json_valid(payload_json)),
    source_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
