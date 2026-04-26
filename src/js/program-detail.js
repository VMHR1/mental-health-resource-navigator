// ========== Program Detail Page ==========

let programs = [];
let currentProgram = null;

async function loadPrograms() {
  try {
    const res = await fetch('programs.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load programs');
    const data = await res.json();
    programs = data.programs || [];
    return programs;
  } catch (error) {
    console.error('Error loading programs:', error);
    return [];
  }
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

  const h3 = document.createElement('h3');
  h3.textContent = title;

  const p = document.createElement('p');
  p.textContent = message;

  const back = document.createElement('a');
  back.href = 'index.html';
  back.className = 'btn-primary';
  back.style.display = 'inline-block';
  back.style.marginTop = '16px';
  back.textContent = 'Back to Search';

  wrap.append(iconEl, h3, p, back);
  root.appendChild(wrap);
}

function appendSection(container, titleText) {
  const section = document.createElement('div');
  section.className = 'program-detail-section';
  const h3 = document.createElement('h3');
  h3.textContent = titleText;
  section.appendChild(h3);
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
        dir.rel = 'noopener';
        dir.className = 'linkBtn';
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
    siteWrap.rel = 'noopener';
    siteWrap.className = 'siteLink';
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
    verSection.appendChild(verVal);
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
      const pname = document.createElement('p');
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
      detailLink.href = `program.html?id=${idEnc}`;
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

  document.title = `${safeStr(program.program_name)} • Texas Youth Mental Health Resource Finder`;
}

(async () => {
  await loadPrograms();

  const params = new URLSearchParams(window.location.search);
  const programId = params.get('id');

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
