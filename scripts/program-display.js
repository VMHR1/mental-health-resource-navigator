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

// `insurance_notes` is often "Plans: … | Types: … | free text". The Plans and
// Types segments duplicate the chips/plan list, so only free text is kept.
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

// --- Ages (spec 1.3) --------------------------------------------------------

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
 * other entry type) get the baseline only, since no Phase 2 fact will answer
 * the topic questions for them.
 */
export function callQuestions(program, publishedTopics = new Set()) {
  const questions = [...BASELINE_QUESTIONS];
  if (program?.entry_type !== 'Treatment Program') return questions;
  for (const [topic, question] of Object.entries(TOPIC_QUESTIONS)) {
    if (!publishedTopics.has(topic)) questions.push(question);
  }
  return questions;
}
