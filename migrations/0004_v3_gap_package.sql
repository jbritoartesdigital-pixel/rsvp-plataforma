PRAGMA foreign_keys = ON;

-- V3: reusable RSVP templates and safe operational/admin metadata.
-- Additive only: no existing production rows are rewritten or removed.
CREATE TABLE event_templates (
 id TEXT PRIMARY KEY,
 studio_id TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
 name TEXT NOT NULL COLLATE NOCASE,
 config TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(studio_id,name),
 UNIQUE(id,studio_id)
);

CREATE TABLE template_media (
 id TEXT PRIMARY KEY,
 template_id TEXT NOT NULL,
 studio_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
 media_kind TEXT NOT NULL DEFAULT 'background_image'
  CHECK(media_kind IN ('background_image','background_video','cover','logo','other')),
 original_name TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 FOREIGN KEY(template_id,studio_id) REFERENCES event_templates(id,studio_id) ON DELETE CASCADE
);

ALTER TABLE studios ADD COLUMN commercial_category TEXT NOT NULL DEFAULT 'other'
 CHECK(commercial_category IN ('paying','courtesy','partner','test','other'));

CREATE TABLE integration_events (
 id TEXT PRIMARY KEY,
 studio_id TEXT REFERENCES studios(id) ON DELETE SET NULL,
 provider TEXT NOT NULL,
 kind TEXT NOT NULL,
 external_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('ok','attention','error')),
 message TEXT NOT NULL DEFAULT '',
 details TEXT NOT NULL DEFAULT '{}',
 source_key TEXT UNIQUE,
 created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS templates_tenant_updated ON event_templates(studio_id,updated_at);
CREATE INDEX IF NOT EXISTS template_media_tenant ON template_media(studio_id,template_id,created_at);
CREATE INDEX IF NOT EXISTS integration_status_created ON integration_events(status,created_at);
CREATE INDEX IF NOT EXISTS integration_tenant_created ON integration_events(studio_id,created_at);
