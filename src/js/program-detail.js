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
  return programs.find(p => {
    // Try to match by program_id first
    if (p.program_id === programId) return true;
    
    // Try to match by stable ID
    const stableId = window.stableIdFor ? window.stableIdFor(p, programs.indexOf(p)) : null;
    if (stableId === programId) return true;
    
    return false;
  });
}

function findRelatedPrograms(program, limit = 3) {
  if (!program) return [];
  
  const related = programs
    .filter(p => {
      // Exclude current program
      if (p.program_id === program.program_id) return false;
      
      // Find programs with same location
      const sameLocation = p.locations && program.locations &&
        p.locations.some(loc1 => 
          program.locations.some(loc2 => 
            loc1.city === loc2.city && loc1.state === loc2.state
          )
        );
      
      // Find programs with same level of care
      const sameCare = p.level_of_care === program.level_of_care;
      
      // Find programs from same organization
      const sameOrg = p.organization === program.organization;
      
      return sameLocation || sameCare || sameOrg;
    })
    .slice(0, limit);
  
  return related;
}

function renderProgramDetail(program) {
  if (!program) {
    document.getElementById('programDetail').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❌</div>
        <h3>Program not found</h3>
        <p>The program you're looking for doesn't exist or has been removed.</p>
        <a href="index.html" class="btn-primary" style="display: inline-block; margin-top: 16px;">Back to Search</a>
      </div>
    `;
    return;
  }
  
  const escapeHtml = window.escapeHtml || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  const safeStr = window.safeStr || ((x) => (x ?? "").toString().trim());
  const locLabel = window.locLabel || ((p) => {
    const locs = Array.isArray(p.locations) ? p.locations : [];
    const first = locs[0] || {};
    const city = safeStr(first.city);
    const state = safeStr(first.state);
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    return "Location not listed";
  });
  const safeUrl = window.safeUrl || ((u) => u || "");
  const normalizePhoneForTel = window.normalizePhoneForTel || ((p) => p.replace(/[^\d]/g, ""));
  const mapsLinkFor = window.mapsLinkFor || ((p) => {
    const addr = window.bestAddress ? window.bestAddress(p) : "";
    if (!addr) return "";
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
  });
  
  const addresses = (Array.isArray(program.locations) ? program.locations : [])
    .map(l => [safeStr(l.address), safeStr(l.city), safeStr(l.state), safeStr(l.zip)].filter(Boolean).join(", "))
    .filter(Boolean);
  
  const phone = safeStr(program.phone);
  const tel = normalizePhoneForTel(phone);
  const maps = mapsLinkFor(program);
  const website = safeUrl(program.website_url || program.website || "");
  
  const relatedPrograms = findRelatedPrograms(program, 3);
  
  const html = `
    <div class="program-detail-header">
      <h1 class="program-detail-title">${escapeHtml(safeStr(program.program_name) || "Program")}</h1>
      <p class="program-detail-org">${escapeHtml(safeStr(program.organization) || "")}</p>
      <div class="program-detail-badges">
        <span class="badge">${escapeHtml(safeStr(program.level_of_care) || "Unknown")}</span>
        <span class="badge loc">${escapeHtml(locLabel(program))}</span>
        ${window.hasVirtual && window.hasVirtual(program) ? '<span class="badge loc2">Virtual option</span>' : ''}
      </div>
    </div>
    
    <div class="program-detail-section">
      <h3>Program Information</h3>
      <div class="program-detail-grid">
        <div class="program-detail-label">Level of Care</div>
        <div class="program-detail-value">${escapeHtml(safeStr(program.level_of_care) || "Unknown")}</div>
        
        <div class="program-detail-label">Service Setting</div>
        <div class="program-detail-value">${escapeHtml(safeStr(program.service_setting) || "Unknown")}</div>
        
        <div class="program-detail-label">Ages Served</div>
        <div class="program-detail-value">${escapeHtml(safeStr(program.ages_served) || "Unknown")}</div>
        
        <div class="program-detail-label">Entry Type</div>
        <div class="program-detail-value">${escapeHtml(safeStr(program.entry_type) || "Unknown")}</div>
      </div>
    </div>
    
    ${addresses.length > 0 ? `
    <div class="program-detail-section">
      <h3>Location${addresses.length > 1 ? 's' : ''}</h3>
      ${addresses.map(addr => `
        <div style="margin-bottom: 12px;">
          <div class="program-detail-value">${escapeHtml(addr)}</div>
          ${maps ? `<a href="${escapeHtml(maps)}" target="_blank" rel="noopener" class="linkBtn" style="margin-top: 8px; display: inline-block;">Get Directions</a>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <div class="program-detail-section">
      <h3>Contact Information</h3>
      <div class="program-detail-grid">
        ${phone ? `
        <div class="program-detail-label">Phone</div>
        <div class="program-detail-value">
          ${tel ? `<a href="tel:${escapeHtml(tel)}" class="linkBtn primary">${escapeHtml(phone)}</a>` : escapeHtml(phone)}
        </div>
        ` : ''}
        
        ${website ? `
        <div class="program-detail-label">Website</div>
        <div class="program-detail-value">
          <a href="${escapeHtml(website)}" target="_blank" rel="noopener" class="siteLink">
            Visit website <span aria-hidden="true">↗</span>
          </a>
        </div>
        ` : ''}
      </div>
    </div>
    
    <div class="program-detail-section">
      <h3>Insurance & Access</h3>
      <div class="program-detail-grid">
        <div class="program-detail-label">Insurance</div>
        <div class="program-detail-value">${escapeHtml(safeStr(program.insurance_notes) || "Unknown")}</div>
        
        <div class="program-detail-label">Transportation</div>
        <div class="program-detail-value">${escapeHtml(safeStr(program.transportation_available) || "Unknown")}</div>
        
        ${program.accepting_new_patients ? `
        <div class="program-detail-label">Accepting Patients</div>
        <div class="program-detail-value">${escapeHtml(safeStr(program.accepting_new_patients))}</div>
        ` : ''}
        
        ${program.waitlist_status ? `
        <div class="program-detail-label">Waitlist</div>
        <div class="program-detail-value">${escapeHtml(safeStr(program.waitlist_status))}</div>
        ` : ''}
      </div>
    </div>
    
    ${program.notes ? `
    <div class="program-detail-section">
      <h3>Additional Notes</h3>
      <div class="program-detail-value">${escapeHtml(safeStr(program.notes))}</div>
    </div>
    ` : ''}
    
    ${program.verification_source || program.last_verified ? `
    <div class="program-detail-section">
      <h3>Verification</h3>
      <div class="program-detail-value" style="font-size: 13px; color: var(--muted);">
        ${program.verification_source ? `Source: ${escapeHtml(safeStr(program.verification_source))}` : ''}
        ${program.verification_source && program.last_verified ? ' • ' : ''}
        ${program.last_verified ? `Last verified: ${escapeHtml(safeStr(program.last_verified))}` : ''}
      </div>
    </div>
    ` : ''}
    
    ${relatedPrograms.length > 0 ? `
    <div class="related-programs">
      <h2 style="font-size: 22px; margin-bottom: 16px;">Related Programs</h2>
      <div class="related-programs-grid">
        ${relatedPrograms.map(p => `
          <div class="card">
            <div class="cardTop">
              <div>
                <p class="pname">${escapeHtml(safeStr(p.program_name) || "Program")}</p>
                <p class="org">${escapeHtml(safeStr(p.organization) || "")}</p>
              </div>
            </div>
            <div class="badgeRow">
              <span class="badge">${escapeHtml(safeStr(p.level_of_care) || "Unknown")}</span>
              <span class="badge loc">${escapeHtml(locLabel(p))}</span>
            </div>
            <div class="actions" style="margin-top: 12px;">
              <a href="program.html?id=${escapeHtml(p.program_id)}" class="linkBtn primary">View Details</a>
              <a href="index.html?program=${escapeHtml(p.program_id)}" class="linkBtn">View in Search</a>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
  `;
  
  document.getElementById('programDetail').innerHTML = html;
  
  // Update page title
  document.title = `${safeStr(program.program_name)} • Texas Youth Mental Health Resource Finder`;
}

// Initialize
(async () => {
  await loadPrograms();
  
  const params = new URLSearchParams(window.location.search);
  const programId = params.get('id');
  
  if (programId) {
    const program = findProgramById(programId);
    currentProgram = program;
    renderProgramDetail(program);
  } else {
    document.getElementById('programDetail').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❌</div>
        <h3>No program specified</h3>
        <p>Please select a program from the search results.</p>
        <a href="index.html" class="btn-primary" style="display: inline-block; margin-top: 16px;">Back to Search</a>
      </div>
    `;
  }
})();







