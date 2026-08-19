// ========== Program Detail Page ==========

let programs = [];
let currentProgram = null;

async function loadPrograms() {
  try {
    let jsonUrl = '/programs.json';
    if (window.location.protocol === 'file:') {
      jsonUrl = new URL('../programs.json', window.location.href).href;
    }
    const res = await fetch(jsonUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load programs');
    const data = await res.json();
    programs = data.programs || [];
    return programs;
  } catch (error) {
    console.error('Error loading programs:', error);
    return [];
  }
}

function getProgramIdFromLocation() {
  if (typeof window.__ViableMHRProgramId === 'string' && window.__ViableMHRProgramId.trim()) {
    return window.__ViableMHRProgramId.trim();
  }
  const params = new URLSearchParams(window.location.search);
  const q = params.get('id');
  if (q) return q.trim();
  const path = window.location.pathname || '';
  const m = path.match(/\/programs\/([^/]+)\.html$/i);
  if (m) return decodeURIComponent(m[1]);
  return '';
}

function injectSeoMeta(program) {
  const safeStr = window.safeStr || ((x) => (x ?? '').toString().trim());
  const pid = safeStr(program.program_id);
  if (!pid) return;
  const base = 'https://viablemhr.com';
  const pageUrl = `${base}/programs/${encodeURIComponent(pid)}`;

  let canon = document.querySelector('link[rel="canonical"]');
  if (!canon) {
    canon = document.createElement('link');
    canon.rel = 'canonical';
    document.head.appendChild(canon);
  }
  canon.href = pageUrl;

  const desc = safeStr(program.insurance_notes || program.notes || program.level_of_care).slice(0, 300);
  let metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && desc) metaDesc.setAttribute('content', `${safeStr(program.program_name)} — ${desc}`);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MedicalOrganization',
    name: safeStr(program.program_name) || undefined,
    url: pageUrl,
  };
  const note = safeStr(program.insurance_notes || program.notes);
  if (note) ld.description = note.slice(0, 500);
  const phone = safeStr(program.phone);
  if (phone) ld.telephone = phone;
  const locs = Array.isArray(program.locations) ? program.locations : [];
  const addr = locs[0] || {};
  if (addr && (safeStr(addr.address) || safeStr(addr.city))) {
    ld.address = {
      '@type': 'PostalAddress',
      streetAddress: safeStr(addr.address) || undefined,
      addressLocality: safeStr(addr.city) || undefined,
      addressRegion: safeStr(addr.state) || undefined,
      postalCode: safeStr(addr.zip) || undefined,
    };
  }
  Object.keys(ld).forEach((k) => {
    if (ld[k] === undefined) delete ld[k];
  });
  if (ld.address) {
    Object.keys(ld.address).forEach((k) => {
      if (ld.address[k] === undefined) delete ld.address[k];
    });
    if (Object.keys(ld.address).length === 0) delete ld.address;
  }

  let el = document.getElementById('program-jsonld');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'program-jsonld';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(ld);
}

function findProgramById(programId) {
  return programs.find((p) => {
    if (p.program_id === programId) return true;
    const stableId = window.stableIdFor ? window.stableIdFor(p, programs.indexOf(p)) : null;
    if (stableId === programId) return true;
    return false;
  });
}

