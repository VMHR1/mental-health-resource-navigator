/**
 * Level-of-care hub pages (Task 7 / Phase 2). Each hub is a plain alphabetical
 * list of programs matching an explicit `matches` predicate over
 * `level_of_care` — never a fuzzy/substring match, so it's obvious from
 * reading the code exactly which data rows land on which hub.
 *
 * Threshold defense: every hub here has >=5 matching listings against the
 * current public/data/programs.json (PHP 44, IOP 45, Residential 5, Crisis
 * aggregate 11 = Mobile Crisis 5 + Crisis Hotline 4 + Walk-In Crisis / Urgent 1
 * + Psychiatric Triage 1). Outpatient (2) and Navigation (3) stay below the
 * >=5 threshold and intentionally do NOT get hub pages — they remain
 * reachable only via /directory. A hub whose predicate matches zero programs
 * throws at build time (see generateProgramPages()) rather than shipping a
 * silently empty page.
 *
 * This lives in its own module because two consumers need it:
 * `scripts/generate-program-pages.js` (fills the hub lists + their ItemList
 * JSON-LD) and `scripts/render-program-detail.js` (picks the middle crumb of
 * each program page's BreadcrumbList). A duplicated copy would let the two
 * disagree about which hub a level of care belongs to.
 *
 * `breadcrumbName` is the hub page's own <h1> text, so the crumb a crawler
 * reads matches the heading it lands on.
 */
export const HUB_PAGES = [
  {
    file: 'php-programs.html',
    path: '/php-programs',
    label: 'PHP',
    breadcrumbName: 'Partial Hospitalization (PHP) programs',
    listName: 'Partial Hospitalization (PHP) programs in the ViableMHR directory',
    matches: (careLevel) => careLevel === 'Partial Hospitalization (PHP)',
  },
  {
    file: 'iop-programs.html',
    path: '/iop-programs',
    label: 'IOP',
    breadcrumbName: 'Intensive Outpatient (IOP) programs',
    listName: 'Intensive Outpatient (IOP) programs in the ViableMHR directory',
    matches: (careLevel) => careLevel === 'Intensive Outpatient (IOP)',
  },
  {
    file: 'residential-programs.html',
    path: '/residential-programs',
    label: 'Residential',
    breadcrumbName: 'Residential programs',
    listName: 'Residential programs in the ViableMHR directory',
    matches: (careLevel) => careLevel === 'Residential',
  },
  {
    file: 'crisis-resources.html',
    path: '/crisis-resources',
    label: 'Crisis',
    breadcrumbName: 'Crisis resources',
    listName: 'Crisis resources in the ViableMHR directory',
    // Explicit allowlist of the crisis-ish level_of_care strings present in
    // public/data/programs.json — deliberately not a fuzzy/substring match
    // (e.g. "Walk-In Outpatient" must NOT match this hub).
    matches: (careLevel) =>
      careLevel === 'Mobile Crisis' ||
      careLevel === 'Crisis Hotline' ||
      careLevel === 'Walk-In Crisis / Urgent' ||
      careLevel === 'Psychiatric Triage',
  },
];

/** The directory page, used as the breadcrumb fallback for levels of care with no hub. */
export const DIRECTORY_PAGE = {
  file: 'directory.html',
  path: '/directory',
  breadcrumbName: 'All programs',
  listName: 'All programs in the ViableMHR directory',
};

/** The hub that lists `careLevel`, or null when that level of care has no hub page. */
export function hubForCareLevel(careLevel) {
  return HUB_PAGES.find((h) => h.matches(careLevel)) || null;
}
