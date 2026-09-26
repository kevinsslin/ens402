/** Isolated search database. No account, approval, wallet or payment tables are read. */
export const discoverySchema = `
CREATE TABLE IF NOT EXISTS discovery_refresh (
 id integer PRIMARY KEY CHECK (id=1), token text NOT NULL,
 lease_until timestamptz NOT NULL, next_attempt timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS discovery_catalog (
 id integer PRIMARY KEY CHECK (id=1), source jsonb NOT NULL, snapshot_hash text NOT NULL
);
ALTER TABLE discovery_catalog ADD COLUMN IF NOT EXISTS checkpoint jsonb;
CREATE TABLE IF NOT EXISTS discovery_services (
 name text PRIMARY KEY, service jsonb NOT NULL, content_hash text NOT NULL,
 search_document tsvector GENERATED ALWAYS AS
 (to_tsvector('simple', replace(name,'.',' ') || ' ' || coalesce(service->>'description',''))) STORED
);
CREATE INDEX IF NOT EXISTS discovery_services_keyword_idx ON discovery_services USING gin(search_document);
CREATE TABLE IF NOT EXISTS discovery_embeddings (
 name text PRIMARY KEY REFERENCES discovery_services(name) ON DELETE CASCADE,
 content_hash text NOT NULL, model text NOT NULL, vector double precision[],
 attempts integer NOT NULL DEFAULT 0, next_attempt bigint NOT NULL DEFAULT 0,
 lease text, lease_until bigint NOT NULL DEFAULT 0, last_error text
);
CREATE TABLE IF NOT EXISTS discovery_query_cache (
 key text PRIMARY KEY, model text NOT NULL, vector double precision[] NOT NULL, expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS discovery_query_budget (
 minute bigint PRIMARY KEY, attempts integer NOT NULL
);
`;
