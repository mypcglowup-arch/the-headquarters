/**
 * Workflow pricing logic — local, deterministic, zero-LLM.
 *
 * Complexity = volume tier + tools count + industry weight + template base.
 * → Pricing tier (Starter / Pro / Enterprise) with suggested ranges
 * → Feeds the sales-script LLM call so Claude pitches real numbers.
 */

const INDUSTRY_WEIGHTS = {
  Restaurant:      1.0,
  Salon:           1.0,
  Garage:          1.1,
  Clinique:        1.3,
  Boulangerie:     0.9,
  Dépanneur:       0.9,
  Gym:             1.0,
  Spa:             1.1,
  'B2B services': 1.3,
  'Pro services':  1.4,
  'Services pro':  1.4,
  'E-commerce':    1.5,
  SaaS:            1.6,
  Resto:           1.0,
  Autre:           1.0,
};

function volumeScore(volume) {
  const v = Number(volume) || 0;
  if (v <= 0)   return 0;
  if (v < 10)   return 1;
  if (v < 30)   return 2;
  if (v < 100)  return 3;
  if (v < 300)  return 4;
  return 5;
}

function toolsScore(tools) {
  if (!Array.isArray(tools)) return 0;
  // "Aucun" means no integrations — cheaper on one hand (no migration) but
  // still requires bootstrap, so count it as 1.
  const count = tools.length || 0;
  if (count === 0) return 1;
  if (count === 1) return 1;
  if (count <= 3)  return 2;
  if (count <= 5)  return 3;
  return 4;
}

// Input: answers object { clientName, industry, tools[], volume, budget } + template
// Output: { score, tier, setupMin, setupMax, retainerMin, retainerMax, industryMultiplier }
export function computePricing(answers = {}, template = null) {
  const base     = Number(template?.complexityBase) || 3;
  const vScore   = volumeScore(answers.volume);
  const tScore   = toolsScore(answers.tools);
  const industry = answers.industry || 'Autre';
  const mult     = INDUSTRY_WEIGHTS[industry] ?? 1.0;

  // Raw score before industry multiplier: 0..15
  const raw  = base + vScore + tScore;
  const scoreRaw = Math.round(raw * mult * 10) / 10;

  let tier, setupMin, setupMax, retainerMin, retainerMax;
  if (scoreRaw < 5) {
    tier        = 'Starter';
    setupMin    = 600;
    setupMax    = 1200;
    retainerMin = 150;
    retainerMax = 300;
  } else if (scoreRaw < 9) {
    tier        = 'Pro';
    setupMin    = 1500;
    setupMax    = 3000;
    retainerMin = 400;
    retainerMax = 800;
  } else if (scoreRaw < 13) {
    tier        = 'Enterprise';
    setupMin    = 3500;
    setupMax    = 6500;
    retainerMin = 900;
    retainerMax = 1800;
  } else {
    tier        = 'Custom';
    setupMin    = 6500;
    setupMax    = 12000;
    retainerMin = 1800;
    retainerMax = 3500;
  }

  // Apply industry multiplier to the final ranges (reflects complexity/risk)
  if (mult !== 1.0) {
    setupMin    = Math.round(setupMin * mult / 50) * 50;
    setupMax    = Math.round(setupMax * mult / 50) * 50;
    retainerMin = Math.round(retainerMin * mult / 25) * 25;
    retainerMax = Math.round(retainerMax * mult / 25) * 25;
  }

  return {
    score: scoreRaw,
    tier,
    setupMin,
    setupMax,
    retainerMin,
    retainerMax,
    industryMultiplier: mult,
    breakdown: { base, volumeScore: vScore, toolsScore: tScore, industry, mult },
  };
}

// Check if user's stated budget matches the computed tier
export function budgetAlignment(stated, pricing) {
  if (!stated || !pricing) return 'unknown';
  const s = String(stated).toLowerCase();
  const { retainerMin } = pricing;
  // Rough parse of budget dropdown values
  const numbers = s.match(/\d+/g) || [];
  const max = numbers.length ? Math.max(...numbers.map(Number)) : 0;
  if (max === 0) return 'unknown';
  if (max < retainerMin) return 'below';
  if (max < retainerMin * 2) return 'tight';
  return 'comfortable';
}
