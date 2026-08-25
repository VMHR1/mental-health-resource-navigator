/**
 * Build-side renderer for program detail pages.
 *
 * Mirrors the client-side rendering in src/js/program-detail.js
 * (renderProgramDetail / injectSeoMeta / findRelatedPrograms) so that
 * dist/programs/{id}.html ships full, unique, crawlable HTML instead of
 * an empty loading shell. A later PR makes the client JS skip
 * re-rendering when it sees data-prerendered="true" on the root element.
 *
 * NOTE: src/js/utils/helpers.js's safeUrl() dereferences window.location
 * unguarded, so it cannot be imported here — safeHttpUrl() below is a
 * Node-safe local equivalent used in its place. programPublicPath() ships
 * the extensionless Cloudflare Pretty URL form and is imported directly
 * from helpers.js since the signatures match exactly.
 */
import {
  safeStr,
  escapeHtml,
  locLabel,
  getVerificationFreshness,
  normalizePhoneForTel,
  hasVirtual,
  mapsLinkFor,
  newTabAccessibleLabel,
  programPublicPath,
} from '../src/js/utils/helpers.js';
import { hubForCareLevel, DIRECTORY_PAGE } from './hub-config.js';

const SITE_BASE = 'https://viablemhr.com';

/** Extensionless canonical URL for a program (Cloudflare Pretty URLs 308 /programs/x.html -> /programs/x). */
export function programCanonicalUrl(id) {
  return `${SITE_BASE}/programs/${encodeURIComponent(id)}`;
}

