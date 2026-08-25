/**
 * Programmatic landing pages (care level × city, care level × insurance
 * category, and virtual/telehealth) generated at build time from ONE template
 * (`src/html/landing.html`) — the same shape as
 * `scripts/generate-program-pages.js`, so no per-page HTML is ever
 * hand-written.
 *
 * Thin-page guard: a page is only emitted when at least LANDING_MIN_PROGRAMS
 * (3) distinct programs match. Combinations below the threshold produce no
 * file, no sitemap entry, and no cross-link — the directory and the level-of-
 * care hubs remain their only crawl path. `computeLandingPages()` is pure and
 * exported so tests can assert the same inventory the build writes.
 *
 * Neutrality: page copy never ranks, recommends, or marks a listing as paid.
 * Programs are listed alphabetically by program_name (the same arbitrary-but-
 * stable rule the hubs use) and the ItemList positions come from that rendered
 * order — see buildItemListJson() in generate-program-pages.js.
 *
 * Insurance wording: `insurance_categories[]` is derived from what the
 * provider lists on its own website (scripts/populate-structured-fields.js).
 * It is NOT a coverage guarantee, an eligibility check, or a claim that a
 * specific plan is in network, so every insurance page carries a standing
 * disclaimer telling families to confirm with the program directly.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { CARE_LEVEL_SLUGS } from '../src/js/config/validation-schema.js';
import { safeStr, escapeHtml } from '../src/js/utils/helpers.js';
import {
  programPublicPath,
  bestLastVerified,
  formatVerifiedMonth,
} from './render-program-detail.js';
import { HUB_PAGES, DIRECTORY_PAGE } from './hub-config.js';
import { PAGES } from './page-manifest.js';

const SITE_BASE = 'https://viablemhr.com';

/** Thin-page guard: fewer matching programs than this and no page is written. */
export const LANDING_MIN_PROGRAMS = 3;

/** Sitemap knobs for every landing page (folded into dist/sitemap-pages.xml). */
export const LANDING_SITEMAP = { priority: '0.6', changefreq: 'weekly' };

/** The template the build copies to dist/ and this module consumes + deletes. */
export const LANDING_TEMPLATE_DEST = 'landing.html';

/**
 * Cities that stand in for "no street location" — the same set
 * scripts/render-program-detail.js refuses to turn into a PostalAddress. A
 * pseudo-city must never become a "programs in {city}" page.
 */
const PSEUDO_LOCATION_CITIES = new Set(['Virtual', 'Multiple', 'National']);

/**
 * The only levels of care that get city/insurance landing pages. PHP (44) and
 * IOP (45) are the two with enough listings for per-city slices to clear the
 * threshold; Residential (5), Outpatient (2), Navigation (3) and the crisis
 * levels do not, and adding them would generate pages that fail the guard
 * anyway. `hub` is the landing page's breadcrumb parent.
 */
const LANDING_CARE_LEVELS = [
  { level: 'Partial Hospitalization (PHP)', short: 'PHP', hubPath: '/php-programs' },
  { level: 'Intensive Outpatient (IOP)', short: 'IOP', hubPath: '/iop-programs' },
];

/**
 * insurance_categories[] values that get pages, with the slug used in the URL
 * and the label families see. The `filterValue` is the `insurance` URL param
 * the interactive directory understands — the `bucket:*` keys in
 * INSURANCE_BUCKETS (src/js/modules/filters.js).
 *
 * `self_pay` and `sliding_scale` are in INSURANCE_CATEGORIES but are not
 * populated on any record, so they are deliberately absent here rather than
 * generating empty pages.
 */
const LANDING_INSURANCE = [
  { category: 'commercial', slug: 'commercial', label: 'commercial insurance', filterValue: 'bucket:commercial' },
  { category: 'medicaid_chip', slug: 'medicaid', label: 'Medicaid or CHIP', filterValue: 'bucket:medicaid' },
  { category: 'medicare', slug: 'medicare', label: 'Medicare', filterValue: 'bucket:medicare' },
  { category: 'tricare', slug: 'tricare', label: 'TRICARE or military coverage', filterValue: 'bucket:tricare' },
];

