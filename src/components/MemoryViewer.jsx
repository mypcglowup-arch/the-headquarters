import { useState, useEffect, useRef } from 'react';
import { Brain, Plus, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { listAllMemories, deleteMemory, addManualMemory } from '../lib/mem0.js';

function formatRelative(iso, lang = 'fr') {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin  = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay  = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1)  return lang === 'fr' ? "à l'instant" : 'just now';
  if (diffMin < 60) return lang === 'fr' ? `il y a ${diffMin} min` : `${diffMin} min ago`;
  if (diffHour < 24) return lang === 'fr' ? `il y a ${diffHour} h` : `${diffHour}h ago`;
  if (diffDay < 30) return lang === 'fr' ? `il y a ${diffDay} j` : `${diffDay}d ago`;
  return d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MemoryViewer({ c, lang = 'fr' }) {
  const [memories, setMemories] = useState(null);      // null while loading, [] when empty
  const [error, setError]       = useState(null);
  const [adding, setAdding]     = useState(false);
  const [newText, setNewText]   = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const confirmTimerRef = useRef(null);

  const reload = async () => {
    setError(null);
    try {
      const list = await listAllMemories();
      // Sort most recent first
      list.sort((a, b) => {
        const ta = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const tb = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return tb - ta;
      });
      setMemories(list);
    } catch (err) {
      console.warn('[MemoryViewer] reload failed:', err.message);
      setError(err.message);
      setMemories([]);
    }
  };

  useEffect(() => {
    reload();
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      const ok = await addManualMemory(text);
      if (ok) {
        setNewText('');
        await reload();
      } else {
        setError(lang === 'fr' ? "Impossible d'ajouter la mémoire." : 'Could not add memory.');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteClick = (id) => {
    if (pendingDeleteId === id) {
      // Second click = confirm
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setPendingDeleteId(null);
      (async () => {
        const ok = await deleteMemory(id);
        if (ok) {
          setMemories((prev) => (prev || []).filter((m) => m.id !== id));
        } else {
          setError(lang === 'fr' ? 'Échec de suppression.' : 'Delete failed.');
        }
      })();
      return;
    }
    // First click = arm confirm + auto-reset after 3s
    setPendingDeleteId(id);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
  };

  const accent = 'rgba(99,102,241,0.9)';
  const accentSoft = 'rgba(99,102,241,0.18)';
  const accentBorder = 'rgba(99,102,241,0.32)';

  return (
    <div style={{ background: c.bg1, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: accentSoft, border: `1px solid ${accentBorder}`,
          }}>
            <Brain size={14} style={{ color: accent }} />
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.text2, margin: 0 }}>
              {lang === 'fr' ? 'Mémoires' : 'Memories'}
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: c.text0, margin: 0, marginTop: 2 }}>
              {memories === null
                ? (lang === 'fr' ? 'Chargement…' : 'Loading…')
                : `${memories.length} ${lang === 'fr' ? 'active' + (memories.length > 1 ? 's' : '') : 'active'}`}
            </p>
          </div>
        </div>
        <button
          onClick={reload}
          aria-label={lang === 'fr' ? 'Rafraîchir' : 'Refresh'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8,
            background: 'transparent', border: `1px solid ${c.border}`,
            color: c.text2, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = c.text0; e.currentTarget.style.borderColor = c.text2; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = c.text2; e.currentTarget.style.borderColor = c.border; }}
        >
          <RefreshCw size={11} />
          {lang === 'fr' ? 'Actualiser' : 'Refresh'}
        </button>
      </div>

      {/* Add input */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={lang === 'fr' ? 'Ajouter une mémoire manuellement…' : 'Add a memory manually…'}
            rows={2}
            style={{
              flex: 1,
              background: c.bg2 || c.bg1,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              color: c.text0,
              fontFamily: 'inherit',
              outline: 'none',
              resize: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.target.style.borderColor = accentBorder; }}
            onBlur={(e) => { e.target.style.borderColor = c.border; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(); }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newText.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 14px', borderRadius: 10,
              background: newText.trim() ? accent : c.border,
              color: 'white',
              fontSize: 12, fontWeight: 700,
              border: 'none', cursor: newText.trim() ? 'pointer' : 'not-allowed',
              opacity: adding ? 0.7 : 1,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={13} />
            {adding
              ? (lang === 'fr' ? 'Ajout…' : 'Adding…')
              : (lang === 'fr' ? 'Ajouter' : 'Add')}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', marginBottom: 12,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10, fontSize: 12, color: 'rgba(239,68,68,0.95)',
        }}>
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}

      {/* List */}
      {memories === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 54, borderRadius: 10 }} />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '28px 16px',
          border: `2px dashed ${c.border}`, borderRadius: 12,
        }}>
          <p style={{ fontSize: 13, color: c.text2, margin: 0 }}>
            {lang === 'fr'
              ? 'Aucune mémoire pour le moment. Elles sont générées automatiquement à la fin de chaque session.'
              : 'No memories yet. They build up automatically at the end of each session.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {memories.map((m) => {
            const isPendingDelete = pendingDeleteId === m.id;
            const isManual = m.metadata?.type === 'manual';
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  background: isPendingDelete ? 'rgba(239,68,68,0.08)' : (c.bg2 || 'transparent'),
                  border: `1px solid ${isPendingDelete ? 'rgba(239,68,68,0.3)' : c.border}`,
                  borderRadius: 10,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, lineHeight: 1.5, color: c.text0,
                    margin: 0, wordBreak: 'break-word',
                  }}>
                    {m.memory}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: c.text2 }}>
                      {formatRelative(m.createdAt, lang)}
                    </span>
                    {isManual && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        padding: '1px 6px', borderRadius: 4,
                        background: accentSoft, color: accent, border: `1px solid ${accentBorder}`,
                      }}>
                        {lang === 'fr' ? 'Manuel' : 'Manual'}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteClick(m.id)}
                  aria-label={lang === 'fr' ? 'Supprimer' : 'Delete'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    flexShrink: 0,
                    padding: isPendingDelete ? '5px 10px' : 6,
                    borderRadius: 8,
                    background: isPendingDelete ? 'rgba(239,68,68,0.15)' : 'transparent',
                    border: `1px solid ${isPendingDelete ? 'rgba(239,68,68,0.35)' : 'transparent'}`,
                    color: isPendingDelete ? 'rgba(239,68,68,0.95)' : c.text2,
                    fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isPendingDelete) e.currentTarget.style.color = 'rgba(239,68,68,0.9)'; }}
                  onMouseLeave={(e) => { if (!isPendingDelete) e.currentTarget.style.color = c.text2; }}
                >
                  <Trash2 size={12} />
                  {isPendingDelete && (lang === 'fr' ? 'Confirmer' : 'Confirm')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
