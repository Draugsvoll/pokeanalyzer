CREATE TABLE news_content_migration_003 (
    feed TEXT PRIMARY KEY
        CHECK (feed IN ('general_news', 'market_summary')),
    payload_json TEXT NOT NULL
        CHECK (json_valid(payload_json)),
    source_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO news_content_migration_003 (
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
WHERE feed IN ('general_news', 'market_summary');

DROP TABLE news_content;

ALTER TABLE news_content_migration_003 RENAME TO news_content;