/** "Fort Worth" -> "fort-worth". Returns '' for anything that yields no slug. */
export function citySlug(city) {
  return safeStr(city)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Programs with a usable, unique program_id — the same filter the hubs apply. */
function listablePrograms(programs) {
  return (Array.isArray(programs) ? programs : []).filter((p) => {
    const id = (p.program_id || '').toString().trim();
    return Boolean(id) && /^[a-z0-9_-]+$/i.test(id);
  });
}

/** Alphabetical by program_name — a stable ordering rule, never a ranking. */
function alphabetical(entries) {
  return entries
    .slice()
    .sort((a, b) => safeStr(a.program_name).localeCompare(safeStr(b.program_name)));
}

/** Distinct non-pseudo cities this program has a location in. */
function programCities(program) {
  const locs = Array.isArray(program.locations) ? program.locations : [];
  const out = new Set();
  for (const l of locs) {
    const city = safeStr(l && l.city);
    if (!city || PSEUDO_LOCATION_CITIES.has(city)) continue;
    out.add(city);
  }
  return out;
}

/**
 * True when the program is offered virtually. Three independent signals are
 * accepted because the data carries all three and none is authoritative on its
 * own: the derived `virtual_available` boolean, a `service_setting` of
 * "Virtual", and a "Virtual" pseudo-city in locations[].
 */
export function isVirtualProgram(program) {
  if (program.virtual_available === true) return true;
  if (safeStr(program.service_setting) === 'Virtual') return true;
  return (Array.isArray(program.locations) ? program.locations : []).some(
    (l) => safeStr(l && l.city) === 'Virtual'
  );
}

/** Newest last_verified across the listed programs — the page's <lastmod>. */
export function newestLastVerified(entries) {
  let newest = '';
  for (const p of entries) {
    const d = bestLastVerified(p);
    if (d && d > newest) newest = d;
  }
  return newest;
}

/**
 * Every landing page the current data supports, in a deterministic order:
 * care-level × city, then care-level × insurance, then virtual.
 *
 * Returns descriptors only — no I/O — so tests can assert the inventory
 * without a build. Each descriptor carries the `entries` it will list, so the
 * rendered HTML, the ItemList JSON-LD, the visible count and the sitemap
 * lastmod all come from one array and cannot drift apart.
 */
export function computeLandingPages(programs) {
  const all = listablePrograms(programs);
  const pages = [];

  for (const care of LANDING_CARE_LEVELS) {
    const atLevel = all.filter((p) => safeStr(p.level_of_care) === care.level);

    // --- care level x city ---
    const byCity = new Map();
    for (const p of atLevel) {
      for (const city of programCities(p)) {
        if (!byCity.has(city)) byCity.set(city, []);
        byCity.get(city).push(p);
      }
    }
    const cities = [...byCity.keys()].sort((a, b) => a.localeCompare(b));
    for (const city of cities) {
      const entries = alphabetical(byCity.get(city));
      if (entries.length < LANDING_MIN_PROGRAMS) continue;
      const slug = `${CARE_LEVEL_SLUGS[care.level]}-${citySlug(city)}`;
      const state = safeStr((byCity.get(city)[0].locations || []).find(
        (l) => safeStr(l && l.city) === city
      )?.state) || 'TX';
      const place = `${city}, ${state}`;
      pages.push({
        kind: 'city',
        slug,
        careShort: care.short,
        careLevel: care.level,
        city,
        hubPath: care.hubPath,
        entries,
        h1: `${care.level} programs in ${place}`,
        title: `${care.level} programs in ${place}`,
        breadcrumbName: `${care.short} in ${place}`,
        listName: `${care.level} programs with a ${place} location in the ViableMHR directory`,
        description:
          `${care.level} youth programs with a ${place} location. Ages served, ` +
          `insurance listings and the last-verified date for each. ` +
          `${entries.length} ${entries.length === 1 ? 'program' : 'programs'} listed.`,
        introLead:
          `This directory lists ${entries.length} ${care.short} ` +
          `${entries.length === 1 ? 'program' : 'programs'} with a location in ${place}.`,
        directoryQuery: `?care=${encodeURIComponent(care.level)}&loc=${encodeURIComponent(city)}`,
        directoryLabel: `${care.short} programs near ${city}`,
      });
    }

    // --- care level x insurance category ---
    for (const ins of LANDING_INSURANCE) {
      const entries = alphabetical(
        atLevel.filter(
          (p) => Array.isArray(p.insurance_categories) && p.insurance_categories.includes(ins.category)
        )
      );
      if (entries.length < LANDING_MIN_PROGRAMS) continue;
      pages.push({
        kind: 'insurance',
        slug: `${CARE_LEVEL_SLUGS[care.level]}-${ins.slug}`,
        careShort: care.short,
        careLevel: care.level,
        insuranceLabel: ins.label,
        hubPath: care.hubPath,
        entries,
        h1: `${care.level} programs listing ${ins.label}`,
        title: `${care.level} programs listing ${ins.label}`,
        breadcrumbName: `${care.short} listing ${ins.label}`,
        listName: `${care.level} programs listing ${ins.label} in the ViableMHR directory`,
        description:
          `${care.level} youth programs that list ${ins.label} on the provider's own website. ` +
          `Families should confirm coverage with the program before intake. ` +
          `${entries.length} ${entries.length === 1 ? 'program' : 'programs'} listed.`,
        introLead:
          `This directory lists ${entries.length} ${care.short} ` +
          `${entries.length === 1 ? 'program that names' : 'programs that name'} ${ins.label} ` +
          `on ${entries.length === 1 ? 'its own website' : 'their own websites'}.`,
        directoryQuery: `?care=${encodeURIComponent(care.level)}&insurance=${encodeURIComponent(ins.filterValue)}`,
        directoryLabel: `${care.short} programs filtered by ${ins.label}`,
      });
    }
  }

  // --- virtual / telehealth ---
  const virtualEntries = alphabetical(all.filter(isVirtualProgram));
  if (virtualEntries.length >= LANDING_MIN_PROGRAMS) {
    pages.push({
      kind: 'virtual',
      slug: 'virtual-programs',
      hubPath: DIRECTORY_PAGE.path,
      entries: virtualEntries,
      h1: 'Virtual and telehealth youth programs',
      title: 'Virtual and telehealth youth programs in Texas',
      breadcrumbName: 'Virtual and telehealth programs',
      listName: 'Virtual and telehealth youth programs in the ViableMHR directory',
      description:
        'Texas youth mental health programs in this directory that deliver services virtually ' +
        'or by telehealth. Ages served and the last-verified date for each. ' +
        `${virtualEntries.length} ${virtualEntries.length === 1 ? 'program' : 'programs'} listed.`,
      introLead:
        `This directory lists ${virtualEntries.length} ` +
        `${virtualEntries.length === 1 ? 'program' : 'programs'} delivered virtually or by telehealth.`,
      directoryQuery: '?virtual=1',
      directoryLabel: 'virtual programs',
    });
  }

  // Every landing page carries a lastmod derived from the newest last_verified
  // among the programs it lists — the same rule sitemap-programs.xml uses per
  // program, so a page cannot claim to be fresher than its own listings.
  for (const page of pages) {
    page.path = `/${page.slug}`;
    page.url = `${SITE_BASE}/${page.slug}`;
    page.file = `${page.slug}.html`;
    page.count = page.entries.length;
    page.lastmod = newestLastVerified(page.entries);
  }

  assertNoSlugCollisions(pages);
  return pages;
}

/**
 * A landing slug that collides with a manifest page (or with another landing
 * page) would silently overwrite a real page in dist/. Fail the build loudly
 * instead — this is cheap and the failure mode is invisible otherwise.
 */
function assertNoSlugCollisions(pages) {
  const reserved = new Set(PAGES.map((p) => p.dest.replace(/\.html$/, '')));
  const seen = new Set();
  const collisions = [];
  for (const page of pages) {
    if (reserved.has(page.slug)) collisions.push(`${page.slug} collides with a page-manifest page`);
    if (seen.has(page.slug)) collisions.push(`${page.slug} is generated twice`);
    seen.add(page.slug);
  }
  if (collisions.length > 0) {
    throw new Error(`generate-landing-pages: slug collision(s): ${collisions.join('; ')}`);
  }
}

/**
 * The `<li>` items for one landing page: program name (linked to its static
 * page), organization, ages served, city, and the month it was last verified.
 * Richer than buildHubListHtml()'s name/org/city because a landing page is the
 * intended entry point for a query like "IOP Plano" and has to answer the
 * ages/insurance question without a second click.
 *
 * The `<li><a href="/programs/{id}">` prefix is kept byte-identical to the hub
 * markup so the ItemList-vs-rendered-links check in tests/seo.spec.js can use
 * the same regex on both.
 */
export function buildLandingListHtml(entries) {
  return (entries || [])
    .map((p) => {
      const name = escapeHtml(safeStr(p.program_name) || 'Program');
      const href = programPublicPath(p.program_id || '');
      const org = safeStr(p.organization);
      const orgText = org ? ` — ${escapeHtml(org)}` : '';

      const bits = [];
      const ages = safeStr(p.ages_served);
      if (ages) bits.push(`Ages ${escapeHtml(ages)}`);

      const cities = [...programCities(p)];
      if (cities.length > 0) bits.push(escapeHtml(cities.join(', ')));
      else if (isVirtualProgram(p)) bits.push('Virtual');

      const verified = formatVerifiedMonth(bestLastVerified(p));
      if (verified) bits.push(`Verified ${escapeHtml(verified)}`);

      const meta = bits.length > 0 ? `<span class="landing-meta">${bits.join(' · ')}</span>` : '';
      return `<li><a href="${href}">${name}</a>${orgText}${meta}</li>`;
    })
    .join('\n        ');
}

/** BreadcrumbList JSON-LD: Home -> parent hub (or /directory) -> this page. */
export function buildLandingBreadcrumbLd(page) {
  const hub = HUB_PAGES.find((h) => h.path === page.hubPath);
  const parentName = hub ? hub.breadcrumbName : DIRECTORY_PAGE.breadcrumbName;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_BASE}/` },
      { '@type': 'ListItem', position: 2, name: parentName, item: `${SITE_BASE}${page.hubPath}` },
      { '@type': 'ListItem', position: 3, name: page.breadcrumbName, item: page.url },
    ],
  };
}

/** Visible breadcrumb trail matching the BreadcrumbList above. */
function renderCrumbsHtml(page) {
  const hub = HUB_PAGES.find((h) => h.path === page.hubPath);
  const parentName = hub ? hub.breadcrumbName : DIRECTORY_PAGE.breadcrumbName;
  return `<nav class="landing-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="${page.hubPath}">${escapeHtml(parentName)}</a> › <span aria-current="page">${escapeHtml(page.breadcrumbName)}</span></nav>`;
}

