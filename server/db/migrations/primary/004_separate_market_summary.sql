CREATE TABLE market_summary_content (
    id INTEGER PRIMARY KEY
        CHECK (id = 1),
    payload_json TEXT NOT NULL
        CHECK (json_valid(payload_json)),
    generated_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO market_summary_content (
    id,
    payload_json,
    generated_at,
    updated_at
)
SELECT
    1,
    payload_json,
    source_date,
    updated_at
FROM news_content
WHERE feed = 'market_summary';

CREATE TABLE news_content_migration_004 (
    feed TEXT PRIMARY KEY
        CHECK (feed = 'general_news'),
    payload_json TEXT NOT NULL
        CHECK (json_valid(payload_json)),
    source_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO news_content_migration_004 (
    feed,
    payload_json,
    source_date,
    updated_at
)
SELECT
    feed,
    payload_json,
    source_date,
    updated_at
FROM news_content
WHERE feed = 'general_news';

DROP TABLE news_content;

ALTER TABLE news_content_migration_004 RENAME TO news_content;
