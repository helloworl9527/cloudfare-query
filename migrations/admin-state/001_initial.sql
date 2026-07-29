CREATE TABLE admin_sessions (
    token_hash       BLOB PRIMARY KEY CHECK (length(token_hash) = 32),
    csrf_hash        BLOB NOT NULL CHECK (length(csrf_hash) = 32),
    created_at       TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    last_activity_at TEXT NOT NULL
);

CREATE INDEX admin_sessions_expires_at_idx ON admin_sessions(expires_at);

CREATE TABLE login_failures (
    id         INTEGER PRIMARY KEY,
    ip_hash    BLOB NOT NULL CHECK (length(ip_hash) = 32),
    occurred_at TEXT NOT NULL
);

CREATE INDEX login_failures_ip_time_idx
    ON login_failures(ip_hash, occurred_at);
