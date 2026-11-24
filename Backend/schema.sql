-- LearnLoop complete PostgreSQL schema for Supabase
-- Run this entire script once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    teach_skills TEXT DEFAULT '',
    learn_skills TEXT DEFAULT '',
    bio TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS skills (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    level TEXT DEFAULT 'Beginner',
    owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT DEFAULT 'catalog'
);

CREATE TABLE IF NOT EXISTS learning_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    goal TEXT DEFAULT '',
    status TEXT DEFAULT 'planned',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS notes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS reflections (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS peer_exchanges (
    id BIGSERIAL PRIMARY KEY,
    requester_id BIGINT NOT NULL REFERENCES users(id),
    peer_id BIGINT NOT NULL REFERENCES users(id),
    requester_teaches TEXT NOT NULL,
    requester_learns TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS exchange_videos (
    id BIGSERIAL PRIMARY KEY,
    exchange_id BIGINT NOT NULL REFERENCES peer_exchanges(id) ON DELETE CASCADE,
    uploader_id BIGINT NOT NULL REFERENCES users(id),
    skill TEXT NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS lesson_completions (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP::text,
    PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS exchange_completions (
    exchange_id BIGINT NOT NULL REFERENCES peer_exchanges(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP::text,
    PRIMARY KEY (exchange_id, user_id)
);

CREATE TABLE IF NOT EXISTS certificates (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    certificate_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    title TEXT NOT NULL,
    issued_at TEXT DEFAULT CURRENT_TIMESTAMP::text,
    UNIQUE (user_id, certificate_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_owner_id ON skills(owner_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_reflections_user_id ON reflections(user_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_requester ON peer_exchanges(requester_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_peer ON peer_exchanges(peer_id);
CREATE INDEX IF NOT EXISTS idx_videos_exchange ON exchange_videos(exchange_id);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