/**
 * Intro paragraph: the real count plus a link into the interactive directory
 * with the equivalent filters pre-applied (the `care`/`loc`/`insurance`/
 * `virtual` params src/app.js:loadURLState() reads).
 *
 * The directory's insurance filter matches on the raw payer text
 * (INSURANCE_BUCKETS in src/js/modules/filters.js) while this page's list
 * comes from the derived `insurance_categories[]`, so the two can return
 * slightly different sets. The copy says "open the same search" rather than
 * promising an identical result count.
 */
function renderIntroHtml(page) {
  // `&` must be `&amp;` inside an href attribute; the param values themselves
  // are already percent-encoded by encodeURIComponent() in computeLandingPages().
  const href = `/${page.directoryQuery}`.replace(/&/g, '&amp;');
  return `<p class="hub-intro">${escapeHtml(page.introLead)} <a href="${href}">Open ${escapeHtml(page.directoryLabel)} in the searchable directory</a> to add age, distance, or other filters.</p>`;
}

/**
 * The standing insurance disclaimer. `insurance_categories[]` records what the
 * provider publishes on its own site — it is not a benefits check and never
 * promises a plan will be covered.
 */
const INSURANCE_DISCLAIMER =
  '<p class="landing-note"><strong>About these insurance listings:</strong> ' +
  'this page reflects what each provider lists on its own website, recorded on the date shown. ' +
  'It is not a benefits check and does not mean a specific plan will be accepted or covered. ' +
  'Confirm coverage, network status, and out-of-pocket cost directly with the program and with your plan before intake.</p>';

