CREATE TABLE bindings (
    id                    INTEGER PRIMARY KEY,
    external_id_type      TEXT NOT NULL DEFAULT 'email'
                              CHECK (external_id_type = 'email'),
    external_id_display   TEXT NOT NULL
                              CHECK (length(external_id_display) BETWEEN 3 AND 254),
    external_id_norm      TEXT NOT NULL
                              CHECK (length(external_id_norm) BETWEEN 3 AND 254),
    address               TEXT NOT NULL COLLATE NOCASE UNIQUE
                              CHECK (length(address) BETWEEN 3 AND 254),
    address_jwt_enc       BLOB NOT NULL,
    credential_status     TEXT NOT NULL DEFAULT 'unknown'
                              CHECK (credential_status IN ('valid', 'invalid', 'unknown')),
    credential_updated_at TEXT NOT NULL,
    last_verified_at      TEXT,
    note                  TEXT NOT NULL DEFAULT ''
                              CHECK (length(note) <= 500),
    version               INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    UNIQUE (external_id_type, external_id_norm)
);

CREATE TABLE admin_audit (
    id         INTEGER PRIMARY KEY,
    action     TEXT NOT NULL,
    binding_id INTEGER,
    result     TEXT NOT NULL,
    request_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX admin_audit_created_at_idx ON admin_audit(created_at);
