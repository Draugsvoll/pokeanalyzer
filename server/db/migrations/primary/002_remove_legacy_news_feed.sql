CREATE TABLE news_content_migration_002 (
    feed TEXT PRIMARY KEY
        CHECK (feed = 'general_news'),
    payload_json TEXT NOT NULL
        CHECK (json_valid(payload_json)),
    source_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO news_content_migration_002 (
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

ALTER TABLE news_content_migration_002 RENAME TO news_content;