function renderNoteHtml(page) {
  if (page.kind === 'insurance') return INSURANCE_DISCLAIMER;
  if (page.kind === 'virtual') {
    return (
      '<p class="landing-note">Virtual delivery is recorded from each provider\'s own website. ' +
      'Availability, the states a program can serve, and whether a first appointment must happen in person ' +
      'all change — confirm with the program directly.</p>'
    );
  }
  return (
    '<p class="landing-note">City reflects the address each provider publishes. ' +
    'Some programs also serve surrounding communities or offer virtual sessions — ' +
    'the searchable directory covers a wider area than a single city page.</p>'
  );
}

/** Sibling + parent links, so every landing page has crawl paths of its own. */
function renderSiblingsHtml(page, allPages) {
  const groups = [];

  if (page.kind === 'city' || page.kind === 'insurance') {
    const sameCare = allPages.filter((p) => p.hubPath === page.hubPath && p.slug !== page.slug);
    const cities = sameCare.filter((p) => p.kind === 'city');
    const insurance = sameCare.filter((p) => p.kind === 'insurance');
    if (cities.length > 0) {
      groups.push(
        `<p class="hub-links">${escapeHtml(page.careShort)} by city: ` +
          cities.map((p) => `<a href="${p.path}">${escapeHtml(p.city)}</a>`).join(' · ') +
          '</p>'
      );
    }
    if (insurance.length > 0) {
      groups.push(
        `<p class="hub-links">${escapeHtml(page.careShort)} by insurance listing: ` +
          insurance.map((p) => `<a href="${p.path}">${escapeHtml(p.insuranceLabel)}</a>`).join(' · ') +
          '</p>'
      );
    }
    const hub = HUB_PAGES.find((h) => h.path === page.hubPath);
    if (hub) {
      groups.push(
        `<p class="hub-links">All ${escapeHtml(page.careShort)} listings: <a href="${hub.path}">${escapeHtml(hub.breadcrumbName)}</a></p>`
      );
    }
  }

  const otherCare = allPages.filter(
    (p) => (p.kind === 'city' || p.kind === 'insurance') && p.hubPath !== page.hubPath
  );
  if (page.kind === 'virtual' && otherCare.length > 0) {
    const byCity = otherCare.filter((p) => p.kind === 'city');
    const byInsurance = otherCare.filter((p) => p.kind === 'insurance');
    if (byCity.length > 0) {
      groups.push(
        '<p class="hub-links">Programs by city: ' +
          byCity
            .map((p) => `<a href="${p.path}">${escapeHtml(`${p.careShort} ${p.city}`)}</a>`)
            .join(' · ') +
          '</p>'
      );
    }
    if (byInsurance.length > 0) {
      groups.push(
        '<p class="hub-links">Programs by insurance listing: ' +
          byInsurance
            .map((p) => `<a href="${p.path}">${escapeHtml(`${p.careShort} ${p.insuranceLabel}`)}</a>`)
            .join(' · ') +
          '</p>'
      );
    }
  }

  const virtual = allPages.find((p) => p.kind === 'virtual');
  if (virtual && virtual.slug !== page.slug) {
    groups.push(`<p class="hub-links"><a href="${virtual.path}">Virtual and telehealth programs</a></p>`);
  }

  return groups.join('\n      ');
}

