/**
 * Supabase sync layer — all writes are fire-and-forget with silent fallback.
 * localStorage remains the source of truth; Supabase is the cloud backup.
 */
import { supabase, isSupabaseEnabled } from './supabase.js';
import { getUserId } from '../utils/userId.js';

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function syncSession({ id, date, mode, messages, consensusLine, summary }) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('sessions').upsert({
      id,
      session_date: date,
      mode,
      messages,
      consensus: consensusLine || null,
      summary:   summary || null,
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[Sync] syncSession failed:', e.message);
  }
}

// ─── Improvement journal ──────────────────────────────────────────────────────

export async function syncImprovementItem(item) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('improvement_journal').upsert({
      id:         item.id,
      session_id: item.sessionId || null,
      agent:      item.agent || null,
      improvement: item.improvement,
      status:     item.status,
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[Sync] syncImprovementItem failed:', e.message);
  }
}

export async function syncImprovementStatus(id, status) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('improvement_journal').update({ status }).eq('id', id);
  } catch (e) {
    console.warn('[Sync] syncImprovementStatus failed:', e.message);
  }
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export async function syncDecisions(decisions, sessionId) {
  if (!isSupabaseEnabled() || !decisions?.length) return;
  try {
    const rows = decisions.map((d) => ({
      id:          typeof d === 'object' ? (d.id || null) : null,
      session_id:  sessionId || null,
      decision:    typeof d === 'string' ? d : d.decision,
      agent:       typeof d === 'string' ? 'GENERAL' : (d.agent || 'GENERAL'),
      decided_at:  typeof d === 'string' ? new Date().toISOString() : (d.date || new Date().toISOString()),
      outcome:     typeof d === 'object' ? (d.outcome || null) : null,
      outcome_comment: typeof d === 'object' ? (d.outcomeComment || null) : null,
      outcome_recorded_at: typeof d === 'object' && d.outcomeDate
        ? new Date(d.outcomeDate).toISOString()
        : null,
    }));
    // Upsert by id so outcome updates don't duplicate the row
    await supabase.from('decisions').upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
  } catch (e) {
    console.warn('[Sync] syncDecisions failed:', e.message);
  }
}

// Update a single decision's outcome without re-writing the whole record.
export async function syncDecisionOutcome(id, outcome, comment) {
  if (!isSupabaseEnabled() || !id) return;
  try {
    await supabase.from('decisions').update({
      outcome:              outcome || null,
      outcome_comment:      comment || null,
      outcome_recorded_at:  new Date().toISOString(),
    }).eq('id', id);
  } catch (e) {
    console.warn('[Sync] syncDecisionOutcome failed:', e.message);
  }
}

// Fetch decisions still awaiting an outcome (≥ daysOld old). Used at session
// start to build the reminder card. Fire-and-forget — returns [] on error.
export async function fetchDecisionsAwaitingOutcome(daysOld = 30) {
  if (!isSupabaseEnabled()) return [];
  try {
    const cutoff = new Date(Date.now() - daysOld * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('decisions')
      .select('id, decision, agent, decided_at, outcome')
      .is('outcome', null)
      .lte('decided_at', cutoff)
      .order('decided_at', { ascending: true })
      .limit(20);
    if (error) { console.warn('[Sync] fetchDecisionsAwaitingOutcome:', error.message); return []; }
    return Array.isArray(data) ? data : [];
  } catch (e) { console.warn('[Sync] fetchDecisionsAwaitingOutcome failed:', e.message); return []; }
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export async function syncFeedback(sessionId, messageId, agent, value) {
  if (!isSupabaseEnabled()) return;
  try {
    if (value === null) {
      await supabase.from('feedback_log').delete().eq('message_id', messageId);
    } else {
      await supabase.from('feedback_log').upsert({
        session_id: sessionId,
        message_id: messageId,
        agent:      agent || null,
        value,
      }, { onConflict: 'message_id' });
    }
  } catch (e) {
    console.warn('[Sync] syncFeedback failed:', e.message);
  }
}

// ─── Momentum snapshot ────────────────────────────────────────────────────────

export async function syncMomentum(streak, sessionsWeek, totalSessions, interactionCount = null) {
  if (!isSupabaseEnabled()) return;
  try {
    const row = {
      streak,
      sessions_week:  sessionsWeek,
      total_sessions: totalSessions,
    };
    if (interactionCount !== null && interactionCount !== undefined) {
      row.interaction_count = interactionCount;
    }
    await supabase.from('momentum').insert(row);
  } catch (e) {
    console.warn('[Sync] syncMomentum failed:', e.message);
  }
}

// ─── Victories journal ──────────────────────────────────────────────────────
// Cloud-first. fetchVictories at mount → reconcile with localStorage cache.
export async function syncVictory(victory) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('victories').upsert({
      id:            victory.id,
      description:   victory.description,
      value_monthly: Number(victory.value_monthly) || 0,
      category:      victory.category || 'other',
      roi_annual:    Number(victory.roi_annual)  || 0,
      roi_percent:   Number(victory.roi_percent) || 0,
      created_at:    victory.created_at,
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[Sync] syncVictory failed:', e.message);
  }
}

export async function syncVictoryDelete(id) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('victories').delete().eq('id', id);
  } catch (e) {
    console.warn('[Sync] syncVictoryDelete failed:', e.message);
  }
}

