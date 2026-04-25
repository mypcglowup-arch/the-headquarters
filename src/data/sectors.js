/**
 * Sector data — drives the sector personalization across QG.
 *
 * Each sector defines:
 *   - id, label                     : identification + UI display
 *   - vocabulary[lang]              : 5-8 sector-specific terms (used in agent
 *                                     advice + library hints)
 *   - pipelineStages[lang]          : 4 stages adapted to sector workflow
 *                                     (overrides the default Contacted/Replied/Demo/Signed)
 *   - revenueModel[lang]            : how revenue is typically captured
 *   - typicalUnit[lang]             : the smallest sale unit (couvert, m², soumission, ...)
 *   - seasonality[lang]             : 1-line note on yearly seasonality
 *   - painPoints[lang]              : top 2-3 sector-typical pain points
 *   - defaultAudience               : 'b2b' | 'b2c' | 'both' (used as default
 *                                     hint in onboarding, user can override)
 */

export const SECTORS = [
  {
    id: 'agency-freelance',
    label: { fr: 'Agence / Freelance', en: 'Agency / Freelance' },
    vocabulary: {
      fr: ['retainer', 'mandat', 'devis', 'honoraires', 'scope', 'kick-off', 'livrable'],
      en: ['retainer', 'engagement', 'quote', 'fees', 'scope', 'kick-off', 'deliverable'],
    },
    pipelineStages: {
      fr: ['Lead', 'Brief reçu', 'Devis envoyé', 'Mandat signé'],
      en: ['Lead', 'Brief received', 'Quote sent', 'Engagement signed'],
    },
    revenueModel: { fr: 'Retainers mensuels + projets', en: 'Monthly retainers + project fees' },
    typicalUnit: { fr: 'mandat', en: 'engagement' },
    seasonality: { fr: 'Q4 ralentit (vacances). Janvier-mars = budget reset client = saison forte. Été = creux.', en: 'Q4 slows (holidays). Jan-Mar = client budget reset = peak. Summer = lull.' },
    painPoints: { fr: ['scope creep', 'paiements en retard', 'capacité bloquée'], en: ['scope creep', 'late payments', 'capacity bottleneck'] },
    defaultAudience: 'b2b',
  },
  {
    id: 'landscaping',
    label: { fr: 'Aménagement paysager', en: 'Landscaping' },
    vocabulary: {
      fr: ['soumission', 'estimation', 'visite des lieux', 'plantation', 'entretien', 'aménagement', 'déneigement'],
      en: ['quote', 'estimate', 'site visit', 'planting', 'maintenance', 'landscape', 'snow removal'],
    },
    pipelineStages: {
      fr: ['Demande', 'Visite des lieux', 'Soumission', 'Travaux confirmés'],
      en: ['Request', 'Site visit', 'Quote', 'Work confirmed'],
    },
    revenueModel: { fr: 'Projets ponctuels + contrats d\'entretien saisonniers', en: 'One-shot projects + seasonal maintenance contracts' },
    typicalUnit: { fr: 'projet', en: 'project' },
    seasonality: { fr: 'Avril-octobre = saison forte (90% du revenu). Novembre-mars = projets résidentiels intérieurs ou contrats déneigement.', en: 'April-October = peak (90% of revenue). November-March = indoor residential projects or snow removal contracts.' },
    painPoints: { fr: ['météo imprévisible', 'main-d\'œuvre saisonnière', 'cash flow hors-saison'], en: ['unpredictable weather', 'seasonal labor', 'off-season cash flow'] },
    defaultAudience: 'b2c',
  },
  {
    id: 'restaurant-food',
    label: { fr: 'Restaurant / Food', en: 'Restaurant / Food' },
    vocabulary: {
      fr: ['couvert', 'service', 'menu', 'réservation', 'food cost', 'rotation', 'addition'],
      en: ['cover', 'service', 'menu', 'reservation', 'food cost', 'turnover', 'check'],
    },
    pipelineStages: {
      fr: ['Visite', 'Réservation', 'Service', 'Client fidèle'],
      en: ['Walk-in', 'Reservation', 'Service', 'Repeat customer'],
    },
    revenueModel: { fr: 'Couverts × ticket moyen × jours d\'ouverture', en: 'Covers × average check × open days' },
    typicalUnit: { fr: 'couvert', en: 'cover' },
    seasonality: { fr: 'Décembre = pic (fêtes). Janvier-février = creux. Été = patio (selon localisation).', en: 'December = peak (holidays). Jan-Feb = lull. Summer = patio (location-dependent).' },
    painPoints: { fr: ['food cost qui dérape', 'rotation employés', 'no-shows réservations'], en: ['food cost creep', 'staff turnover', 'reservation no-shows'] },
    defaultAudience: 'b2c',
  },
  {
    id: 'real-estate',
    label: { fr: 'Immobilier', en: 'Real estate' },
    vocabulary: {
      fr: ['inscription', 'rencontre', 'visite', 'offre d\'achat', 'commission', 'mise', 'closing'],
      en: ['listing', 'meeting', 'showing', 'offer', 'commission', 'list price', 'closing'],
    },
    pipelineStages: {
      fr: ['Contact', 'Rencontre', 'Visite', 'Offre acceptée'],
      en: ['Lead', 'Meeting', 'Showing', 'Offer accepted'],
    },
    revenueModel: { fr: 'Commission au closing (3-7% du prix de vente typiquement)', en: 'Commission at closing (typically 3-7% of sale price)' },
    typicalUnit: { fr: 'transaction', en: 'transaction' },
    seasonality: { fr: 'Mars-juin = saison forte (acheteurs printemps). Septembre-octobre = 2e pic. Décembre-janvier = creux.', en: 'March-June = spring buyer peak. Sept-Oct = 2nd peak. Dec-Jan = lull.' },
    painPoints: { fr: ['cycle de vente long', 'taux d\'intérêt qui changent', 'inventaire faible'], en: ['long sales cycle', 'shifting interest rates', 'low inventory'] },
    defaultAudience: 'b2c',
  },
  {
    id: 'construction-renovation',
    label: { fr: 'Construction / Rénovation', en: 'Construction / Renovation' },
    vocabulary: {
      fr: ['soumission', 'estimé', 'sous-traitant', 'matériel', 'main-d\'œuvre', 'chantier', 'avenant'],
      en: ['quote', 'estimate', 'subcontractor', 'materials', 'labor', 'job site', 'change order'],
    },
    pipelineStages: {
      fr: ['Demande', 'Visite chantier', 'Soumission', 'Contrat signé'],
      en: ['Request', 'Site visit', 'Quote', 'Contract signed'],
    },
    revenueModel: { fr: 'Projet à prix fixe ou cost+ avec dépôt 30-50% upfront', en: 'Fixed-price or cost+ projects, 30-50% deposit upfront' },
    typicalUnit: { fr: 'projet', en: 'project' },
    seasonality: { fr: 'Avril-novembre = saison extérieur. Décembre-mars = rénovations intérieures. Reno + carnet rempli 6-12 mois d\'avance dans bons marchés.', en: 'April-November = exterior season. Dec-March = interior renos. Strong markets book 6-12 months ahead.' },
    painPoints: { fr: ['dépassements budget', 'pénurie sous-traitants', 'prix matériaux volatils'], en: ['budget overruns', 'subcontractor shortage', 'material price volatility'] },
    defaultAudience: 'both',
  },
  {
    id: 'health-wellness',
    label: { fr: 'Santé / Bien-être', en: 'Health / Wellness' },
    vocabulary: {
      fr: ['consultation', 'rendez-vous', 'forfait', 'séance', 'suivi', 'plan de traitement'],
      en: ['consultation', 'appointment', 'package', 'session', 'follow-up', 'treatment plan'],
    },
    pipelineStages: {
      fr: ['Premier contact', 'Consultation', 'Plan proposé', 'Forfait acheté'],
      en: ['Lead', 'Consultation', 'Plan offered', 'Package booked'],
    },
    revenueModel: { fr: 'Séances individuelles + forfaits (5-10 séances) + abonnements mensuels', en: 'Individual sessions + packages (5-10 sessions) + monthly subscriptions' },
    typicalUnit: { fr: 'séance', en: 'session' },
    seasonality: { fr: 'Janvier = pic (résolutions). Septembre = 2e pic (rentrée). Été = creux.', en: 'January = peak (resolutions). September = 2nd peak (back-to-school). Summer = lull.' },
    painPoints: { fr: ['no-shows rendez-vous', 'rétention sur forfaits', 'concurrence des apps gratuites'], en: ['appointment no-shows', 'package retention', 'free app competition'] },
    defaultAudience: 'b2c',
  },
  {
    id: 'retail',
    label: { fr: 'Commerce de détail', en: 'Retail' },
    vocabulary: {
      fr: ['ticket moyen', 'panier', 'inventaire', 'rotation', 'achalandage', 'marge'],
      en: ['average ticket', 'basket', 'inventory', 'turnover', 'foot traffic', 'margin'],
    },
    pipelineStages: {
      fr: ['Visite', 'Essai', 'Vente', 'Client fidèle'],
      en: ['Walk-in', 'Trial', 'Sale', 'Repeat customer'],
    },
    revenueModel: { fr: 'Ventes ponctuelles × marge × volume (online + boutique)', en: 'One-shot sales × margin × volume (online + brick-and-mortar)' },
    typicalUnit: { fr: 'transaction', en: 'transaction' },
    seasonality: { fr: 'Novembre-décembre = pic (Black Friday → Noël) = 30-50% du revenu annuel. Janvier-février = creux + soldes.', en: 'Nov-Dec = peak (Black Friday → Christmas) = 30-50% of annual revenue. Jan-Feb = lull + clearance.' },
    painPoints: { fr: ['inventaire mort', 'concurrence Amazon', 'achalandage en baisse'], en: ['dead inventory', 'Amazon competition', 'declining foot traffic'] },
    defaultAudience: 'b2c',
  },
  {
    id: 'consulting-coaching',
    label: { fr: 'Consultation / Coaching', en: 'Consulting / Coaching' },
    vocabulary: {
      fr: ['mandat', 'séance', 'package', 'cohort', 'audit', 'livrable', 'rétention'],
      en: ['engagement', 'session', 'package', 'cohort', 'audit', 'deliverable', 'retention'],
    },
    pipelineStages: {
      fr: ['Lead', 'Appel découverte', 'Proposition', 'Mandat signé'],
      en: ['Lead', 'Discovery call', 'Proposal', 'Engagement signed'],
    },
    revenueModel: { fr: 'Mandats fixes + retainers mensuels + cohorts ponctuels', en: 'Fixed engagements + monthly retainers + cohort programs' },
    typicalUnit: { fr: 'mandat', en: 'engagement' },
    seasonality: { fr: 'Janvier-mars + septembre-octobre = pics (rentrées). Décembre + juillet-août = creux.', en: 'Jan-March + Sept-Oct = peaks (resets). December + July-August = lull.' },
    painPoints: { fr: ['scaling au-delà de l\'heure facturée', 'positionnement clair', 'closing à distance'], en: ['scaling beyond billable hour', 'clear positioning', 'closing remotely'] },
    defaultAudience: 'both',
  },
  {
    id: 'ecommerce',
    label: { fr: 'E-commerce', en: 'E-commerce' },
    vocabulary: {
      fr: ['AOV', 'ROAS', 'conversion', 'panier abandonné', 'CAC', 'LTV', 'reorder'],
      en: ['AOV', 'ROAS', 'conversion', 'abandoned cart', 'CAC', 'LTV', 'reorder'],
    },
    pipelineStages: {
      fr: ['Visite', 'Ajout panier', 'Checkout', 'Commande payée'],
      en: ['Visit', 'Add to cart', 'Checkout', 'Paid order'],
    },
    revenueModel: { fr: 'Volume × AOV × marge — propulsé par ads + SEO + email', en: 'Volume × AOV × margin — driven by ads + SEO + email' },
    typicalUnit: { fr: 'commande', en: 'order' },
    seasonality: { fr: 'BFCM (Black Friday/Cyber Monday) + décembre = 30-40% de l\'année. Janvier-février = creux.', en: 'BFCM + December = 30-40% of yearly revenue. Jan-Feb = lull.' },
    painPoints: { fr: ['CAC qui monte', 'abandon panier', 'retours / remboursements'], en: ['rising CAC', 'cart abandonment', 'returns / refunds'] },
    defaultAudience: 'b2c',
  },
  {
    id: 'transport-logistics',
    label: { fr: 'Transport / Logistique', en: 'Transport / Logistics' },
    vocabulary: {
      fr: ['route', 'livraison', 'palette', 'route fixe', 'kilométrage', 'délai', 'volume'],
      en: ['route', 'delivery', 'pallet', 'fixed route', 'mileage', 'lead time', 'volume'],
    },
    pipelineStages: {
      fr: ['Demande', 'Devis', 'Contrat', 'Route active'],
      en: ['Request', 'Quote', 'Contract', 'Active route'],
    },
    revenueModel: { fr: 'Contrats récurrents (routes fixes) + commandes spot', en: 'Recurring contracts (fixed routes) + spot orders' },
    typicalUnit: { fr: 'livraison', en: 'delivery' },
    seasonality: { fr: 'Q4 = pic (achats fêtes). Été = creux selon la niche.', en: 'Q4 = peak (holiday shipping). Summer = lull depending on niche.' },
    painPoints: { fr: ['carburant volatil', 'retards livraison', 'pénurie chauffeurs'], en: ['volatile fuel costs', 'delivery delays', 'driver shortage'] },
    defaultAudience: 'b2b',
  },
  {
    id: 'tech-saas',
    label: { fr: 'Technologies / SaaS', en: 'Technologies / SaaS' },
    vocabulary: {
      fr: ['MRR', 'ARR', 'churn', 'ARPU', 'trial', 'demo', 'onboarding', 'expansion'],
      en: ['MRR', 'ARR', 'churn', 'ARPU', 'trial', 'demo', 'onboarding', 'expansion'],
    },
    pipelineStages: {
      fr: ['Lead', 'Démo', 'Trial', 'Closed-won'],
      en: ['Lead', 'Demo', 'Trial', 'Closed-won'],
    },
    revenueModel: { fr: 'Abonnements récurrents (mensuel/annuel) + expansion revenue', en: 'Recurring subscriptions (monthly/annual) + expansion revenue' },
    typicalUnit: { fr: 'compte', en: 'account' },
    seasonality: { fr: 'Q4 = pic enterprise (budget use-it-or-lose-it). Janvier = renouvellements. Été = decision-makers en vacances.', en: 'Q4 = enterprise peak (use-it-or-lose-it budgets). January = renewals. Summer = decision-makers OOO.' },
    painPoints: { fr: ['churn', 'CAC vs LTV ratio', 'product-led growth vs sales-led'], en: ['churn', 'CAC vs LTV ratio', 'product-led vs sales-led growth'] },
    defaultAudience: 'b2b',
  },
  {
    id: 'accounting-finance',
    label: { fr: 'Comptabilité / Finance', en: 'Accounting / Finance' },
    vocabulary: {
      fr: ['mandat', 'forfait', 'fin d\'exercice', 'T2', 'TPS/TVQ', 'audit', 'avis'],
      en: ['engagement', 'package', 'year-end', 'tax filing', 'sales tax', 'audit', 'advisory'],
    },
    pipelineStages: {
      fr: ['Lead', 'Consultation', 'Proposition', 'Mandat signé'],
      en: ['Lead', 'Consultation', 'Proposal', 'Engagement signed'],
    },
    revenueModel: { fr: 'Mandats récurrents (mensuel) + forfaits annuels (fin d\'exercice, taxes)', en: 'Recurring engagements (monthly) + annual packages (year-end, tax)' },
    typicalUnit: { fr: 'mandat', en: 'engagement' },
    seasonality: { fr: 'Janvier-avril = pic absolu (saison des taxes). Mai-juin = post-taxes recovery. Q4 = planification fin d\'année.', en: 'January-April = absolute peak (tax season). May-June = post-tax recovery. Q4 = year-end planning.' },
    painPoints: { fr: ['saisonnalité brutale', 'capacité limitée pendant taxes', 'tarification value-based vs hourly'], en: ['brutal seasonality', 'capacity bottleneck during tax season', 'value-based vs hourly pricing'] },
    defaultAudience: 'both',
  },
  {
    id: 'events',
    label: { fr: 'Événementiel', en: 'Events' },
    vocabulary: {
      fr: ['événement', 'soumission', 'logistique', 'fournisseurs', 'invités', 'budget', 'déroulement'],
      en: ['event', 'quote', 'logistics', 'vendors', 'attendees', 'budget', 'run-of-show'],
    },
    pipelineStages: {
      fr: ['Demande', 'Soumission', 'Acompte versé', 'Événement livré'],
      en: ['Inquiry', 'Quote', 'Deposit received', 'Event delivered'],
    },
    revenueModel: { fr: 'Projets ponctuels avec acompte 30-50% à la signature', en: 'One-shot projects with 30-50% deposit on signing' },
    typicalUnit: { fr: 'événement', en: 'event' },
    seasonality: { fr: 'Mai-octobre = saison mariages/corporate. Décembre = partys d\'entreprise. Janvier-mars = creux + planification.', en: 'May-October = wedding/corporate season. December = corporate parties. Jan-March = lull + planning.' },
    painPoints: { fr: ['deadlines fixes immuables', 'fournisseurs qui tombent', 'changements last-minute clients'], en: ['immovable deadlines', 'vendor flake', 'last-minute client changes'] },
    defaultAudience: 'both',
  },
  {
    id: 'beauty-salon',
    label: { fr: 'Beauté / Salon', en: 'Beauty / Salon' },
    vocabulary: {
      fr: ['rendez-vous', 'forfait', 'service', 'client régulier', 'no-show', 'pourboire', 'fidélisation'],
      en: ['appointment', 'package', 'service', 'regular client', 'no-show', 'tip', 'loyalty'],
    },
    pipelineStages: {
      fr: ['Premier contact', 'Premier RDV', 'Forfait acheté', 'Client régulier'],
      en: ['Lead', 'First appointment', 'Package purchased', 'Regular client'],
    },
    revenueModel: { fr: 'Services à l\'unité + forfaits + ventes produits (~20% du revenu)', en: 'Per-service + packages + product sales (~20% of revenue)' },
    typicalUnit: { fr: 'service', en: 'service' },
    seasonality: { fr: 'Mai-juin = pics mariages. Décembre = pic fêtes. Janvier-février = creux. Septembre = rentrée.', en: 'May-June = wedding peaks. December = holiday peak. Jan-Feb = lull. September = back-to-school.' },
    painPoints: { fr: ['no-shows', 'rétention staff', 'concurrence salons low-cost'], en: ['no-shows', 'staff retention', 'low-cost salon competition'] },
    defaultAudience: 'b2c',
  },
  {
    id: 'other',
    label: { fr: 'Autre', en: 'Other' },
    vocabulary: { fr: [], en: [] },
    pipelineStages: {
      fr: ['Contacté', 'Répondu', 'Démo', 'Signé'],
      en: ['Contacted', 'Replied', 'Demo', 'Signed'],
    },
    revenueModel: { fr: 'Modèle personnalisé', en: 'Custom model' },
    typicalUnit: { fr: 'transaction', en: 'transaction' },
    seasonality: { fr: 'Saisonnalité spécifique au secteur', en: 'Sector-specific seasonality' },
    painPoints: { fr: [], en: [] },
    defaultAudience: 'both',
  },
];