/**
 * Cross-link block injected into the level-of-care hubs and /directory at the
 * vmhr-landing-links marker, so every landing page is reachable by following
 * links from the home page — not only from the sitemap.
 *
 * `hubPath` null renders the full index (used on /directory); otherwise only
 * that hub's own landing pages plus the virtual page.
 */
export function buildLandingLinksHtml(allPages, hubPath) {
  const blocks = [];
  const scoped = hubPath ? allPages.filter((p) => p.hubPath === hubPath) : allPages;

  if (hubPath) {
    const cities = scoped.filter((p) => p.kind === 'city');
    const insurance = scoped.filter((p) => p.kind === 'insurance');
    if (cities.length > 0) {
      blocks.push(
        `<p class="hub-links">${escapeHtml(cities[0].careShort)} by city: ` +
          cities.map((p) => `<a href="${p.path}">${escapeHtml(p.city)}</a>`).join(' · ') +
          '</p>'
      );
    }
    if (insurance.length > 0) {
      blocks.push(
        `<p class="hub-links">${escapeHtml(insurance[0].careShort)} by insurance listing: ` +
          insurance.map((p) => `<a href="${p.path}">${escapeHtml(p.insuranceLabel)}</a>`).join(' · ') +
          '</p>'
      );
    }
  } else {
    for (const care of LANDING_CARE_LEVELS) {
      const cities = allPages.filter((p) => p.kind === 'city' && p.hubPath === care.hubPath);
      const insurance = allPages.filter((p) => p.kind === 'insurance' && p.hubPath === care.hubPath);
      if (cities.length > 0) {
        blocks.push(
          `<p class="hub-links">${escapeHtml(care.short)} by city: ` +
            cities.map((p) => `<a href="${p.path}">${escapeHtml(p.city)}</a>`).join(' · ') +
            '</p>'
        );
      }
      if (insurance.length > 0) {
        blocks.push(
          `<p class="hub-links">${escapeHtml(care.short)} by insurance listing: ` +
            insurance.map((p) => `<a href="${p.path}">${escapeHtml(p.insuranceLabel)}</a>`).join(' · ') +
            '</p>'
        );
      }
    }
  }

  const virtual = allPages.find((p) => p.kind === 'virtual');
  if (virtual) {
    blocks.push(`<p class="hub-links"><a href="${virtual.path}">Virtual and telehealth programs</a></p>`);
  }

  if (blocks.length === 0) return '';
  return `<div class="landing-links-block">\n      <h2>Focused listings</h2>\n      ${blocks.join('\n      ')}\n    </div>`;
}

