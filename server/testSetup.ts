// Server tests must never inherit shared databases from .env.
process.env.TURSO_DATABASE_URL = "file::memory:";
delete process.env.TURSO_AUTH_TOKEN;
process.env.POKETRACE_DATABASE_URL = "file::memory:";
delete process.env.POKETRACE_DATABASE_AUTH_TOKEN;
