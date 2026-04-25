import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Star, Copy, Check, MessageSquare, BookOpen } from 'lucide-react';
import { SITUATIONS, SITUATION_CATEGORIES, searchSituations, filterByCategory, filterByAgent, filterBySubType } from '../data/situations.js';
import { AGENT_CONFIG } from '../prompts.js';
import AgentAvatar from './AgentAvatar.jsx';
import Tooltip from './Tooltip.jsx';
import { useFlipReorder } from '../hooks/useFlipReorder.js';

const SUBTYPE_CONFIG = {
  b2b: { label: 'B2B', rgb: '59,130,246',  tooltip: { fr: 'Business to Business — vente entre entreprises', en: 'Business to Business — selling to companies' } },
  b2c: { label: 'B2C', rgb: '16,185,129',  tooltip: { fr: 'Business to Customer — vente aux particuliers',   en: 'Business to Customer — selling to individuals' } },
};

const AGENT_KEYS = ['HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS'];

// Virtual category id used when "⭐ Favoris" tab is active (not in data).
const FAV_CATEGORY = '__favorites__';

export default function SituationsScreen({
  darkMode,
  lang = 'fr',
  favorites = [],           // array of situation ids
  onToggleFavorite,         // (situationId) => void
  onUseInChat,              // ({ situation, variant }) => void — starts session + pre-fills
  agentNames = {},
  agentPhotos = {},
}) {
  const [query, setQuery]           = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [agentKey, setAgentKey]     = useState(null);
  const [subType, setSubType]       = useState(null); // 'b2b' | 'b2c' | null — only used when categoryId === 'objection'
  const [selected, setSelected]     = useState(null); // full situation object
  const [liftingId, setLiftingId]   = useState(null); // id of the card currently doing the 150ms "lift" pre-FLIP

  const isFavoritesView = categoryId === FAV_CATEGORY;
  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  // Reset subType when leaving the objection category
  useEffect(() => {
    if (categoryId !== 'objection' && subType !== null) setSubType(null);
  }, [categoryId, subType]);

  // Base filtered list — applies search/agent/subType but NOT category if it's the favorites virtual tab.
  const filtered = useMemo(() => {
    let list = SITUATIONS;
    list = searchSituations(list, query, lang);
    if (!isFavoritesView) list = filterByCategory(list, categoryId);
    list = filterByAgent(list, agentKey);
    if (categoryId === 'objection') list = filterBySubType(list, subType);
    if (isFavoritesView) list = list.filter((s) => favoritesSet.has(s.id));
    return list;
  }, [query, categoryId, agentKey, subType, lang, isFavoritesView, favoritesSet]);

  // Split into favorites vs others (for the "favoris-on-top" sections in regular views).
  const { favItems, otherItems } = useMemo(() => {
    if (isFavoritesView) return { favItems: [], otherItems: [] };
    const fav = [], other = [];
    for (const s of filtered) (favoritesSet.has(s.id) ? fav : other).push(s);
    return { favItems: fav, otherItems: other };
  }, [filtered, favoritesSet, isFavoritesView]);

  // For the global ⭐ Favoris view: group by their actual category (preserving SITUATION_CATEGORIES order)
  const favoritesGrouped = useMemo(() => {
    if (!isFavoritesView) return [];
    const byCat = new Map();
    for (const s of filtered) {
      if (!byCat.has(s.category)) byCat.set(s.category, []);
      byCat.get(s.category).push(s);
    }
    // Order: follow SITUATION_CATEGORIES order
    return SITUATION_CATEGORIES
      .map((cat) => ({ category: cat, items: byCat.get(cat.id) || [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered, isFavoritesView]);

  // FLIP keys — every card across all sections must be tracked by stable id.
  // Recomputing this on filter/favorite changes triggers the layout animation.
  const flipDeps = useMemo(
    () => [filtered.map((s) => s.id).join('|'), favItems.map((s) => s.id).join('|'), isFavoritesView],
    [filtered, favItems, isFavoritesView]
  );
  const { register: registerFlip } = useFlipReorder(flipDeps);

  // Handle star click — first lift (150ms scale+shadow), then commit toggle.
  // The toggle triggers the FLIP animation since the item moves between sections.
  function handleToggleFavorite(situationId) {
    setLiftingId(situationId);
    setTimeout(() => {
      setLiftingId(null);
      onToggleFavorite?.(situationId);
    }, 150);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-screen-in"
      style={{ background: darkMode ? undefined : '#F5F4F0' }}>
      <div className="flex-1 overflow-y-auto scroll-fade px-4 md:px-6 lg:px-8 py-6 md:py-8 pb-24">
        {/* Header */}
        <div className="max-w-6xl mx-auto mb-6">
          <div className="flex items-center gap-3 mb-1">
            <BookOpen size={22} className={darkMode ? 'text-indigo-400' : 'text-indigo-600'} strokeWidth={2} />
            <h1 className={`font-display font-bold text-[28px] md:text-[34px] tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {lang === 'fr' ? 'Bibliothèque de situations' : 'Situation library'}
            </h1>
          </div>
          <p className={`text-[14px] ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            {lang === 'fr'
              ? `${SITUATIONS.length} scénarios pré-construits — frameworks pour les moments critiques.`
              : `${SITUATIONS.length} pre-built scenarios — frameworks for critical moments.`}
          </p>
        </div>

        {/* Search bar */}
        <div className="max-w-6xl mx-auto mb-4">
          <div className={`relative flex items-center rounded-xl border ${darkMode ? 'bg-gray-900 border-white/10' : 'bg-white border-slate-200'}`}>
            <Search size={16} className={`ml-3.5 ${darkMode ? 'text-gray-500' : 'text-slate-400'}`} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === 'fr' ? 'Recherche (prix, objection, ghost, cold, pitch…)' : 'Search (price, objection, ghost, cold, pitch…)'}
              className={`flex-1 bg-transparent px-3 py-3 text-[14px] outline-none ${darkMode ? 'text-white placeholder:text-gray-500' : 'text-slate-900 placeholder:text-slate-400'}`}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className={`mr-3 p-1 rounded-md tap-target ${darkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
                aria-label={lang === 'fr' ? 'Effacer' : 'Clear'}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div className="max-w-6xl mx-auto mb-6 space-y-2.5">
          {/* Category chips — ⭐ Favoris is the first virtual category */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={isFavoritesView}
              onClick={() => setCategoryId(FAV_CATEGORY)}
              darkMode={darkMode}
              accentRgb="245,158,11"
            >
              <span className="inline-flex items-center gap-1">
                <Star size={11} fill={isFavoritesView ? '#f59e0b' : 'transparent'} color={isFavoritesView ? '#f59e0b' : 'currentColor'} strokeWidth={2.25} />
                <span>{lang === 'fr' ? 'Favoris' : 'Favorites'}</span>
                {favorites.length > 0 && (
                  <span
                    className="ml-0.5 px-1 rounded text-[9px] font-bold"
                    style={{
                      background: isFavoritesView ? 'rgba(245,158,11,0.20)' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'),
                      color: isFavoritesView ? 'rgba(245,158,11,1)' : 'inherit',
                    }}
                  >
                    {favorites.length}
                  </span>
                )}
              </span>
            </FilterChip>
            <FilterChip active={!categoryId} onClick={() => setCategoryId(null)} darkMode={darkMode}>
              {lang === 'fr' ? 'Toutes catégories' : 'All categories'}
            </FilterChip>
            {SITUATION_CATEGORIES.map((c) => (
              <FilterChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} darkMode={darkMode}>
                {c.label[lang] || c.label.fr}
              </FilterChip>
            ))}
          </div>
          {/* Agent chips */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={!agentKey} onClick={() => setAgentKey(null)} darkMode={darkMode}>
              {lang === 'fr' ? 'Tous les agents' : 'All agents'}
            </FilterChip>
            {AGENT_KEYS.map((k) => (
              <FilterChip
                key={k}
                active={agentKey === k}
                onClick={() => setAgentKey(k)}
                darkMode={darkMode}
                accentRgb={AGENT_CONFIG[k].glowRgb}
              >
                <span className="inline-flex items-center gap-1.5">
                  <AgentAvatar agentKey={k} size={14} photoUrl={agentPhotos[k]} />
                  <span>{agentNames[k] || AGENT_CONFIG[k].commercialName}</span>
                </span>
              </FilterChip>
            ))}
          </div>
          {/* B2B / B2C subtoggle — visible only when objection category is selected */}
          {categoryId === 'objection' && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className={`text-[10px] uppercase tracking-wider font-semibold mr-1 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                {lang === 'fr' ? 'Type :' : 'Type:'}
              </span>
              <FilterChip active={!subType} onClick={() => setSubType(null)} darkMode={darkMode}>
                {lang === 'fr' ? 'Tous' : 'All'}
              </FilterChip>
              <FilterChip
                active={subType === 'b2b'}
                onClick={() => setSubType('b2b')}
                darkMode={darkMode}
                accentRgb={SUBTYPE_CONFIG.b2b.rgb}
              >
                B2B
              </FilterChip>
              <FilterChip
                active={subType === 'b2c'}
                onClick={() => setSubType('b2c')}
                darkMode={darkMode}
                accentRgb={SUBTYPE_CONFIG.b2c.rgb}
              >
                B2C
              </FilterChip>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="max-w-6xl mx-auto">
          {/* ── Global ⭐ Favoris view : grouped by their actual category ── */}
          {isFavoritesView ? (
            favoritesGrouped.length === 0 ? (
              <div className={`text-center py-16 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                <Star size={32} strokeWidth={1.5} className="mx-auto mb-2 opacity-50" />
                <div className="text-[14px]">
                  {lang === 'fr'
                    ? 'Aucun favori — étoile une situation pour la retrouver ici.'
                    : 'No favorite yet — star a situation to find it here.'}
                </div>
              </div>
            ) : (
              <>
                {favoritesGrouped.map((g) => (
                  <div key={g.category.id} className="mb-7">
                    <SectionLabel darkMode={darkMode}>
                      {g.category.label[lang] || g.category.label.fr}
                      <span className={`ml-2 font-normal ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                        · {g.items.length}
                      </span>
                    </SectionLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {g.items.map((s) => (
                        <SituationCard
                          key={s.id}
                          situation={s}
                          darkMode={darkMode}
                          lang={lang}
                          isFavorite={true}
                          isLifting={liftingId === s.id}
                          onClick={() => setSelected(s)}
                          onToggleFavorite={handleToggleFavorite}
                          agentNames={agentNames}
                          agentPhotos={agentPhotos}
                          flipRef={registerFlip(s.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )
          ) : (
            // ── Regular view : favoris en haut + dividers + reste ──
            filtered.length === 0 ? (
              <div className={`text-center py-16 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                <div className="text-[32px] mb-2">🔍</div>
                <div className="text-[14px]">
                  {lang === 'fr' ? 'Aucune situation trouvée' : 'No situation found'}
                </div>
              </div>
            ) : (
              <>
                {/* Favoris in this filtered view */}
                {favItems.length > 0 && (
                  <div className="mb-6">
                    <SectionLabel darkMode={darkMode} amber>
                      <Star size={11} fill="currentColor" strokeWidth={2.25} />
                      {lang === 'fr' ? 'Favoris' : 'Favorites'}
                      <span className={`ml-2 font-normal ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                        · {favItems.length}
                      </span>
                    </SectionLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {favItems.map((s) => (
                        <SituationCard
                          key={s.id}
                          situation={s}
                          darkMode={darkMode}
                          lang={lang}
                          isFavorite={true}
                          isLifting={liftingId === s.id}
                          onClick={() => setSelected(s)}
                          onToggleFavorite={handleToggleFavorite}
                          agentNames={agentNames}
                          agentPhotos={agentPhotos}
                          flipRef={registerFlip(s.id)}
                        />
                      ))}
                    </div>
                    {/* Subtle divider before non-favorites */}
                    {otherItems.length > 0 && (
                      <div className={`mt-6 mb-4 h-px ${darkMode ? 'bg-white/[0.06]' : 'bg-slate-200'}`} />
                    )}
                  </div>
                )}

                {/* Other (non-favorited) items */}
                {otherItems.length > 0 && (
                  <>
                    <div className={`text-[11px] uppercase tracking-wider mb-2 font-semibold ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                      {lang === 'fr' ? `${otherItems.length} situation${otherItems.length > 1 ? 's' : ''}` : `${otherItems.length} situation${otherItems.length > 1 ? 's' : ''}`}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {otherItems.map((s) => (
                        <SituationCard
                          key={s.id}
                          situation={s}
                          darkMode={darkMode}
                          lang={lang}
                          isFavorite={false}
                          isLifting={liftingId === s.id}
                          onClick={() => setSelected(s)}
                          onToggleFavorite={handleToggleFavorite}
                          agentNames={agentNames}
                          agentPhotos={agentPhotos}
                          flipRef={registerFlip(s.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <SituationDetailModal
          situation={selected}
          darkMode={darkMode}
          lang={lang}
          isFavorite={favorites.includes(selected.id)}
          onClose={() => setSelected(null)}
          onToggleFavorite={() => onToggleFavorite?.(selected.id)}
          onUseInChat={(variant) => {
            onUseInChat?.({ situation: selected, variant });
            setSelected(null);
          }}
          agentNames={agentNames}
          agentPhotos={agentPhotos}
        />
      )}
    </div>
  );
}

// ── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children, darkMode, amber = false }) {
  return (
    <div
      className={`flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-wider ${
        amber
          ? (darkMode ? 'text-amber-400' : 'text-amber-600')
          : (darkMode ? 'text-gray-400' : 'text-slate-500')
      }`}
    >
      {children}
    </div>
  );
}

// ── Filter chip ──────────────────────────────────────────────────────────────
function FilterChip({ children, active, onClick, darkMode, accentRgb }) {
  const rgb = accentRgb || '99,102,241';
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold tracking-tight transition-all tap-target`}
      style={{
        background: active
          ? `rgba(${rgb}, 0.18)`
          : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
        color: active
          ? `rgba(${rgb}, 1)`
          : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
        boxShadow: active ? `0 0 0 1px rgba(${rgb}, 0.32)` : 'none',
      }}
    >
      {children}
    </button>
  );
}

// ── B2B / B2C subtype badge with tooltip ─────────────────────────────────────
function SubTypeBadge({ subType, lang = 'fr' }) {
  const cfg = SUBTYPE_CONFIG[subType];
  if (!cfg) return null;
  // Stop card click when interacting with the badge tooltip area
  return (
    <Tooltip content={cfg.tooltip[lang] || cfg.tooltip.fr}>
      <span
        onClick={(e) => e.stopPropagation()}
        className="text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wider cursor-help"
        style={{
          background: `rgba(${cfg.rgb}, 0.14)`,
          color:      `rgba(${cfg.rgb}, 1)`,
          boxShadow:  `0 0 0 1px rgba(${cfg.rgb}, 0.32)`,
        }}
      >
        {cfg.label}
      </span>
    </Tooltip>
  );
}

// ── Situation card ───────────────────────────────────────────────────────────
function SituationCard({ situation, darkMode, lang, isFavorite, isLifting = false, onClick, onToggleFavorite, agentPhotos, agentNames, flipRef }) {
  const agentCfg = AGENT_CONFIG[situation.agent];
  const rgb = agentCfg?.glowRgb || '99,102,241';
  const categoryLabel = SITUATION_CATEGORIES.find((c) => c.id === situation.category)?.label[lang] || situation.category;

  // Lift effect during the 150ms pre-FLIP window — slight scale + amber-tinted shadow.
  const liftStyle = isLifting
    ? {
        transform: 'scale(1.02)',
        boxShadow: '0 18px 40px -12px rgba(245,158,11,0.45), 0 0 0 1px rgba(245,158,11,0.55)',
        transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
        zIndex: 5,
      }
    : {};

  return (
    <button
      ref={flipRef}
      onClick={onClick}
      className={`relative text-left rounded-xl p-4 border transition-all animate-card-in group`}
      style={{
        background: darkMode ? 'rgba(17,24,39,0.6)' : '#ffffff',
        borderColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
        boxShadow: `0 0 0 0 rgba(${rgb}, 0)`,
        ...liftStyle,
      }}
      onMouseEnter={(e) => { if (!isLifting) e.currentTarget.style.boxShadow = `0 0 0 1px rgba(${rgb}, 0.28), 0 10px 30px -15px rgba(${rgb}, 0.35)`; }}
      onMouseLeave={(e) => { if (!isLifting) e.currentTarget.style.boxShadow = `0 0 0 0 rgba(${rgb}, 0)`; }}
    >
      {/* Favorite star — top right */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(situation.id); }}
        className="absolute top-3 right-3 p-1 rounded-md tap-target"
        aria-label={isFavorite ? (lang === 'fr' ? 'Retirer des favoris' : 'Remove from favorites') : (lang === 'fr' ? 'Ajouter aux favoris' : 'Add to favorites')}
      >
        <Star
          size={15}
          strokeWidth={2}
          fill={isFavorite ? '#f59e0b' : 'transparent'}
          color={isFavorite ? '#f59e0b' : (darkMode ? 'rgba(156,163,175,0.6)' : 'rgba(100,116,139,0.6)')}
        />
      </button>

      {/* Agent avatar + category badge + B2B/B2C badge if applicable */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <AgentAvatar agentKey={situation.agent} size={22} photoUrl={agentPhotos[situation.agent]} />
        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
          style={{ background: `rgba(${rgb}, 0.12)`, color: `rgba(${rgb}, 0.95)` }}>
          {categoryLabel}
        </span>
        {situation.subType && SUBTYPE_CONFIG[situation.subType] && (
          <SubTypeBadge subType={situation.subType} lang={lang} />
        )}
      </div>

      {/* Title */}
      <div className={`font-display font-semibold text-[15px] leading-snug mb-1.5 pr-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
        {situation.title[lang] || situation.title.fr}
      </div>

      {/* Context */}
      <div className={`text-[12.5px] leading-relaxed mb-3 ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
        {situation.context[lang] || situation.context.fr}
      </div>

      {/* Keywords strip */}
      {situation.keywords && situation.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {situation.keywords.slice(0, 3).map((k) => (
            <span
              key={k}
              className={`text-[10px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-white/5 text-gray-400' : 'bg-slate-100 text-slate-600'}`}
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Detail modal ─────────────────────────────────────────────────────────────
function SituationDetailModal({ situation, darkMode, lang, isFavorite, onClose, onToggleFavorite, onUseInChat, agentPhotos, agentNames }) {
  const agentCfg = AGENT_CONFIG[situation.agent];
  const rgb = agentCfg?.glowRgb || '99,102,241';
  const agentDisplayName = agentNames[situation.agent] || agentCfg?.commercialName || situation.agent;
  const categoryLabel = SITUATION_CATEGORIES.find((c) => c.id === situation.category)?.label[lang] || situation.category;

  // variant tab: -1 = base, 0..n = variant[i]
  const [variantIdx, setVariantIdx] = useState(-1);
  const [copied, setCopied] = useState(false);

  const currentScript = variantIdx === -1
    ? situation.script[lang] || situation.script.fr
    : situation.variants[variantIdx]?.script[lang] || situation.variants[variantIdx]?.script.fr;

  const currentLabel = variantIdx === -1
    ? (lang === 'fr' ? 'Base' : 'Base')
    : situation.variants[variantIdx]?.label[lang] || situation.variants[variantIdx]?.label.fr;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(currentScript || '').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Portal the modal into document.body so ancestor `transform` (from
  // animate-screen-in / animate-panel-in) doesn't break `position: fixed`.
  return createPortal((
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-modal-backdrop"
      style={{ background: 'rgba(3,7,18,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col animate-modal-in"
        style={{
          background: darkMode ? 'rgba(20,20,30,0.96)' : '#ffffff',
          border: darkMode ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(15,23,42,0.08)',
          boxShadow: `0 24px 80px -20px rgba(${rgb}, 0.45), 0 0 0 1px rgba(${rgb}, 0.18)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
          <AgentAvatar agentKey={situation.agent} size={40} photoUrl={agentPhotos[situation.agent]} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
                style={{ background: `rgba(${rgb}, 0.12)`, color: `rgba(${rgb}, 0.95)` }}>
                {categoryLabel}
              </span>
              {situation.subType && SUBTYPE_CONFIG[situation.subType] && (
                <SubTypeBadge subType={situation.subType} lang={lang} />
              )}
              <span className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                · {agentDisplayName}
              </span>
            </div>
            <h2 className={`font-display font-bold text-[20px] leading-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {situation.title[lang] || situation.title.fr}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleFavorite}
              className="p-2 rounded-lg tap-target"
              aria-label={isFavorite ? (lang === 'fr' ? 'Retirer des favoris' : 'Unfavorite') : (lang === 'fr' ? 'Favori' : 'Favorite')}
            >
              <Star
                size={18}
                strokeWidth={2}
                fill={isFavorite ? '#f59e0b' : 'transparent'}
                color={isFavorite ? '#f59e0b' : (darkMode ? 'rgba(156,163,175,0.8)' : 'rgba(100,116,139,0.8)')}
              />
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg tap-target ${darkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
              aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 scroll-fade">
          {/* Context box */}
          <div className="mb-4 p-3 rounded-lg text-[13px] leading-relaxed"
            style={{
              background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.035)',
              color: darkMode ? 'rgba(203,213,225,0.90)' : 'rgba(51,65,85,0.90)',
            }}>
            <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
              {lang === 'fr' ? 'Contexte' : 'Context'}
            </div>
            {situation.context[lang] || situation.context.fr}
          </div>

          {/* Variant tabs — only if variants exist */}
          {situation.variants && situation.variants.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setVariantIdx(-1)}
                className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold tap-target`}
                style={{
                  background: variantIdx === -1 ? `rgba(${rgb}, 0.20)` : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
                  color: variantIdx === -1 ? `rgba(${rgb}, 1)` : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
                  boxShadow: variantIdx === -1 ? `0 0 0 1px rgba(${rgb}, 0.36)` : 'none',
                }}
              >
                {lang === 'fr' ? 'Framework de base' : 'Base framework'}
              </button>
              {situation.variants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => setVariantIdx(i)}
                  className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold tap-target`}
                  style={{
                    background: variantIdx === i ? `rgba(${rgb}, 0.20)` : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
                    color: variantIdx === i ? `rgba(${rgb}, 1)` : (darkMode ? 'rgba(229,231,235,0.85)' : 'rgba(51,65,85,0.85)'),
                    boxShadow: variantIdx === i ? `0 0 0 1px rgba(${rgb}, 0.36)` : 'none',
                  }}
                >
                  {v.label[lang] || v.label.fr}
                </button>
              ))}
            </div>
          )}

          {/* Script block */}
          <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
            {lang === 'fr' ? `Script — ${currentLabel}` : `Script — ${currentLabel}`}
          </div>
          <div
            className={`rounded-lg p-4 text-[13.5px] leading-[1.72] whitespace-pre-wrap agent-prose`}
            style={{
              background: darkMode ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.03)',
              border: darkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(15,23,42,0.05)',
              color: darkMode ? 'rgba(229,231,235,0.95)' : 'rgba(15,23,42,0.95)',
            }}
          >
            {renderScript(currentScript)}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 p-4 border-t shrink-0"
          style={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold tap-target ${darkMode ? 'bg-white/5 text-gray-200 hover:bg-white/10' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? (lang === 'fr' ? 'Copié' : 'Copied') : (lang === 'fr' ? 'Copier' : 'Copy')}
          </button>
          <button
            onClick={() => onUseInChat(variantIdx === -1 ? null : situation.variants[variantIdx])}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold tap-target ml-auto"
            style={{
              background: `rgba(${rgb}, 0.22)`,
              color: `rgba(${rgb}, 1)`,
              boxShadow: `0 0 0 1px rgba(${rgb}, 0.42)`,
            }}
          >
            <MessageSquare size={14} />
            {lang === 'fr' ? `Utiliser avec ${agentDisplayName}` : `Use with ${agentDisplayName}`}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

// Render **bold** markdown in scripts
function renderScript(text) {
  if (!text) return null;
  const parts = [];
  const re = /\*\*([^*\n]+?)\*\*/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={`b${i++}`} style={{ fontWeight: 700 }}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
