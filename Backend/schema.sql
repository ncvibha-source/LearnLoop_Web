-- LearnLoop application tables. Existing Supabase tables are intentionally left untouched.
-- Run this script in Supabase SQL Editor before deploying the matching Flask branch.

CREATE TABLE IF NOT EXISTS ll_users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS ll_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES ll_users(id) ON DELETE CASCADE,
    teach_skills TEXT DEFAULT '',
    learn_skills TEXT DEFAULT '',
    bio TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ll_skills (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    level TEXT DEFAULT 'Beginner',
    owner_id BIGINT REFERENCES ll_users(id) ON DELETE SET NULL,
    kind TEXT DEFAULT 'catalog'
);

CREATE TABLE IF NOT EXISTS ll_learning_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES ll_users(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    goal TEXT DEFAULT '',
    status TEXT DEFAULT 'planned',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS ll_notes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES ll_users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS ll_reflections (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES ll_users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS ll_peer_exchanges (
    id BIGSERIAL PRIMARY KEY,
    requester_id BIGINT NOT NULL REFERENCES ll_users(id),
    peer_id BIGINT NOT NULL REFERENCES ll_users(id),
    requester_teaches TEXT NOT NULL,
    requester_learns TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS ll_exchange_videos (
    id BIGSERIAL PRIMARY KEY,
    exchange_id BIGINT NOT NULL REFERENCES ll_peer_exchanges(id) ON DELETE CASCADE,
    uploader_id BIGINT NOT NULL REFERENCES ll_users(id),
    skill TEXT NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text,
    UNIQUE(exchange_id, uploader_id)
);

CREATE TABLE IF NOT EXISTS ll_video_highlights (
    id BIGSERIAL PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES ll_exchange_videos(id) ON DELETE CASCADE,
    timestamp_seconds INTEGER NOT NULL CHECK (timestamp_seconds >= 0),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS ll_lesson_completions (
    user_id BIGINT NOT NULL REFERENCES ll_users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP::text,
    PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS ll_exchange_completions (
    exchange_id BIGINT NOT NULL REFERENCES ll_peer_exchanges(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES ll_users(id) ON DELETE CASCADE,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP::text,
    PRIMARY KEY (exchange_id, user_id)
);

CREATE TABLE IF NOT EXISTS ll_certificates (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES ll_users(id) ON DELETE CASCADE,
    certificate_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    title TEXT NOT NULL,
    issued_at TEXT DEFAULT CURRENT_TIMESTAMP::text,
    UNIQUE (user_id, certificate_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_ll_profiles_user_id ON ll_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_ll_skills_owner_id ON ll_skills(owner_id);
CREATE INDEX IF NOT EXISTS idx_ll_sessions_user_id ON ll_learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ll_notes_user_id ON ll_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_ll_reflections_user_id ON ll_reflections(user_id);
CREATE INDEX IF NOT EXISTS idx_ll_exchanges_requester ON ll_peer_exchanges(requester_id);
CREATE INDEX IF NOT EXISTS idx_ll_exchanges_peer ON ll_peer_exchanges(peer_id);
CREATE INDEX IF NOT EXISTS idx_ll_videos_exchange ON ll_exchange_videos(exchange_id);
CREATE INDEX IF NOT EXISTS idx_ll_video_highlights_video_time ON ll_video_highlights(video_id, timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_ll_certificates_user ON ll_certificates(user_id);