export async function fetchVictories() {
  if (!isSupabaseEnabled()) return [];
  try {
    const { data, error } = await supabase
      .from('victories')
      .select('id, description, value_monthly, category, roi_annual, roi_percent, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[Sync] fetchVictories failed:', e.message);
    return [];
  }
}

// ─── Situation library favorites ────────────────────────────────────────────
export async function syncSituationFavorite(situationId, action) {
  if (!isSupabaseEnabled()) return;
  try {
    if (action === 'add') {
      await supabase.from('situation_favorites').upsert({
        situation_id: situationId,
        added_at:     new Date().toISOString(),
      }, { onConflict: 'situation_id' });
    } else if (action === 'remove') {
      await supabase.from('situation_favorites').delete().eq('situation_id', situationId);
    }
  } catch (e) {
    console.warn('[Sync] syncSituationFavorite failed:', e.message);
  }
}

export async function fetchSituationFavorites() {
  if (!isSupabaseEnabled()) return [];
  try {
    const { data, error } = await supabase
      .from('situation_favorites')
      .select('situation_id')
      .order('added_at', { ascending: false });
    if (error) throw error;
    return Array.isArray(data) ? data.map((r) => r.situation_id) : [];
  } catch (e) {
    console.warn('[Sync] fetchSituationFavorites failed:', e.message);
    return [];
  }
}

// ─── User profile (single-row per device, upsert by id=getUserId()) ────────
// The technical partition key is the per-device UUID from utils/userId.js,
// so each tester has an isolated row. Display name comes from `name` column.
// Renaming the user doesn't change the partition ID, so existing rows stay
// linked even after a profile reset.
export async function syncUserProfile(profile) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('user_profile').upsert({
      id:               getUserId(),
      name:             profile?.name || null,
      role:             profile?.role || null,
      annual_goal:      Number(profile?.annualGoal) || null,
      sector:           profile?.sector || null,
      sector_custom:    profile?.sectorCustom || null,
      audience:         profile?.audience || null,
      language:         profile?.language || null,
      // ── v2 personalization fields (require migration 2026_04_30_user_profile_v2.sql)
      stage:            profile?.stage || null,
      experience:       profile?.experience || null,
      strength:         profile?.strength || null,
      challenges:       Array.isArray(profile?.challenges) ? profile.challenges : null,
      past_failures:    profile?.pastFailures || null,
      coaching_style:   Number(profile?.coachingStyle) || null,
      primary_agent:    profile?.primaryAgent || null,
      sensitive_topics: profile?.sensitiveTopics || null,
      availability:     Array.isArray(profile?.availability) ? profile.availability : null,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[Sync] syncUserProfile failed:', e.message);
  }
}

export async function fetchUserProfile() {
  if (!isSupabaseEnabled()) return null;
  try {
    const { data, error } = await supabase
      .from('user_profile')
      .select('id, name, role, annual_goal, sector, sector_custom, audience, language, stage, experience, strength, challenges, past_failures, coaching_style, primary_agent, sensitive_topics, availability, created_at')
      .eq('id', getUserId())
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      name:           data.name || '',
      role:           data.role || '',
      annualGoal:     Number(data.annual_goal) || 50000,
      sector:         data.sector || null,
      sectorCustom:   data.sector_custom || '',
      audience:       data.audience || null,
      language:       data.language || null,
      stage:          data.stage || null,
      experience:     data.experience || null,
      strength:       data.strength || null,
      challenges:     Array.isArray(data.challenges) ? data.challenges : [],
      pastFailures:   data.past_failures || '',
      coachingStyle:  Number(data.coaching_style) || 3,
      primaryAgent:   data.primary_agent || null,
      sensitiveTopics:data.sensitive_topics || '',
      availability:   Array.isArray(data.availability) ? data.availability : [],
      createdAt:      data.created_at || null,
    };
  } catch (e) {
    console.warn('[Sync] fetchUserProfile failed:', e.message);
    return null;
  }
}

