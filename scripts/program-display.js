/**
 * Small display helpers for program detail pages (spec 1.2–1.5,
 * docs/superpowers/specs/2026-09-27-program-page-content-design.md).
 *
 * Pure functions over a program record from public/data/programs.json.
 * No DOM, no HTML escaping — the page renderer escapes what it emits.
 * Copy is neutral and informational; never a claim about quality.
 */

// --- Insurance (spec 1.2) ---------------------------------------------------

// Fixed display order for the structured `insurance_categories` field.
const INSURANCE_CHIPS = [
  ['commercial', 'Commercial'],
  ['medicaid_chip', 'Medicaid/CHIP'],
  ['tricare', 'TRICARE'],
  ['medicare', 'Medicare'],
];

/**
 * Chip labels from the structured `insurance_categories` array, in a fixed
 * order. Unknown values are ignored; a missing or non-array field gives [].
 * Deliberately separate from insuranceCategories() in render-program-detail.js,
 * which feeds meta descriptions.
 */
export function insuranceChipLabels(program) {
  const cats = program?.insurance_categories;
  if (!Array.isArray(cats)) return [];
  return INSURANCE_CHIPS.filter(([key]) => cats.includes(key)).map(([, label]) => label);
}

// `insurance_notes` is often "Plans: … | Types: … | free text". The Types
// segment duplicates the chips and the Plans segment is shown separately by
// insurancePlanNames(), so only free text is kept here.
const SCAFFOLD_SEGMENT = /^(plans|types)\s*:/i;

/**
 * One readable insurance sentence: `accepted_insurance.notes` when present,
 * otherwise `insurance_notes` with its Plans/Types segments removed.
 * Returns '' when nothing readable remains.
 */
export function insuranceSentence(program) {
  const accepted = program?.accepted_insurance?.notes;
  if (typeof accepted === 'string' && accepted.trim()) return accepted.trim();

  const raw = program?.insurance_notes;
  if (typeof raw !== 'string') return '';
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s && !SCAFFOLD_SEGMENT.test(s))
    .join(' ');
}

// The 16 Crisis Service rows carry this literal in insurance_notes. It reads
// as a data code, so pages show it as a plain statement instead.
const NOT_BILLED_RAW = 'N/A (not an insurance-billed service)';
const NOT_BILLED_LABEL = 'Not billed to insurance';

/**
 * The insurance sentence as shown on program pages: insuranceSentence() with
 * the crisis "not billed" literal reworded. Returns '' when nothing readable
 * remains. Mirrored by displayInsuranceNote() in src/js/program-detail.js.
 */
export function insuranceDisplayNote(program) {
  const sentence = insuranceSentence(program);
  return sentence === NOT_BILLED_RAW ? NOT_BILLED_LABEL : sentence;
}

// Entries like "Most major commercial insurance" or "See Texas Health 'Insurance
// Plans Accepted' list (…)" describe coverage rather than name a plan. They sit
// badly under "Plans listed on their website:", and every record carrying one
// already says the same thing in its insurance sentence, so they are dropped.
const GENERIC_PLAN_ENTRY = /^(most|see)\b/i;

/** Split on commas that are not inside parentheses. */
function splitPlanList(text) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length ? value : null;
}

/**
 * Named insurance plans for the "Plans listed on their website:" line
 * (controller Ruling 10). Source, first one present wins:
 *   1. accepted_insurance.plans_raw — the plan names as the program's website
 *      spells them;
 *   2. accepted_insurance.plans — the normalized matching vocabulary, used only
 *      when there is no raw list (it is lossy: it turns "See Texas Health …
 *      list (many commercial, Medicare Advantage, …)" into just "Medicare");
 *   3. the "Plans:" segment of insurance_notes, split on top-level commas.
 * Then: trimmed, empties and case-insensitive duplicates dropped, generic
 * "Most …"/"See …" phrases dropped. Returns [] when nothing is named.
 * Mirrored by displayInsurancePlanNames() in src/js/program-detail.js.
 */
export function insurancePlanNames(program) {
  const accepted = program?.accepted_insurance;
  let source = nonEmptyArray(accepted?.plans_raw) || nonEmptyArray(accepted?.plans);
  if (!source) {
    const raw = typeof program?.insurance_notes === 'string' ? program.insurance_notes : '';
    const segment = raw.split('|').map((s) => s.trim()).find((s) => /^plans\s*:/i.test(s));
    source = segment ? splitPlanList(segment.replace(/^plans\s*:/i, '')) : [];
  }

  const seen = new Set();
  const names = [];
  for (const entry of source) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim();
    if (!name || GENERIC_PLAN_ENTRY.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

// --- Ages (spec 1.3)--------------------------------------------------------

const AGES_UNKNOWN = 'Ages served not published — ask when you call.';

function ageNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** One-line age fit, e.g. "Serves ages 12–17" or "Serves ages 11 and up". */
export function ageFitLine(program) {
  const min = ageNumber(program?.age_min);
  const max = ageNumber(program?.age_max);
  // A minimum of 0 carries no information ("from birth"), so treat it as open.
  const lo = min && min > 0 ? min : null;

  if (lo !== null && max !== null) {
    return lo === max ? `Serves age ${lo}` : `Serves ages ${lo}–${max}`;
  }
  if (lo !== null) return `Serves ages ${lo} and up`;
  if (max !== null) return `Serves ages ${max} and under`;
  if (min === 0) return 'Serves all ages';

  const text = typeof program?.ages_served === 'string' ? program.ages_served.trim() : '';
  if (text && text.toLowerCase() !== 'unknown') return `Ages served: ${text}`;
  return AGES_UNKNOWN;
}

// --- Transportation (spec 1.5) ----------------------------------------------

const HIDDEN_TRANSPORT = new Set(['', 'unknown', 'n/a']);

/** False when transportation is unknown, N/A, or missing — the row is omitted. */
export function showTransportation(program) {
  const value = program?.transportation_available;
  if (typeof value !== 'string') return false;
  return !HIDDEN_TRANSPORT.has(value.trim().toLowerCase());
}

// --- Questions to ask when you call (spec 1.4) ------------------------------

/** Always shown: things no published fact can answer (they change daily). */
export const BASELINE_QUESTIONS = Object.freeze([
  'Do you have openings right now, or is there a waitlist?',
  'Are you in-network with our specific insurance plan?',
]);

/**
 * One question per Phase 2 topic (spec 2.1 field names). Shown only while
 * that topic has no published fact.
 */
export const TOPIC_QUESTIONS = Object.freeze({
  conditions: 'What conditions or concerns does this program treat?',
  schedule: 'What are the program hours, and how many weeks does it usually last?',
  family: 'How are parents and family involved in treatment?',
  school: 'How will my child keep up with school during the program?',
  admission: 'What are the steps to get admitted, and do we need a referral first?',
});

/**
 * Checklist for the program page. Treatment Programs get the baseline plus a
 * question for every topic not in `publishedTopics`. Crisis Services (and any
 * other entry type) get an empty list and the page renders no questions
 * section: a 24/7, not-insurance-billed crisis line has no waitlist or
 * network to ask about (controller ruling 2026-09-27, overrides spec 1.4's
 * "baseline only" for crisis pages).
 */
export function callQuestions(program, publishedTopics = new Set()) {
  if (program?.entry_type !== 'Treatment Program') return [];
  const questions = [...BASELINE_QUESTIONS];
  for (const [topic, question] of Object.entries(TOPIC_QUESTIONS)) {
    if (!publishedTopics.has(topic)) questions.push(question);
  }
  return questions;
}