function findRelatedPrograms(program, limit = 3) {
  if (!program) return [];

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

function renderEmptyState(root, { icon, title, message }) {
  root.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';

  const iconEl = document.createElement('div');
  iconEl.className = 'empty-icon';
  iconEl.textContent = icon;

  const heading = document.createElement('h1');
  heading.textContent = title;

  const p = document.createElement('p');
  p.textContent = message;

  const back = document.createElement('a');
  back.href = 'index.html';
  back.className = 'btn-primary';
  back.style.display = 'inline-block';
  back.style.marginTop = '16px';
  back.textContent = 'Back to Search';

  wrap.append(iconEl, heading, p, back);
  root.appendChild(wrap);
}

function appendSection(container, titleText) {
  const section = document.createElement('div');
  section.className = 'program-detail-section';
  const h2 = document.createElement('h2');
  h2.textContent = titleText;
  section.appendChild(h2);
  container.appendChild(section);
  return section;
}

function appendGridRow(grid, labelText, valueContent) {
  const label = document.createElement('div');
  label.className = 'program-detail-label';
  label.textContent = labelText;

  const value = document.createElement('div');
  value.className = 'program-detail-value';
  if (typeof valueContent === 'string') {
    value.textContent = valueContent;
  } else if (valueContent instanceof Node) {
    value.appendChild(valueContent);
  }

  grid.append(label, value);
}

function safeMapsHref(mapsUrl) {
  const s = (mapsUrl || '').toString().trim();
  if (!s.startsWith('https://www.google.com/maps/')) return '';
  try {
    const u = new URL(s);
    if (u.protocol === 'https:') return u.href;
  } catch (_) { /* ignore */ }
  return '';
}

function renderProgramDetail(program) {
  const root = document.getElementById('programDetail');
  if (!root) return;

  if (!program) {
    renderEmptyState(root, {
      icon: '❌',
      title: 'Program not found',
      message: "The program you're looking for doesn't exist or has been removed."
    });
    return;
  }

  const safeStr = window.safeStr || ((x) => (x ?? '').toString().trim());
  const locLabel = window.locLabel || ((p) => {
    const locs = Array.isArray(p.locations) ? p.locations : [];
    const first = locs[0] || {};
    const city = safeStr(first.city);
    const state = safeStr(first.state);
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    return 'Location not listed';
  });
  const safeUrl = window.safeUrl || ((u) => u || '');
  const normalizePhoneForTel = window.normalizePhoneForTel || ((p) => p.replace(/[^\d]/g, ''));
  const mapsLinkFor = window.mapsLinkFor || ((p) => {
    const addr = window.bestAddress ? window.bestAddress(p) : '';
    if (!addr) return '';
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
  });

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
  let phoneLabel = phone;
  if (phoneDigits) {
    if (looksLikeShortcode || mentionsText || isCrisisTextLine) {
      phoneHref = `sms:${phoneDigits}`;
      phoneLabel = phone;
    } else {
      phoneHref = `tel:${phoneDigits}`;
      phoneLabel = phone;
    }
  }

  const mapsRaw = mapsLinkFor(program);
  const mapsHref = safeMapsHref(mapsRaw);
  const website = safeUrl(program.website_url || program.website || '');

  const relatedPrograms = findRelatedPrograms(program, 3);

  root.replaceChildren();

  const header = document.createElement('div');
  header.className = 'program-detail-header';

  const titleEl = document.createElement('h1');
  titleEl.className = 'program-detail-title';
  titleEl.textContent = safeStr(program.program_name) || 'Program';

  const orgEl = document.createElement('p');
  orgEl.className = 'program-detail-org';
  orgEl.textContent = safeStr(program.organization) || '';

  const badges = document.createElement('div');
  badges.className = 'program-detail-badges';

  const badgeCare = document.createElement('span');
  badgeCare.className = 'badge';
  badgeCare.textContent = safeStr(program.level_of_care) || 'Unknown';

  const badgeLoc = document.createElement('span');
  badgeLoc.className = 'badge loc';
  badgeLoc.textContent = locLabel(program);

  badges.append(badgeCare, badgeLoc);

  if (window.hasVirtual && window.hasVirtual(program)) {
    const badgeVirt = document.createElement('span');
    badgeVirt.className = 'badge loc2';
    badgeVirt.textContent = 'Virtual option';
    badges.appendChild(badgeVirt);
  }

  header.append(titleEl, orgEl, badges);
  root.appendChild(header);

  const infoSection = appendSection(root, 'Program Information');
  const infoGrid = document.createElement('div');
  infoGrid.className = 'program-detail-grid';
  appendGridRow(infoGrid, 'Level of Care', safeStr(program.level_of_care) || 'Unknown');
  appendGridRow(infoGrid, 'Service Setting', safeStr(program.service_setting) || 'Unknown');
  appendGridRow(infoGrid, 'Ages Served', safeStr(program.ages_served) || 'Unknown');
  appendGridRow(infoGrid, 'Entry Type', safeStr(program.entry_type) || 'Unknown');
  infoSection.appendChild(infoGrid);

  if (addresses.length > 0) {
    const locSection = appendSection(root, addresses.length > 1 ? 'Locations' : 'Location');
    addresses.forEach((addr) => {
      const block = document.createElement('div');
      block.style.marginBottom = '12px';

      const addrEl = document.createElement('div');
      addrEl.className = 'program-detail-value';
      addrEl.textContent = addr;
      block.appendChild(addrEl);

      if (mapsHref) {
        const dir = document.createElement('a');
        dir.href = mapsHref;
        dir.target = '_blank';
        dir.rel = 'noopener noreferrer';
        dir.className = 'linkBtn';
        dir.setAttribute('aria-label', typeof window.newTabAccessibleLabel === 'function'
          ? window.newTabAccessibleLabel('Get Directions')
          : 'Get Directions (opens in new tab)');
        dir.style.marginTop = '8px';
        dir.style.display = 'inline-block';
        dir.textContent = 'Get Directions';
        block.appendChild(dir);
      }
      locSection.appendChild(block);
    });
  }

  const contactSection = appendSection(root, 'Contact Information');
  const contactGrid = document.createElement('div');
  contactGrid.className = 'program-detail-grid';

  if (phone) {
    appendGridRow(contactGrid, 'Phone', (() => {
      if (phoneHref) {
        const a = document.createElement('a');
        a.href = phoneHref;
        a.className = 'linkBtn primary';
        a.textContent = phoneLabel;
        return a;
      }
      return phone;
    })());
  }

  if (website) {
    const siteWrap = document.createElement('a');
    siteWrap.href = website;
    siteWrap.target = '_blank';
    siteWrap.rel = 'noopener noreferrer';
    siteWrap.className = 'siteLink';
    siteWrap.setAttribute('aria-label', typeof window.newTabAccessibleLabel === 'function'
      ? window.newTabAccessibleLabel('Visit website')
      : 'Visit website (opens in new tab)');
    siteWrap.textContent = 'Visit website ';
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    siteWrap.appendChild(arrow);
    appendGridRow(contactGrid, 'Website', siteWrap);
  }

  contactSection.appendChild(contactGrid);

  const accessSection = appendSection(root, 'Insurance & Access');
  const accessGrid = document.createElement('div');
  accessGrid.className = 'program-detail-grid';
  appendGridRow(accessGrid, 'Insurance', safeStr(program.insurance_notes) || 'Unknown');
  appendGridRow(accessGrid, 'Transportation', safeStr(program.transportation_available) || 'Unknown');

  if (program.accepting_new_patients) {
    appendGridRow(accessGrid, 'Accepting Patients', safeStr(program.accepting_new_patients));
  }
  if (program.waitlist_status) {
    appendGridRow(accessGrid, 'Waitlist', safeStr(program.waitlist_status));
  }
  accessSection.appendChild(accessGrid);

  if (program.notes) {
    const notesSection = appendSection(root, 'Additional Notes');
    const notesVal = document.createElement('div');
    notesVal.className = 'program-detail-value';
    notesVal.textContent = safeStr(program.notes);
    notesSection.appendChild(notesVal);
  }

  if (program.verification_source || program.last_verified) {
    const verSection = appendSection(root, 'Verification');
    const verVal = document.createElement('div');
    verVal.className = 'program-detail-value';
    verVal.style.fontSize = '13px';
    verVal.style.color = 'var(--muted)';

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
    verVal.textContent = verText;

    const freshness =
      typeof window.getVerificationFreshness === 'function'
        ? window.getVerificationFreshness(program.last_verified)
        : 'missing';
    if (freshness === 'stale') {
      const staleNote = document.createElement('p');
      staleNote.className = 'program-detail-stale-note';
      staleNote.textContent =
        'This listing was last verified more than 90 days ago. Call the program to confirm details are still accurate.';
      verSection.appendChild(staleNote);
    }
    verSection.appendChild(verVal);

    const verNote = document.createElement('p');
    verNote.style.fontSize = '13px';
    verNote.style.marginTop = '10px';
    verNote.style.lineHeight = '1.55';
    verNote.style.color = 'var(--muted)';
    const verLink = document.createElement('a');
    verLink.href = '../about.html#verification';
    verLink.textContent = 'What verified means';
    verNote.appendChild(document.createTextNode('Verified means we confirmed listing details against a source on the date shown—not a quality rating or clinical endorsement. '));
    verNote.appendChild(verLink);
    verNote.appendChild(document.createTextNode('. Always call the program to confirm current availability.'));
    verSection.appendChild(verNote);
  }

  if (relatedPrograms.length > 0) {
    const relatedWrap = document.createElement('div');
    relatedWrap.className = 'related-programs';

    const relatedTitle = document.createElement('h2');
    relatedTitle.style.fontSize = '22px';
    relatedTitle.style.marginBottom = '16px';
    relatedTitle.textContent = 'Related Programs';
    relatedWrap.appendChild(relatedTitle);

    const grid = document.createElement('div');
    grid.className = 'related-programs-grid';

    relatedPrograms.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'card';

      const cardTop = document.createElement('div');
      cardTop.className = 'cardTop';
      const inner = document.createElement('div');
      const pname = document.createElement('h3');
      pname.className = 'pname';
      pname.textContent = safeStr(p.program_name) || 'Program';
      const org = document.createElement('p');
      org.className = 'org';
      org.textContent = safeStr(p.organization) || '';
      inner.append(pname, org);
      cardTop.appendChild(inner);
      card.appendChild(cardTop);

      const badgeRow = document.createElement('div');
      badgeRow.className = 'badgeRow';
      const b1 = document.createElement('span');
      b1.className = 'badge';
      b1.textContent = safeStr(p.level_of_care) || 'Unknown';
      const b2 = document.createElement('span');
      b2.className = 'badge loc';
      b2.textContent = locLabel(p);
      badgeRow.append(b1, b2);
      card.appendChild(badgeRow);

      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.style.marginTop = '12px';

      const idEnc = encodeURIComponent(p.program_id || '');
      const detailLink = document.createElement('a');
      const hrefFn = window.programPublicPath || ((id) => `/programs/${encodeURIComponent(id)}.html`);
      detailLink.href = hrefFn(p.program_id || '');
      detailLink.className = 'linkBtn primary';
      detailLink.textContent = 'View Details';

      const searchLink = document.createElement('a');
      searchLink.href = `index.html?program=${idEnc}`;
      searchLink.className = 'linkBtn';
      searchLink.textContent = 'View in Search';

      actions.append(detailLink, searchLink);
      card.appendChild(actions);
      grid.appendChild(card);
    });

    relatedWrap.appendChild(grid);
    root.appendChild(relatedWrap);
  }

  document.title = `${safeStr(program.program_name)} • ViableMHR`;
  injectSeoMeta(program);
}