// ─── Monday auto-session dedup ──────────────────────────────────────────────
// Insert on first fire for a given Monday ISO date. PK on monday_date blocks
// double-fire across devices (reload same day → existing row → insert skipped).
export async function syncMondaySession(mondayIso, agent) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('monday_sessions').upsert({
      monday_date: mondayIso,
      agent:       agent || null,
      fired_at:    new Date().toISOString(),
    }, { onConflict: 'monday_date' });
  } catch (e) {
    console.warn('[Sync] syncMondaySession failed:', e.message);
  }
}

export async function fetchMondaySessionForDate(mondayIso) {
  if (!isSupabaseEnabled()) return null;
  try {
    const { data, error } = await supabase
      .from('monday_sessions')
      .select('monday_date, agent, fired_at')
      .eq('monday_date', mondayIso)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.warn('[Sync] fetchMondaySessionForDate failed:', e.message);
    return null;
  }
}

// ─── Daily check-in ──────────────────────────────────────────────────────────

export async function syncCheckIn(data) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('daily_checkins').upsert({
      checkin_date: data.date,
      energie_score: data.energieScore,
      emoji: data.emoji,
      priority: data.priority,
      blocker: data.blocker || null,
      created_at: data.timestamp,
    }, { onConflict: 'checkin_date' });
  } catch (e) {
    console.warn('[Sync] syncCheckIn failed:', e.message);
  }
}

// ─── Dashboard state (single-row snapshot, full JSONB) ─────────────────────
// Upsert the entire financial state on every change. Single row per user —
// the row is overwritten; this is the cross-device source of truth for
// finances. Granular tables (retainers, one_time_revenues, expenses) remain
// as append-only ledgers for analytics.
// Resolved at call time (not module load) so each call uses the current
// localStorage value — handles the rare case where the device's userId is
// reset mid-session.
const getDashboardUserId = () => getUserId();

