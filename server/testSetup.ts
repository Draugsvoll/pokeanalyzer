// Server tests must never inherit a shared PokeTrace database from .env.
process.env.POKETRACE_DATABASE_URL = "file::memory:";
delete process.env.POKETRACE_DATABASE_AUTH_TOKEN;