/** Node-safe replacement for the window-bound safeUrl() in helpers.js: http/https only. */
function safeHttpUrl(u) {
  const s = safeStr(u);
  if (!s) return '';
  try {
    const parsed = new URL(s);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (_) {
    /* ignore */
  }
  return '';
}

/** Same shape check as program-detail.js's safeMapsHref — only allow Google Maps search links. */
function safeMapsHref(mapsUrl) {
  const s = safeStr(mapsUrl);
  if (!s.startsWith('https://www.google.com/maps/')) return '';
  try {
    const u = new URL(s);
    if (u.protocol === 'https:') return u.href;
  } catch (_) {
    /* ignore */
  }
  return '';
}

// programPublicPath is imported from helpers.js above and re-exported here
// for scripts/generate-program-pages.js, which imports it from this module.
export { programPublicPath };

/**
 * Related programs by shared location/level-of-care/organization.
 * Ported verbatim (logic-wise) from src/js/program-detail.js:105-127 — computable
 * at build time since it only needs the full program list.
 */
export function findRelatedPrograms(program, allPrograms, limit = 3) {
  if (!program) return [];
  const programs = Array.isArray(allPrograms) ? allPrograms : [];

  const related = programs
    .filter((p) => {
      if (p.program_id === program.program_id) return false;

      const sameLocation = p.locations && program.locations &&
        p.locations.some((loc1) =>
          program.locations.some((loc2) =>
            loc1.city === loc2.city && loc1.state === loc2.state
          )
        );

      const sameCare = p.level_of_care === program.level_of_care;
      const sameOrg = p.organization === program.organization;

      return sameLocation || sameCare || sameOrg;
    })
    .slice(0, limit);

  return related;
}

/**
 * Best-known last-verified date for a program, used both for freshness
 * display and for sitemap <lastmod>. Priority: last_verified >
 * accepted_insurance.last_verified > verification.last_verified_at.
 */
export function bestLastVerified(program) {
  const candidates = [
    safeStr(program.last_verified),
    safeStr(program.accepted_insurance && program.accepted_insurance.last_verified),
    safeStr(program.verification && program.verification.last_verified_at),
  ].filter(Boolean);
  for (const c of candidates) {
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return c;
  }
  return '';
}

/**
 * Composes a disambiguating "name — organization, city" label from existing
 * fields only (program_name is a level-of-care label in this dataset, e.g.
 * "IOP" or "Day Treatment / PHP", so 112 programs yield only 23 distinct
 * program_name values on their own — see C1). Segments whose backing field
 * is absent/empty are omitted; nothing is invented. Verified 112/112 distinct
 * across public/data/programs.json when name+organization+city are combined.
 */
function composeDisambiguatedName(program) {
  const name = safeStr(program.program_name);
  const org = safeStr(program.organization);
  const locs = Array.isArray(program.locations) ? program.locations : [];
  const city = safeStr(locs[0] && locs[0].city);

  const parts = [name];
  const tail = [org, city].filter(Boolean).join(', ');
  if (tail) parts.push(tail);
  return parts.filter(Boolean).join(' — ');
}

/**
 * Cities that are placeholders for "no street location", not real localities.
 * `public/data/programs.json` uses `Virtual` (5 rows), `Multiple` (5 rows) and
 * `National` (3 rows) this way, always with empty `address`/`zip` — verified
 * with a scan of the file. Emitting them as schema.org PostalAddress
 * addressLocality would assert a city that does not exist, so they are skipped
 * for structured data and rendered as prose in the meta description instead.
 */
const PSEUDO_LOCATION_CITIES = new Set(['Virtual', 'Multiple', 'National']);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "2026-05-18" -> "May 2026". Parsed off the string rather than through
 * `new Date()` so a UTC-midnight timestamp cannot roll back to the previous
 * month when the build runs in America/Chicago.
 */
export function formatVerifiedMonth(dateStr) {
  const s = safeStr(dateStr);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return '';
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return '';
  return `${MONTH_NAMES[monthIdx]} ${m[1]}`;
}

/** Real (non-pseudo) locations, i.e. the ones that can become a PostalAddress. */
function realLocations(program) {
  const locs = Array.isArray(program.locations) ? program.locations : [];
  return locs.filter((l) => {
    const city = safeStr(l && l.city);
    if (!city) return Boolean(safeStr(l && l.address));
    return !PSEUDO_LOCATION_CITIES.has(city);
  });
}

/**
 * Short, human-readable insurance categories for the meta description.
 *
 * Deliberately NOT `insurance_notes`, which is a pipe-delimited operator note
 * ("Plans: ... | Types: ... | ...") that reads as machine output in a search
 * snippet. `accepted_insurance.types` is the structured field behind it; the
 * parenthetical qualifiers ("(many)", "(varies by plan/service area)") are
 * stripped because they cannot be defended inside a 160-character snippet, and
 * the result is deduped since several rows normalize to the same category.
 * 29 of 112 programs have no `types` — those simply get no insurance clause.
 */
export function insuranceCategories(program) {
  const types = (program.accepted_insurance && Array.isArray(program.accepted_insurance.types))
    ? program.accepted_insurance.types
    : [];
  const out = [];
  for (const raw of types) {
    const cleaned = safeStr(raw)
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+plans$/i, '')
      .trim();
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
  }
  return out;
}

/** Where the program is, in prose, for the meta description. */
function placeClause(program) {
  const real = realLocations(program);
  const first = real[0];
  if (first) {
    const city = safeStr(first.city);
    const state = safeStr(first.state);
    if (city && state) return `in ${city}, ${state}`;
    if (city) return `in ${city}`;
  }
  const locs = Array.isArray(program.locations) ? program.locations : [];
  const pseudoCities = locs.map((l) => safeStr(l && l.city));
  if (pseudoCities.includes('Virtual') || hasVirtual(program)) return 'online across Texas';
  if (pseudoCities.includes('Multiple')) return 'across multiple Texas locations';
  if (pseudoCities.includes('National')) return 'nationally';
  return '';
}

/**
 * Meta description built from the facts a family matches on — level of care,
 * ages served, city — then a short insurance summary, closing with the
 * verification month. Replaces the previous
 * `${name} — ${insurance_notes.slice(0,300)}`, which spent the whole snippet
 * on pipe-delimited operator notes and buried the match facts.
 *
 * `TARGET_LEN` (160) is the length Google typically renders before truncating;
 * the insurance clause is the only elastic part, so it is trimmed category by
 * category to fit and dropped entirely if even one category will not. The
 * "Verified {Month YYYY}" tail is never sacrificed — it is the differentiator.
 * `HARD_CAP` (300) is a last-resort clamp; nothing in the current data comes
 * near it.
 */