export async function syncDashboardState(dashboard) {
  if (!isSupabaseEnabled() || !dashboard) return;
  try {
    // Only persist the fields we consider "financial state" to keep the row tight
    const state = {
      annualGoal:       dashboard.annualGoal ?? 50000,
      monthlyRevenue:   dashboard.monthlyRevenue ?? [],
      retainers:        dashboard.retainers ?? [],
      oneTimeRevenues:  dashboard.oneTimeRevenues ?? [],
      pipeline:         dashboard.pipeline ?? {},
    };
    await supabase.from('dashboard_state').upsert({
      user_id:    getDashboardUserId(),
      state,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e) {
    console.warn('[Sync] syncDashboardState failed:', e.message);
  }
}

export async function fetchDashboardState() {
  if (!isSupabaseEnabled()) return null;
  try {
    const { data, error } = await supabase
      .from('dashboard_state')
      .select('state, updated_at')
      .eq('user_id', getDashboardUserId())
      .maybeSingle();
    if (error) {
      console.warn('[Sync] fetchDashboardState error:', error.message);
      return null;
    }
    if (!data?.state) return null;
    return { state: data.state, updatedAt: data.updated_at };
  } catch (e) {
    console.warn('[Sync] fetchDashboardState failed:', e.message);
    return null;
  }
}

// ─── Retainers ───────────────────────────────────────────────────────────────
// Table schema provided in CHANGELOG. Fire-and-forget like the rest.
export async function syncRetainer(retainer) {
  if (!isSupabaseEnabled() || !retainer?.id) return;
  try {
    await supabase.from('retainers').upsert({
      id:         retainer.id,
      name:       retainer.name || null,
      amount:     Number(retainer.amount) || 0,
      started_at: retainer.startedAt ? new Date(retainer.startedAt).toISOString() : null,
      workflow:   retainer.workflow || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[Sync] syncRetainer failed:', e.message);
  }
}

export async function syncRetainerDelete(id) {
  if (!isSupabaseEnabled() || !id) return;
  try {
    await supabase.from('retainers').delete().eq('id', id);
  } catch (e) {
    console.warn('[Sync] syncRetainerDelete failed:', e.message);
  }
}

// ─── One-time revenues ───────────────────────────────────────────────────────
export async function syncOneTimeRevenue(entry) {
  if (!isSupabaseEnabled() || !entry?.id) return;
  try {
    await supabase.from('one_time_revenues').insert({
      id:          entry.id,
      client_name: entry.clientName || null,
      amount:      Number(entry.amount) || 0,
      month_idx:   entry.monthIdx,
      year:        entry.year,
      date:        entry.date || new Date().toISOString(),
      session_id:  entry.sessionId || null,
    });
  } catch (e) {
    console.warn('[Sync] syncOneTimeRevenue failed:', e.message);
  }
}

// ─── Weekly fetchers for anomaly detection ──────────────────────────────────
// All fire-and-forget: return [] on failure (Supabase down, table missing,
// RLS, etc.) so the anomaly detector gracefully falls back to localStorage.

export async function fetchWeeklyFollowups(sinceTs) {
  if (!isSupabaseEnabled()) return [];
  try {
    const sinceIso = new Date(sinceTs).toISOString();
    const { data, error } = await supabase
      .from('followup_log')
      .select('id, sent_at, status')
      .gte('sent_at', sinceIso)
      .order('sent_at', { ascending: false })
      .limit(500);
    if (error) { console.warn('[Sync] fetchWeeklyFollowups:', error.message); return []; }
    return Array.isArray(data) ? data : [];
  } catch (e) { console.warn('[Sync] fetchWeeklyFollowups failed:', e.message); return []; }
}

export async function fetchWeeklyOneTimeRevenues(sinceTs) {
  if (!isSupabaseEnabled()) return [];
  try {
    const sinceIso = new Date(sinceTs).toISOString();
    const { data, error } = await supabase
      .from('one_time_revenues')
      .select('id, amount, date, client_name')
      .gte('date', sinceIso)
      .order('date', { ascending: false })
      .limit(200);
    if (error) { console.warn('[Sync] fetchWeeklyOneTimeRevenues:', error.message); return []; }
    return Array.isArray(data) ? data : [];
  } catch (e) { console.warn('[Sync] fetchWeeklyOneTimeRevenues failed:', e.message); return []; }
}

export async function fetchWeeklyRetainerChanges(sinceTs) {
  if (!isSupabaseEnabled()) return [];
  try {
    const sinceIso = new Date(sinceTs).toISOString();
    const { data, error } = await supabase
      .from('retainers')
      .select('id, name, amount, updated_at')
      .gte('updated_at', sinceIso)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) { console.warn('[Sync] fetchWeeklyRetainerChanges:', error.message); return []; }
    return Array.isArray(data) ? data : [];
  } catch (e) { console.warn('[Sync] fetchWeeklyRetainerChanges failed:', e.message); return []; }
}

// ─── Batch follow-up log ────────────────────────────────────────────────────
// Append-only ledger of every follow-up email {name} sends through QG. Useful
// to prevent double-relancing, build response-rate stats, and audit history.
// Table schema provided in CHANGELOG.
export async function syncFollowupLog(entry) {
  if (!isSupabaseEnabled() || !entry?.id) return;
  try {
    await supabase.from('followup_log').insert({
      id:            String(entry.id),
      prospect_id:   entry.prospectId ? String(entry.prospectId) : null,
      prospect_name: entry.prospectName || null,
      subject:       entry.subject || null,
      body:          entry.body || null,
      sent_at:       new Date(entry.sentAt || Date.now()).toISOString(),
      batch_id:      entry.batchId || null,
      status:        entry.status || 'sent',  // 'sent' | 'failed' | 'skipped'
      session_id:    entry.sessionId || null,
    });
  } catch (e) {
    console.warn('[Sync] syncFollowupLog failed:', e.message);
  }
}

// ─── Focus sessions (Pomodoro per client) ───────────────────────────────────
// Append-only ledger. client_name NULL = General/Admin (non-client work).
// Table schema provided in CHANGELOG.
export async function syncFocusSession(entry) {
  if (!isSupabaseEnabled() || !entry?.id) return;
  try {
    await supabase.from('focus_sessions').insert({
      id:               String(entry.id),
      client_name:      entry.clientName || null,
      duration_minutes: Number(entry.duration) || 0,
      category:         entry.category || null,
      intention:        entry.intention || null,
      result:           entry.result || null,
      session_date:     new Date(entry.date || Date.now()).toISOString(),
    });
  } catch (e) {
    console.warn('[Sync] syncFocusSession failed:', e.message);
  }
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
// Append-only ledger. {name} must create the `expenses` table manually — SQL in
// CHANGELOG. Fire-and-forget: if the table doesn't exist, the warn is logged
// and localStorage remains the source of truth.
export async function syncExpense({ monthIdx, year, category, amount, label, isRecurring, sessionId }) {
  if (!isSupabaseEnabled()) return;
  try {
    await supabase.from('expenses').insert({
      month_idx:    monthIdx,
      year,
      category:     category || 'other',
      amount,
      label:        label || null,
      is_recurring: !!isRecurring,
      session_id:   sessionId || null,
    });
  } catch (e) {
    console.warn('[Sync] syncExpense failed:', e.message);
  }
}

// ─── Agent config ─────────────────────────────────────────────────────────────

export async function syncAgentNames(agentNames) {
  if (!isSupabaseEnabled()) return;
  try {
    const rows = Object.entries(agentNames).map(([agent_key, custom_name]) => ({
      agent_key,
      custom_name,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from('agent_config').upsert(rows, { onConflict: 'agent_key' });
  } catch (e) {
    console.warn('[Sync] syncAgentNames failed:', e.message);
  }
}