export const AUDIENCE_OPTIONS = [
  { id: 'b2b',  label: { fr: 'B2B (entreprises)',         en: 'B2B (businesses)' },        rgb: '59,130,246'  },
  { id: 'b2c',  label: { fr: 'B2C (particuliers)',         en: 'B2C (individuals)' },       rgb: '16,185,129'  },
  { id: 'both', label: { fr: 'Les deux',                   en: 'Both' },                    rgb: '139,92,246'  },
];

/** Get a sector by id. Returns the 'other' sector as fallback. */
export function getSector(sectorId) {
  return SECTORS.find((s) => s.id === sectorId) || SECTORS.find((s) => s.id === 'other');
}

/** Get audience config by id. */
export function getAudience(audienceId) {
  return AUDIENCE_OPTIONS.find((a) => a.id === audienceId) || AUDIENCE_OPTIONS[2]; // 'both' as fallback
}

/**
 * Resolve sector display label. If sector === 'other' and a custom value
 * exists in the profile, use the custom value as the displayed sector name.
 */
export function getSectorLabel(profile, lang = 'fr') {
  if (!profile?.sector) return '';
  if (profile.sector === 'other' && profile.sectorCustom?.trim()) {
    return profile.sectorCustom.trim();
  }
  const s = getSector(profile.sector);
  return s.label[lang] || s.label.fr;
}

