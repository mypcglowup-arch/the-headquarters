import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Loader, Layers } from 'lucide-react';
import { generateLinkedInPosts } from '../api.js';

function parsePostsFromText(raw) {
  if (!raw) return [];
  const posts = [];
  const regex = /---POST \d+---\s*([\s\S]*?)(?=---POST \d+---|---END---|$)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const text = match[1].trim();
    if (text.length > 20) posts.push(text);
  }
  // fallback: split by double newline if regex fails
  if (posts.length === 0) {
    const chunks = raw.split(/\n\n+/).filter((c) => c.trim().length > 50);
    return chunks.slice(0, 3);
  }
  return posts.slice(0, 3);
}

export default function ContentGenerator({ sessionMessages, dashboardContext, winsContext, darkMode, lang = 'fr', onClose }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [editedPosts, setEditedPosts] = useState({});
  const [error, setError] = useState(null);

  const title = lang === 'fr' ? 'Générer du contenu LinkedIn' : 'Generate LinkedIn Content';
  const subtitle = lang === 'fr' ? 'Gary Vee génère 3 options basées sur ta session' : 'Gary Vee generates 3 options based on your session';
  const generateLabel = lang === 'fr' ? 'Générer 3 posts' : 'Generate 3 posts';
  const generatingLabel = lang === 'fr' ? 'Gary Vee génère...' : 'Gary Vee generating...';

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setPosts([]);

    // Build session context from last 10 exchanges
    const sessionCtx = sessionMessages
      .filter((m) => m.type === 'user' || m.type === 'agent')
      .slice(-10)
      .map((m) => m.type === 'user' ? `User: ${m.content.slice(0, 200)}` : `${m.agent}: ${m.content.slice(0, 300)}`)
      .join('\n');

    try {
      const raw = await generateLinkedInPosts(sessionCtx, dashboardContext, winsContext, lang);
      const parsed = parsePostsFromText(raw);
      if (parsed.length === 0) throw new Error('No posts generated');
      setPosts(parsed);
    } catch (e) {
      setError(lang === 'fr' ? 'Erreur de génération. Réessaie.' : 'Generation failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function copyPost(idx) {
    const text = editedPosts[idx] ?? posts[idx];
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const POST_LABELS = lang === 'fr'
    ? ['Option A — Direct', 'Option B — Storytelling', 'Option C — Insight']
    : ['Option A — Direct', 'Option B — Story', 'Option C — Insight'];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl animate-modal-slide"
        style={{
          background: darkMode ? 'rgba(8,12,24,0.97)' : 'rgba(255,255,255,0.98)',
          border: '1px solid rgba(249,115,22,0.3)',
          boxShadow: '0 0 60px rgba(249,115,22,0.1), 0 24px 48px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'rgba(249,115,22,0.15)' }}>
          <div>
            <h2 className="font-display font-bold text-base flex items-center gap-2" style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>
              <Layers size={15} style={{ color: 'rgba(249,115,22,0.7)' }} />{title}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full transition-colors"
            style={{ color: 'rgba(148,163,184,0.4)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {posts.length === 0 && !loading && (
            <div className="text-center py-6">
              <Layers size={36} className="mx-auto mb-3 opacity-40" style={{ color: 'rgba(249,115,22,0.8)' }} />
              <p className="text-sm mb-1" style={{ color: darkMode ? '#94a3b8' : '#64748b' }}>
                {lang === 'fr'
                  ? 'The Brand Builder va analyser ta session et créer 3 posts LinkedIn prêts à publier.'
                  : 'The Brand Builder will analyze your session and create 3 LinkedIn posts ready to publish.'}
              </p>
              {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
              <button
                onClick={handleGenerate}
                className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.9), rgba(234,88,12,0.9))', color: 'white' }}
              >
                {generateLabel}
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader size={24} className="animate-spin" style={{ color: 'rgba(249,115,22,0.8)' }} />
              <p className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>{generatingLabel}</p>
            </div>
          )}

          {posts.length > 0 && posts.map((post, i) => (
            <div key={i} className="rounded-xl overflow-hidden"
              style={{
                border: '1px solid rgba(249,115,22,0.2)',
                background: darkMode ? 'rgba(249,115,22,0.04)' : 'rgba(249,115,22,0.03)',
              }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b"
                style={{ borderColor: 'rgba(249,115,22,0.12)' }}>
                <span className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: 'rgba(249,115,22,0.7)' }}>
                  {POST_LABELS[i] || `Option ${String.fromCharCode(65+i)}`}
                </span>
                <button
                  onClick={() => copyPost(i)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: copiedIdx === i ? 'rgba(16,185,129,0.15)' : 'rgba(249,115,22,0.1)',
                    color: copiedIdx === i ? '#10b981' : 'rgba(249,115,22,0.8)',
                    border: `1px solid ${copiedIdx === i ? 'rgba(16,185,129,0.3)' : 'rgba(249,115,22,0.25)'}`,
                  }}
                >
                  {copiedIdx === i ? <><Check size={10} /> {lang === 'fr' ? 'Copié!' : 'Copied!'}</> : <><Copy size={10} /> {lang === 'fr' ? 'Copier' : 'Copy'}</>}
                </button>
              </div>
              <textarea
                value={editedPosts[i] ?? post}
                onChange={(e) => setEditedPosts((prev) => ({ ...prev, [i]: e.target.value }))}
                rows={8}
                className="w-full px-4 py-3 text-sm leading-relaxed resize-none outline-none bg-transparent"
                style={{ color: darkMode ? '#d1d5db' : '#374151' }}
              />
            </div>
          ))}

          {posts.length > 0 && (
            <button
              onClick={handleGenerate}
              className="w-full py-2 rounded-xl text-xs font-medium transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid rgba(249,115,22,0.2)',
                color: 'rgba(249,115,22,0.6)',
              }}
            >
              {lang === 'fr' ? '↻ Régénérer' : '↻ Regenerate'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