export function composeMetaDescription(program) {
  const TARGET_LEN = 160;
  const HARD_CAP = 300;

  const care = safeStr(program.level_of_care);
  const lead = care || safeStr(program.program_name) || 'Youth mental health program';

  const parts = [lead];
  // The organization is what makes the sentence specific: without it the five
  // "Mobile Crisis / all ages / multiple Texas locations" rows share one
  // description verbatim, which is exactly the duplicate-snippet problem the
  // old `${disambiguatedName} — ...` form avoided. Care level still leads.
  const org = safeStr(program.organization);
  if (org) parts.push(`at ${org}`);
  const ages = safeStr(program.ages_served);
  if (ages && ages.toLowerCase() !== 'unknown') {
    // "13-17" -> "for ages 13-17"; "All ages" -> "serving all ages". Prefixing
    // a non-numeric value with "for ages" produces "for ages All ages". The
    // leading capital is only dropped when the rest of the value has no other
    // capitals, so a title-cased value ("Child & Adolescent") is left alone
    // rather than becoming "child & Adolescent".
    const phrase = /[A-Z]/.test(ages.slice(1)) ? ages : `${ages.charAt(0).toLowerCase()}${ages.slice(1)}`;
    parts.push(/^\d/.test(ages) ? `for ages ${ages}` : `serving ${phrase}`);
  }
  const place = placeClause(program);
  if (place) parts.push(place);
  const head = `${parts.join(' ')}.`;

  const verifiedMonth = formatVerifiedMonth(bestLastVerified(program));
  const tail = verifiedMonth ? ` Verified ${verifiedMonth}.` : '';

  let insurance = '';
  const categories = insuranceCategories(program);
  if (categories.length) {
    const budget = TARGET_LEN - head.length - tail.length;
    const kept = [];
    for (const c of categories) {
      const candidate = ` Insurance: ${[...kept, c].join(', ')}.`;
      if (candidate.length > budget) break;
      kept.push(c);
    }
    if (kept.length) insurance = ` Insurance: ${kept.join(', ')}.`;
  }

  return `${head}${insurance}${tail}`.slice(0, HARD_CAP);
}

/** schema.org PostalAddress for one real location, with empty fields dropped. */
function postalAddress(loc) {
  const addr = {
    '@type': 'PostalAddress',
    streetAddress: safeStr(loc.address) || undefined,
    addressLocality: safeStr(loc.city) || undefined,
    addressRegion: safeStr(loc.state) || undefined,
    postalCode: safeStr(loc.zip) || undefined,
  };
  Object.keys(addr).forEach((k) => {
    if (addr[k] === undefined) delete addr[k];
  });
  return addr;
}

/**
 * BreadcrumbList for a program page: Home -> the hub that lists this level of
 * care (or /directory when the level of care has no hub) -> this program.
 * Emitted as its own <script> block rather than joined with the program object
 * into an array, because scripts/validate-jsonld.js rejects a top-level array.
 */