// Client-side enhancement for build-time prerendered program pages
// (dist/programs/{id}.html, see scripts/render-program-detail.js). The build
// bakes in a static "Last verified" note that is only accurate as of build
// time; the >90-day staleness note can go stale itself (or become newly due)
// between builds. This recomputes it from data-last-verified and patches the
// DOM in place — it must NOT touch anything else on a prerendered page.
function enhancePrerenderedStaleness(prerenderedRoot) {
  const lastVerified = prerenderedRoot.getAttribute('data-last-verified') || '';
  const freshness =
    typeof window.getVerificationFreshness === 'function'
      ? window.getVerificationFreshness(lastVerified)
      : 'missing';
  if (freshness !== 'stale') return;
  if (prerenderedRoot.querySelector('.program-detail-stale-note')) return;

  let verificationSection = null;
  prerenderedRoot.querySelectorAll('.program-detail-section').forEach((sec) => {
    const h2 = sec.querySelector('h2');
    if (h2 && h2.textContent === 'Verification') verificationSection = sec;
  });
  if (!verificationSection) return;

  const staleNote = document.createElement('p');
  staleNote.className = 'program-detail-stale-note';
  staleNote.textContent =
    'This listing was last verified more than 90 days ago. Call the program to confirm details are still accurate.';

  const valueEl = verificationSection.querySelector('.program-detail-value');
  if (valueEl) {
    verificationSection.insertBefore(staleNote, valueEl);
  } else {
    verificationSection.appendChild(staleNote);
  }
}

(async () => {
  const prerenderedRoot = document.querySelector('#programDetail [data-prerendered="true"]');
  if (prerenderedRoot) {
    // Build already emitted full HTML (scripts/render-program-detail.js) —
    // skip the programs.json fetch and DOM replace entirely to avoid a
    // flash of empty content. Only enhancement: recompute staleness, the
    // one build-time output that decays with wall-clock time.
    enhancePrerenderedStaleness(prerenderedRoot);
    return;
  }

  await loadPrograms();

  const programId = getProgramIdFromLocation();

  const root = document.getElementById('programDetail');
  if (!root) return;

  if (programId) {
    const program = findProgramById(programId);
    currentProgram = program;
    renderProgramDetail(program);
  } else {
    renderEmptyState(root, {
      icon: '❌',
      title: 'No program specified',
      message: 'Please select a program from the search results.'
    });
  }
})();
