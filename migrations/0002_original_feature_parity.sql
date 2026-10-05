PRAGMA foreign_keys = ON;

-- Paridade funcional com o RSVP original, adaptada ao ambiente multi-tenant comercial.
ALTER TABLE events ADD COLUMN list_behavior TEXT NOT NULL DEFAULT 'strict'
  CHECK(list_behavior IN ('strict','flexible'));
ALTER TABLE events ADD COLUMN extra_fields TEXT NOT NULL DEFAULT '{"phone":true,"dietary":true,"notes":false,"message":true}';
ALTER TABLE events ADD COLUMN public_texts TEXT NOT NULL DEFAULT '{}';
ALTER TABLE events ADD COLUMN archived_at TEXT;

ALTER TABLE guests ADD COLUMN group_label TEXT NOT NULL DEFAULT '';
ALTER TABLE guests ADD COLUMN max_adults_allowed INTEGER
  CHECK(max_adults_allowed IS NULL OR (max_adults_allowed BETWEEN 0 AND 100));
ALTER TABLE guests ADD COLUMN max_children_allowed INTEGER
  CHECK(max_children_allowed IS NULL OR (max_children_allowed BETWEEN 0 AND 100));
ALTER TABLE guests ADD COLUMN creation_request_id TEXT;
ALTER TABLE guests ADD COLUMN source TEXT NOT NULL DEFAULT 'admin'
  CHECK(source IN ('public','client','admin','import'));
ALTER TABLE guests ADD COLUMN responded_at TEXT;
ALTER TABLE guests ADD COLUMN deleted_at TEXT;
ALTER TABLE guests ADD COLUMN notes TEXT NOT NULL DEFAULT '';

ALTER TABLE guest_members ADD COLUMN is_preapproved INTEGER NOT NULL DEFAULT 1
  CHECK(is_preapproved IN (0,1));

ALTER TABLE event_media ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'background_image'
  CHECK(media_kind IN ('background_image','background_video','cover','logo','other'));
ALTER TABLE event_media ADD COLUMN original_name TEXT NOT NULL DEFAULT '';
ALTER TABLE event_media ADD COLUMN deleted_at TEXT;

ALTER TABLE audit_logs ADD COLUMN event_id TEXT;
ALTER TABLE audit_logs ADD COLUMN guest_id TEXT;

UPDATE audit_logs
SET event_id = json_extract(details,'$.event_id'),
    guest_id = json_extract(details,'$.guest_id')
WHERE details IS NOT NULL AND json_valid(details);

CREATE INDEX IF NOT EXISTS events_status_tenant ON events(studio_id,status,created_at);
CREATE INDEX IF NOT EXISTS guests_event_deleted ON guests(event_id,deleted_at,name);
CREATE INDEX IF NOT EXISTS guests_event_response ON guests(event_id,response_status,deleted_at);
CREATE INDEX IF NOT EXISTS audit_event ON audit_logs(event_id,created_at);
CREATE INDEX IF NOT EXISTS audit_guest ON audit_logs(guest_id,created_at);
CREATE INDEX IF NOT EXISTS media_event_active ON event_media(event_id,deleted_at,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS guests_creation_request
ON guests(event_id,creation_request_id)
WHERE creation_request_id IS NOT NULL;