export function buildBreadcrumbLd(program, pageUrl, programCrumbName) {
  const hub = hubForCareLevel(safeStr(program.level_of_care));
  const mid = hub || DIRECTORY_PAGE;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_BASE}/` },
      { '@type': 'ListItem', position: 2, name: mid.breadcrumbName, item: `${SITE_BASE}${mid.path}` },
      { '@type': 'ListItem', position: 3, name: programCrumbName, item: pageUrl },
    ],
  };
}

/** JSON.stringify with `<` escaped so no data value can close the script tag. */
function jsonLdText(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/**
 * Renders the unique per-program <head> fragment: title, meta description,
 * canonical, og:title/og:description/og:url, and two JSON-LD blocks
 * (MedicalClinic + BreadcrumbList).
 */
export function renderProgramHead(program) {
  const pid = safeStr(program.program_id);
  const pageUrl = programCanonicalUrl(pid);
  const name = safeStr(program.program_name);
  const disambiguatedName = composeDisambiguatedName(program);
  const title = `${escapeHtml(disambiguatedName)} • ViableMHR`;

  const metaDescription = composeMetaDescription(program);
  const metaDescriptionEsc = escapeHtml(metaDescription);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MedicalClinic',
    name: name || undefined,
    url: pageUrl,
    medicalSpecialty: 'Psychiatry',
  };
  const note = safeStr(program.insurance_notes || program.notes);
  if (note) ld.description = note.slice(0, 500);
  const org = safeStr(program.organization);
  if (org) ld.parentOrganization = { '@type': 'Organization', name: org };
  const phone = safeStr(program.phone);
  if (phone) ld.telephone = phone;

  // Every real location, not just locations[0] — a multi-site program was
  // previously advertising only its first address to crawlers.
  const addresses = realLocations(program)
    .map(postalAddress)
    .filter((a) => Object.keys(a).length > 1);
  if (addresses.length) ld.address = addresses;

  const lastVerified = bestLastVerified(program);
  if (lastVerified) ld.dateModified = lastVerified;

  Object.keys(ld).forEach((k) => {
    if (ld[k] === undefined) delete ld[k];
  });

  const jsonLd = jsonLdText(ld);
  const breadcrumbLd = jsonLdText(buildBreadcrumbLd(program, pageUrl, disambiguatedName));

  // pageUrl is code-built (SITE_BASE + encodeURIComponent(pid)) from a program_id
  // already gated by /^[a-z0-9_-]+$/i in generate-program-pages.js, not
  // data-derived free text — escapeHtml() would needlessly entity-encode its
  // slashes (&#x2F;) and colon, so it is emitted raw here (see I4).
  return {
    title,
    metaDescriptionEsc,
    canonicalHref: pageUrl,
    ogTitle: title,
    ogDescription: metaDescriptionEsc,
    ogUrl: pageUrl,
    headHtml: [
      `<link rel="canonical" href="${pageUrl}">`,
      `<script type="application/ld+json" id="program-jsonld">${jsonLd}</script>`,
      `<script type="application/ld+json" id="program-breadcrumb-jsonld">${breadcrumbLd}</script>`,
    ].join('\n  '),
  };
}

function section(titleText, innerHtml) {
  return `<div class="program-detail-section">
      <h2>${escapeHtml(titleText)}</h2>
      ${innerHtml}
    </div>`;
}

function gridRow(labelText, valueHtml) {
  return `<div class="program-detail-label">${escapeHtml(labelText)}</div>
        <div class="program-detail-value">${valueHtml}</div>`;
}

function renderRelatedCard(p) {
  const name = escapeHtml(safeStr(p.program_name) || 'Program');
  const org = escapeHtml(safeStr(p.organization) || '');
  const care = escapeHtml(safeStr(p.level_of_care) || 'Unknown');
  const loc = escapeHtml(locLabel(p));
  const idEnc = encodeURIComponent(p.program_id || '');
  // programPublicPath() only ever emits `/programs/{id}` where id already
  // passed the `/^[a-z0-9_-]+$/i` filter (findRelatedPrograms only returns
  // programs sourced from the same validated build-time list), so it is
  // already attribute-safe; escapeHtml() would HTML-entity-encode its
  // slashes (&#x2F;) which is harmless to browsers but breaks plain-text
  // link audits expecting literal href="/programs/...". See buildDirectoryListHtml
  // in scripts/generate-program-pages.js for the identical reasoning.
  const detailHref = programPublicPath(p.program_id || '');
  return `<div class="card">
          <div class="cardTop">
            <div>
              <h3 class="pname">${name}</h3>
              <p class="org">${org}</p>
            </div>
          </div>
          <div class="badgeRow">
            <span class="badge">${care}</span>
            <span class="badge loc">${loc}</span>
          </div>
          <div class="actions" style="margin-top: 12px;">
            <a href="${detailHref}" class="linkBtn primary">View Details</a>
            <a href="index.html?program=${idEnc}" class="linkBtn">View in Search</a>
          </div>
        </div>`;
}

/**
 * Renders the full program detail article, mirroring renderProgramDetail's
 * DOM structure/classes (src/js/program-detail.js:191-497) so existing CSS
 * applies unchanged. Root element carries data-prerendered="true" and
 * data-last-verified so a later client-side patch can skip re-rendering.
 */
export function renderProgramBody(program, allPrograms) {
  if (!program) {
    return `<div class="empty-state">
        <div class="empty-icon" aria-hidden="true">❌</div>
        <h1>Program not found</h1>
        <p>The program you're looking for doesn't exist or has been removed.</p>
        <a href="index.html" class="btn-primary" style="display: inline-block; margin-top: 16px;">Back to Search</a>
      </div>`;
  }

  const name = safeStr(program.program_name) || 'Program';
  const org = safeStr(program.organization) || '';
  const careLabel = safeStr(program.level_of_care) || 'Unknown';
  const location = locLabel(program);

  const addresses = (Array.isArray(program.locations) ? program.locations : [])
    .filter((l) => safeStr(l.address))
    .map((l) => [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean).join(', '))
    .filter(Boolean);

  const phone = safeStr(program.phone);
  const phoneDigits = phone ? normalizePhoneForTel(phone) : '';
  const looksLikeShortcode = phoneDigits && phoneDigits.length <= 6;
  const mentionsText = /text/i.test(phone);
  const isCrisisTextLine = safeStr(program.program_id) === 'crisis-textline-741741';

  let phoneHref = '';
  if (phoneDigits) {
    phoneHref = (looksLikeShortcode || mentionsText || isCrisisTextLine)
      ? `sms:${phoneDigits}`
      : `tel:${phoneDigits}`;
  }

  const mapsRaw = mapsLinkFor(program);
  const mapsHref = safeMapsHref(mapsRaw);
  const website = safeHttpUrl(program.website_url || program.website || '');

  const relatedPrograms = findRelatedPrograms(program, allPrograms, 3);

  const badgesHtml = [
    `<span class="badge">${escapeHtml(careLabel)}</span>`,
    `<span class="badge loc">${escapeHtml(location)}</span>`,
    hasVirtual(program) ? `<span class="badge loc2">Virtual option</span>` : '',
  ].filter(Boolean).join('\n      ');

  const headerHtml = `<div class="program-detail-header">
      <h1 class="program-detail-title">${escapeHtml(name)}</h1>
      <p class="program-detail-org">${escapeHtml(org)}</p>
      <div class="program-detail-badges">
      ${badgesHtml}
      </div>
    </div>`;

  const infoGrid = [
    gridRow('Level of Care', escapeHtml(safeStr(program.level_of_care) || 'Unknown')),
    gridRow('Service Setting', escapeHtml(safeStr(program.service_setting) || 'Unknown')),
    gridRow('Ages Served', escapeHtml(safeStr(program.ages_served) || 'Unknown')),
    gridRow('Entry Type', escapeHtml(safeStr(program.entry_type) || 'Unknown')),
  ].join('\n      ');
  const infoSectionHtml = section('Program Information', `<div class="program-detail-grid">
      ${infoGrid}
      </div>`);

  let locationSectionHtml = '';
  if (addresses.length > 0) {
    const dirLinkHtml = mapsHref
      ? `<a href="${escapeHtml(mapsHref)}" target="_blank" rel="noopener noreferrer" class="linkBtn" aria-label="${escapeHtml(newTabAccessibleLabel('Get Directions'))}" style="margin-top: 8px; display: inline-block;">Get Directions</a>`
      : '';
    const blocks = addresses
      .map(
        (addr) => `<div style="margin-bottom: 12px;">
        <div class="program-detail-value">${escapeHtml(addr)}</div>
        ${dirLinkHtml}
      </div>`
      )
      .join('\n      ');
    locationSectionHtml = section(addresses.length > 1 ? 'Locations' : 'Location', blocks);
  }

  const contactRows = [];
  if (phone) {
    const phoneValueHtml = phoneHref
      ? `<a href="${escapeHtml(phoneHref)}" class="linkBtn primary">${escapeHtml(phone)}</a>`
      : escapeHtml(phone);
    contactRows.push(gridRow('Phone', phoneValueHtml));
  }
  if (website) {
    const siteHtml = `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" class="siteLink" aria-label="${escapeHtml(newTabAccessibleLabel('Visit website'))}">Visit website <span aria-hidden="true">↗</span></a>`;
    contactRows.push(gridRow('Website', siteHtml));
  }
  const contactSectionHtml = section('Contact Information', `<div class="program-detail-grid">
      ${contactRows.join('\n      ')}
      </div>`);

  const accessRows = [
    gridRow('Insurance', escapeHtml(safeStr(program.insurance_notes) || 'Unknown')),
    gridRow('Transportation', escapeHtml(safeStr(program.transportation_available) || 'Unknown')),
  ];
  if (program.accepting_new_patients) {
    accessRows.push(gridRow('Accepting Patients', escapeHtml(safeStr(program.accepting_new_patients))));
  }
  if (program.waitlist_status) {
    accessRows.push(gridRow('Waitlist', escapeHtml(safeStr(program.waitlist_status))));
  }
  const accessSectionHtml = section('Insurance & Access', `<div class="program-detail-grid">
      ${accessRows.join('\n      ')}
      </div>`);

  let notesSectionHtml = '';
  if (program.notes) {
    notesSectionHtml = section('Additional Notes', `<div class="program-detail-value">${escapeHtml(safeStr(program.notes))}</div>`);
  }

  let verificationSectionHtml = '';
  if (program.verification_source || program.last_verified) {
    let verText = '';
    if (program.verification_source) {
      verText += `Source: ${safeStr(program.verification_source)}`;
    }
    if (program.verification_source && program.last_verified) {
      verText += ' • ';
    }
    if (program.last_verified) {
      verText += `Last verified: ${safeStr(program.last_verified)}`;
    }

    const freshness = getVerificationFreshness(bestLastVerified(program));
    const staleHtml = freshness === 'stale'
      ? `<p class="program-detail-stale-note">This listing was last verified more than 90 days ago. Call the program to confirm details are still accurate.</p>`
      : '';

    verificationSectionHtml = section(
      'Verification',
      `${staleHtml}
      <div class="program-detail-value" style="font-size: 13px; color: var(--muted);">${escapeHtml(verText)}</div>
      <p style="font-size: 13px; margin-top: 10px; line-height: 1.55; color: var(--muted);">Verified means we confirmed listing details against a source on the date shown—not a quality rating or clinical endorsement. <a href="../about.html#verification">What verified means</a>. Always call the program to confirm current availability.</p>`
    );
  }

  let relatedSectionHtml = '';
  if (relatedPrograms.length > 0) {
    const cards = relatedPrograms.map(renderRelatedCard).join('\n      ');
    relatedSectionHtml = `<div class="related-programs">
      <h2 style="font-size: 22px; margin-bottom: 16px;">Related Programs</h2>
      <div class="related-programs-grid">
      ${cards}
      </div>
    </div>`;
  }

  const lastVerified = bestLastVerified(program);

  return `<div data-prerendered="true" data-last-verified="${escapeHtml(lastVerified)}">
    ${headerHtml}
    ${infoSectionHtml}
    ${locationSectionHtml}
    ${contactSectionHtml}
    ${accessSectionHtml}
    ${notesSectionHtml}
    ${verificationSectionHtml}
    ${relatedSectionHtml}
    </div>`;
}