// --- Template filling -------------------------------------------------------

const KNOWN_TITLE = '<title>Landing page template • ViableMHR</title>';
const KNOWN_DESCRIPTION =
  '<meta name="description" content="Build-time template for ViableMHR programmatic landing pages.">';
const KNOWN_CANONICAL = '<link rel="canonical" href="https://viablemhr.com/landing">';
const KNOWN_OG_TITLE = '<meta property="og:title" content="Landing page template • ViableMHR">';
const KNOWN_OG_DESCRIPTION =
  '<meta property="og:description" content="Build-time template for ViableMHR programmatic landing pages.">';
const KNOWN_OG_URL = '<meta property="og:url" content="https://viablemhr.com/landing">';

const MARKERS = {
  listJsonLd: '<!--vmhr-list-jsonld-->',
  breadcrumbJsonLd: '<!--vmhr-landing-breadcrumb-jsonld-->',
  crumbs: '<!--vmhr-landing-crumbs-->',
  h1: '<!--vmhr-landing-h1-->',
  intro: '<!--vmhr-landing-intro-->',
  list: '<!--vmhr-landing-list-->',
  note: '<!--vmhr-landing-note-->',
  siblings: '<!--vmhr-landing-siblings-->',
};

/** Replaces the first (and only expected) occurrence of `needle`; throws if absent. */
function mustReplace(html, needle, replacement, label) {
  if (!html.includes(needle)) {
    throw new Error(
      `generate-landing-pages: expected to find ${label} in dist/${LANDING_TEMPLATE_DEST} but it was missing`
    );
  }
  // Function replacement so a literal $&/$'/$` in data-derived `replacement`
  // can never be interpreted by String.replace's special-pattern substitution.
  return html.replace(needle, () => replacement);
}

