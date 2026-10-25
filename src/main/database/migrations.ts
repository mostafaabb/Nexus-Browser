/**
 * Schema migrations.
 *
 * Migrations are applied in order and recorded in `schema_migrations`. Each
 * migration is idempotent (`IF NOT EXISTS`) so that a partially applied
 * migration can be safely re-run.
 */

export interface Migration {
  version: number
  name: string
  up: (exec: (sql: string) => void) => void
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: (exec) => {
      exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key         TEXT PRIMARY KEY,
          value       TEXT NOT NULL,
          updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bookmarks (
          id          TEXT PRIMARY KEY,
          parent_id   TEXT REFERENCES bookmarks(id) ON DELETE CASCADE,
          title       TEXT NOT NULL,
          url         TEXT,
          position    INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bookmarks_parent ON bookmarks(parent_id, position);

        CREATE TABLE IF NOT EXISTS history (
          id               TEXT PRIMARY KEY,
          url              TEXT NOT NULL UNIQUE,
          title            TEXT NOT NULL DEFAULT '',
          visited_at       INTEGER NOT NULL,
          first_visited_at INTEGER NOT NULL,
          visit_count      INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_history_visited ON history(visited_at DESC);
        CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);

        CREATE TABLE IF NOT EXISTS downloads (
          id             TEXT PRIMARY KEY,
          url            TEXT NOT NULL,
          filename       TEXT NOT NULL,
          path           TEXT,
          mime_type      TEXT,
          total_bytes    INTEGER,
          received_bytes INTEGER NOT NULL DEFAULT 0,
          status         TEXT NOT NULL,
          started_at     INTEGER NOT NULL,
          ended_at       INTEGER,
          error          TEXT,
          referrer       TEXT,
          save_as        INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_downloads_started ON downloads(started_at DESC);

        CREATE TABLE IF NOT EXISTS workspaces (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          icon       TEXT NOT NULL DEFAULT 'globe',
          color      TEXT NOT NULL DEFAULT '#8b5cf6',
          position   INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          layout     TEXT NOT NULL DEFAULT 'single'
        );

        CREATE TABLE IF NOT EXISTS workspace_tabs (
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          tab_id       TEXT PRIMARY KEY,
          position     INTEGER NOT NULL DEFAULT 0,
          group_id     TEXT,
          pinned       INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_tabs ON workspace_tabs(workspace_id, position);

        CREATE TABLE IF NOT EXISTS tab_groups (
          id           TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          name         TEXT NOT NULL,
          color        TEXT NOT NULL DEFAULT '#8b5cf6',
          collapsed    INTEGER NOT NULL DEFAULT 0,
          position     INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_tab_groups_workspace ON tab_groups(workspace_id, position);

        CREATE TABLE IF NOT EXISTS recently_closed (
          id           TEXT PRIMARY KEY,
          url          TEXT NOT NULL,
          title        TEXT NOT NULL DEFAULT '',
          workspace_id TEXT,
          group_id     TEXT,
          closed_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_recently_closed ON recently_closed(closed_at DESC);

        CREATE TABLE IF NOT EXISTS saved_sessions (
          id           TEXT PRIMARY KEY,
          name         TEXT NOT NULL,
          workspace_id TEXT,
          created_at   INTEGER NOT NULL,
          updated_at   INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saved_session_tabs (
          session_id TEXT NOT NULL REFERENCES saved_sessions(id) ON DELETE CASCADE,
          tab_id     TEXT NOT NULL,
          url        TEXT NOT NULL,
          title      TEXT NOT NULL DEFAULT '',
          position   INTEGER NOT NULL DEFAULT 0,
          group_id   TEXT,
          PRIMARY KEY (session_id, tab_id)
        );

        CREATE TABLE IF NOT EXISTS snippet_folders (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          position   INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS snippets (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          code        TEXT NOT NULL,
          language    TEXT NOT NULL DEFAULT 'plaintext',
          folder_id   TEXT REFERENCES snippet_folders(id) ON DELETE SET NULL,
          tags        TEXT NOT NULL DEFAULT '[]',
          favorite    INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_snippets_folder ON snippets(folder_id);

        CREATE TABLE IF NOT EXISTS api_collections (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_requests (
          id            TEXT PRIMARY KEY,
          collection_id TEXT REFERENCES api_collections(id) ON DELETE SET NULL,
          name          TEXT NOT NULL,
          method        TEXT NOT NULL,
          url           TEXT NOT NULL,
          query         TEXT NOT NULL DEFAULT '[]',
          headers       TEXT NOT NULL DEFAULT '[]',
          body_type     TEXT NOT NULL DEFAULT 'none',
          body          TEXT NOT NULL DEFAULT '',
          notes         TEXT NOT NULL DEFAULT '',
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_api_requests_collection ON api_requests(collection_id);

        CREATE TABLE IF NOT EXISTS ai_conversations (
          id         TEXT PRIMARY KEY,
          title      TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model      TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          persisted  INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at DESC);

        CREATE TABLE IF NOT EXISTS ai_messages (
          id              TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
          role            TEXT NOT NULL,
          content         TEXT NOT NULL DEFAULT '',
          created_at      INTEGER NOT NULL,
          status          TEXT NOT NULL DEFAULT 'complete',
          context_labels  TEXT NOT NULL DEFAULT '[]',
          error           TEXT,
          usage           TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);

        CREATE TABLE IF NOT EXISTS permission_decisions (
          origin     TEXT NOT NULL,
          permission TEXT NOT NULL,
          decision   TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (origin, permission)
        );

        CREATE TABLE IF NOT EXISTS http_history (
          id          TEXT PRIMARY KEY,
          method      TEXT NOT NULL,
          url         TEXT NOT NULL,
          status      INTEGER,
          duration_ms INTEGER,
          created_at  INTEGER NOT NULL,
          error       TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_http_history_created ON http_history(created_at DESC);
      `)
    }
  },
  {
    version: 2,
    name: 'encrypted-credentials',
    up: (exec) => {
      exec(`
        CREATE TABLE IF NOT EXISTS secrets (
          key        TEXT PRIMARY KEY,
          value      BLOB NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `)
    }
  },
  {
    version: 3,
    name: 'session-recovery',
    up: (exec) => {
      exec(`
        ALTER TABLE workspace_tabs ADD COLUMN url TEXT NOT NULL DEFAULT '';
        ALTER TABLE workspace_tabs ADD COLUMN title TEXT NOT NULL DEFAULT '';
      `)
    }
  }
]
