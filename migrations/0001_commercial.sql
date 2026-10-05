PRAGMA foreign_keys = ON;
CREATE TABLE studios (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, whatsapp TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 billing_mode TEXT NOT NULL DEFAULT 'credits' CHECK(billing_mode IN ('credits','monthly')),
 billing_generation INTEGER NOT NULL DEFAULT 0, subscription_id TEXT,
 monthly_until TEXT, credits INTEGER NOT NULL DEFAULT 0, brand TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE users (
 id TEXT PRIMARY KEY, studio_id TEXT REFERENCES studios(id), email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('super_admin','studio_owner','studio_user')), created_at TEXT NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, impersonated_studio_id TEXT REFERENCES studios(id)
);
CREATE TABLE user_revocations (user_id TEXT PRIMARY KEY REFERENCES users(id), revoked_at TEXT NOT NULL);
CREATE TABLE auth_challenges (
 id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('register','authenticate','reset')), challenge TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE TABLE passkeys (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 public_key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE billing_orders (
 id TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id), generation INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('credits','monthly')), quantity INTEGER NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), status TEXT NOT NULL DEFAULT 'pending',
 provider_id TEXT UNIQUE, checkout_url TEXT, created_at TEXT NOT NULL, credited_payment_id TEXT
);
CREATE TABLE payments (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES billing_orders(id),
 status TEXT NOT NULL, amount_cents INTEGER NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE subscription_invoices (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES billing_orders(id), payment_id TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL, period_end TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE credit_ledger (
 id TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id), delta INTEGER NOT NULL,
 reason TEXT NOT NULL, source_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TRIGGER ledger_balance AFTER INSERT ON credit_ledger BEGIN
 UPDATE studios SET credits = credits + NEW.delta WHERE id = NEW.studio_id;
END;
CREATE TABLE events (
 id TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id), title TEXT NOT NULL, slug TEXT NOT NULL,
 event_date TEXT, location TEXT, deadline TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived')),
 rsvp_mode TEXT NOT NULL DEFAULT 'free' CHECK(rsvp_mode IN ('free','list')),
 max_people INTEGER NOT NULL DEFAULT 10 CHECK(max_people BETWEEN 1 AND 100),
 checkin_mode TEXT NOT NULL DEFAULT 'off' CHECK(checkin_mode IN ('off','family','individual')),
 appearance TEXT NOT NULL DEFAULT '{}', welcome_message TEXT NOT NULL DEFAULT '',
 client_token TEXT NOT NULL UNIQUE, client_permissions TEXT NOT NULL DEFAULT '{"view":true,"manage_guests":false}',
 created_at TEXT NOT NULL, UNIQUE(studio_id,slug), UNIQUE(id,studio_id)
);
-- Allocation and debit run inside the event INSERT transaction: no read-then-debit race.
CREATE TRIGGER event_entitlement BEFORE INSERT ON events BEGIN
 SELECT (CASE WHEN NOT EXISTS (
  SELECT 1 FROM studios WHERE id = NEW.studio_id AND status = 'active' AND
  ((billing_mode = 'credits' AND credits >= 1) OR (billing_mode = 'monthly' AND monthly_until > NEW.created_at))
 ) THEN RAISE(ABORT,'NO_ENTITLEMENT') END);
END;
CREATE TRIGGER event_debit AFTER INSERT ON events
WHEN (SELECT billing_mode FROM studios WHERE id = NEW.studio_id) = 'credits' BEGIN
 INSERT INTO credit_ledger VALUES(lower(hex(randomblob(16))),NEW.studio_id,-1,'event','event:' || NEW.id,NEW.created_at);
END;
CREATE TABLE guests (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', response_status TEXT NOT NULL DEFAULT 'pending' CHECK(response_status IN ('pending','yes','no')),
 max_people INTEGER NOT NULL DEFAULT 10 CHECK(max_people BETWEEN 1 AND 100),
 message TEXT NOT NULL DEFAULT '', dietary TEXT NOT NULL DEFAULT '', token TEXT NOT NULL UNIQUE,
 qr_token TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(id,event_id)
);
CREATE TABLE guest_members (
 id TEXT PRIMARY KEY, guest_id TEXT NOT NULL, event_id TEXT NOT NULL,
 name TEXT NOT NULL, person_type TEXT NOT NULL CHECK(person_type IN ('adult','child')),
 attendance_status TEXT NOT NULL CHECK(attendance_status IN ('pending','yes','no')), qr_token TEXT UNIQUE,
 FOREIGN KEY(guest_id,event_id) REFERENCES guests(id,event_id) ON DELETE CASCADE
);
CREATE TABLE checkins (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), guest_id TEXT NOT NULL,
 member_id TEXT, subject_key TEXT NOT NULL UNIQUE, token_used TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 FOREIGN KEY(guest_id,event_id) REFERENCES guests(id,event_id)
);
-- Defense in depth: every status change revokes the capability, including direct SQL/admin edits.
CREATE TRIGGER revoke_guest_qr AFTER UPDATE OF response_status ON guests WHEN NEW.response_status <> 'yes' BEGIN
 UPDATE guests SET qr_token = NULL WHERE id = NEW.id;
 UPDATE guest_members SET qr_token = NULL, attendance_status = NEW.response_status WHERE guest_id = NEW.id;
END;
CREATE TRIGGER revoke_member_qr AFTER UPDATE OF attendance_status ON guest_members WHEN NEW.attendance_status <> 'yes' BEGIN
 UPDATE guest_members SET qr_token = NULL WHERE id = NEW.id;
END;
CREATE TRIGGER revoke_event_qr AFTER UPDATE OF checkin_mode,status ON events
WHEN NEW.checkin_mode <> OLD.checkin_mode OR NEW.status <> 'active' BEGIN
 UPDATE guests SET qr_token = NULL WHERE event_id = NEW.id;
 UPDATE guest_members SET qr_token = NULL WHERE event_id = NEW.id;
END;
CREATE TABLE event_media (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), studio_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(event_id,studio_id) REFERENCES events(id,studio_id)
);
CREATE TABLE audit_logs (
 id TEXT PRIMARY KEY, studio_id TEXT REFERENCES studios(id), actor_id TEXT REFERENCES users(id),
 action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX events_tenant ON events(studio_id,created_at);
CREATE INDEX guests_event ON guests(event_id,response_status);
CREATE INDEX members_guest ON guest_members(guest_id);
CREATE INDEX orders_tenant ON billing_orders(studio_id,created_at);
CREATE UNIQUE INDEX one_pending_checkout ON billing_orders(studio_id,generation,kind,quantity) WHERE status='pending';
CREATE INDEX audit_tenant ON audit_logs(studio_id,created_at);