/** Escapes `<` so an embedded "</script" can never close the JSON-LD block. */
function jsonLdText(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/**
 * Renders one landing page from the shared template.
 *
 * `buildItemList` is injected rather than imported so this module does not
 * import generate-program-pages.js while that module imports this one.
 */
export function renderLandingPage(templateSource, page, allPages, buildItemList) {
  let html = templateSource;
  const titleTag = `${page.title} • ViableMHR`;

  html = mustReplace(html, KNOWN_TITLE, `<title>${escapeHtml(titleTag)}</title>`, 'the <title> tag');
  html = mustReplace(
    html,
    KNOWN_DESCRIPTION,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    'the meta description tag'
  );
  html = mustReplace(
    html,
    KNOWN_CANONICAL,
    `<link rel="canonical" href="${page.url}">`,
    'the canonical link tag'
  );
  html = mustReplace(
    html,
    KNOWN_OG_TITLE,
    `<meta property="og:title" content="${escapeHtml(titleTag)}">`,
    'the og:title tag'
  );
  html = mustReplace(
    html,
    KNOWN_OG_DESCRIPTION,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    'the og:description tag'
  );
  html = mustReplace(
    html,
    KNOWN_OG_URL,
    `<meta property="og:url" content="${page.url}">`,
    'the og:url tag'
  );

  html = mustReplace(
    html,
    MARKERS.listJsonLd,
    `<script type="application/ld+json" id="list-jsonld">${buildItemList(page.entries, page.listName, page.url)}</script>`,
    'the vmhr-list-jsonld marker'
  );
  html = mustReplace(
    html,
    MARKERS.breadcrumbJsonLd,
    `<script type="application/ld+json" id="landing-breadcrumb-jsonld">${jsonLdText(buildLandingBreadcrumbLd(page))}</script>`,
    'the vmhr-landing-breadcrumb-jsonld marker'
  );
  html = mustReplace(html, MARKERS.crumbs, renderCrumbsHtml(page), 'the vmhr-landing-crumbs marker');
  html = mustReplace(html, MARKERS.h1, escapeHtml(page.h1), 'the vmhr-landing-h1 marker');
  html = mustReplace(html, MARKERS.intro, renderIntroHtml(page), 'the vmhr-landing-intro marker');
  html = mustReplace(
    html,
    MARKERS.list,
    buildLandingListHtml(page.entries),
    'the vmhr-landing-list marker'
  );
  html = mustReplace(html, MARKERS.note, renderNoteHtml(page), 'the vmhr-landing-note marker');
  html = mustReplace(
    html,
    MARKERS.siblings,
    renderSiblingsHtml(page, allPages),
    'the vmhr-landing-siblings marker'
  );

  return html;
}

/**
 * Writes every qualifying landing page into dist/ and removes the template
 * that produced them (dist/landing.html is a build artifact, never a page —
 * leaving it would ship an indexable placeholder with template copy).
 *
 * Returns the page descriptors so the caller can fold them into
 * dist/sitemap-pages.xml.
 */
export function generateLandingPages({ root, programs, buildItemList }) {
  const templatePath = join(root, 'dist', LANDING_TEMPLATE_DEST);
  if (!existsSync(templatePath)) {
    throw new Error(
      `generate-landing-pages: dist/${LANDING_TEMPLATE_DEST} missing; cannot generate landing pages`
    );
  }
  const templateSource = readFileSync(templatePath, 'utf8');
  const pages = computeLandingPages(programs);

  for (const page of pages) {
    const html = renderLandingPage(templateSource, page, pages, buildItemList);
    writeFileSync(join(root, 'dist', page.file), html, 'utf8');
  }

  unlinkSync(templatePath);
  return pages;
}