/** Get pipeline stage labels for a given sector + lang. Falls back to defaults. */
export function getPipelineStages(sectorId, lang = 'fr') {
  const s = getSector(sectorId);
  return s.pipelineStages[lang] || s.pipelineStages.fr;
}

/**
 * Build a SECTOR CONTEXT block for agent prompts. Returns null if no sector
 * (caller skips the block). Includes vocabulary, pipeline mapping, revenue
 * model, typical unit, seasonality, and audience.
 */
export function formatSectorContext(profile, lang = 'fr') {
  if (!profile?.sector) return null;
  const sector = getSector(profile.sector);
  const sectorName = getSectorLabel(profile, lang);
  const audience = getAudience(profile.audience || sector.defaultAudience);

  const L = lang === 'fr';
  const lines = [];
  lines.push(L
    ? `SECTEUR DE L'UTILISATEUR : ${sectorName} · Audience : ${audience.label.fr}`
    : `USER'S SECTOR: ${sectorName} · Audience: ${audience.label.en}`);
  if (sector.vocabulary[lang]?.length > 0) {
    lines.push(L
      ? `Vocabulaire à utiliser : ${sector.vocabulary[lang].join(', ')}`
      : `Vocabulary to use: ${sector.vocabulary[lang].join(', ')}`);
  }
  if (sector.revenueModel?.[lang]) {
    lines.push(L
      ? `Modèle de revenu typique : ${sector.revenueModel[lang]}`
      : `Typical revenue model: ${sector.revenueModel[lang]}`);
  }
  if (sector.typicalUnit?.[lang]) {
    lines.push(L
      ? `Unité typique de vente : ${sector.typicalUnit[lang]} (utilise ce mot)`
      : `Typical sale unit: ${sector.typicalUnit[lang]} (use this word)`);
  }
  if (sector.seasonality?.[lang]) {
    lines.push(L
      ? `Saisonnalité : ${sector.seasonality[lang]}`
      : `Seasonality: ${sector.seasonality[lang]}`);
  }
  if (sector.painPoints[lang]?.length > 0) {
    lines.push(L
      ? `Pain points typiques du secteur : ${sector.painPoints[lang].join(' · ')}`
      : `Typical sector pain points: ${sector.painPoints[lang].join(' · ')}`);
  }
  lines.push(L
    ? `RÈGLE : utilise le vocabulaire ci-dessus, donne des exemples spécifiques au secteur, ne reste jamais générique.`
    : `RULE: use the vocabulary above, give sector-specific examples, never stay generic.`);
  return lines.join('\n');
}

/**
 * Build a short SECTOR HINT for the library detail modal — surfaces vocabulary
 * substitutions to remind the user to adapt the framework's language.
 */
export function getSectorHint(profile, lang = 'fr') {
  if (!profile?.sector || profile.sector === 'other') return null;
  const sector = getSector(profile.sector);
  const sectorName = getSectorLabel(profile, lang);
  const vocab = sector.vocabulary[lang] || [];
  if (vocab.length === 0) return null;
  return {
    sectorName,
    vocabulary: vocab.slice(0, 6),
    typicalUnit: sector.typicalUnit?.[lang] || null,
  };
}
