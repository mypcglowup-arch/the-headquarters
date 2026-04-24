-- ============================================================
-- THE HEADQUARTERS — Supabase Schema
-- Run this in your Supabase SQL Editor (Project > SQL Editor)
-- ============================================================

-- Sessions: full conversation history
create table if not exists sessions (
  id           bigint primary key,            -- Date.now() from client
  created_at   timestamptz default now(),
  session_date timestamptz not null,
  mode         text not null default 'strategic',
  messages     jsonb not null default '[]',   -- array of {id, type, agent, content, timestamp}
  consensus    text,                          -- "Today your HQ is aligned on: ..."
  summary      jsonb                          -- {keyDecisions, consensusAction, improvements}
);

-- Improvement journal: action items from sessions
create table if not exists improvement_journal (
  id          text primary key,               -- client-generated id
  created_at  timestamptz default now(),
  session_id  bigint references sessions(id) on delete set null,
  agent       text,
  improvement text not null,
  status      text not null default 'todo'    -- 'todo' | 'done'
);

-- Decisions: key decisions logged per session
create table if not exists decisions (
  id          bigserial primary key,
  created_at  timestamptz default now(),
  session_id  bigint references sessions(id) on delete set null,
  decision    text not null,
  agent       text not null default 'GENERAL',
  decided_at  timestamptz
);

-- Feedback: thumbs up/down per message
create table if not exists feedback_log (
  id         bigserial primary key,
  created_at timestamptz default now(),
  session_id bigint references sessions(id) on delete cascade,
  message_id text not null,
  agent      text,
  value      text not null check (value in ('up', 'down'))
);

-- Momentum: daily streak + session count snapshots
create table if not exists momentum (
  id            bigserial primary key,
  recorded_at   timestamptz default now(),
  streak        int not null default 0,
  sessions_week int not null default 0,
  total_sessions int not null default 0
);

-- Agent config: custom names (photos stored locally — too large for DB)
create table if not exists agent_config (
  id          bigserial primary key,
  updated_at  timestamptz default now(),
  agent_key   text not null unique,           -- 'HORMOZI', 'CARDONE', etc.
  custom_name text
);

-- Time capsules: future messages to Samuel (optional feature)
create table if not exists time_capsules (
  id          bigserial primary key,
  created_at  timestamptz default now(),
  deliver_at  timestamptz not null,
  message     text not null,
  from_agent  text,
  delivered   boolean default false
);

-- Predictions: agent predictions to track over time
create table if not exists predictions (
  id          bigserial primary key,
  created_at  timestamptz default now(),
  session_id  bigint references sessions(id) on delete set null,
  agent       text not null,
  prediction  text not null,
  timeframe   text,                           -- e.g. '30 days', '90 days'
  outcome     text,                           -- filled in later
  resolved_at timestamptz
);

-- ── Indexes for common queries ────────────────────────────────
create index if not exists idx_sessions_date       on sessions(session_date desc);
create index if not exists idx_journal_session     on improvement_journal(session_id);
create index if not exists idx_journal_status      on improvement_journal(status);
create index if not exists idx_decisions_session   on decisions(session_id);
create index if not exists idx_feedback_session    on feedback_log(session_id);
create index if not exists idx_momentum_date       on momentum(recorded_at desc);
create index if not exists idx_capsules_deliver    on time_capsules(deliver_at) where not delivered;
create index if not exists idx_predictions_agent   on predictions(agent);
