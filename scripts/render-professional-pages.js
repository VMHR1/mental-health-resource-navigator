/**
 * Build-side renderers for the three professional-layer pages that still
 * served a client-only "Loading…" shell: boards.html, changelog.html, and
 * regional-snapshot.html. Mirrors the inline <script> in each src/html/*.html
 * file exactly (same DOM structure/classes/escaping/empty-state text) so the
 * existing CSS applies unchanged and dist/*.html ships full content instead
 * of a placeholder.
 *
 * Pro-gate note (see CLAUDE.md "Two layers"): pro-gate.js hides `main` and
 * `footer` via `visibility:hidden` on `html.pro-gate-locked` (public/phase1-design.css
 * ~line 1969) — a CSS/JS runtime gate, not a server-side ACL. It does not
 * remove content from the DOM, and the JSON these pages render
 * (public/data/resource_boards.json, verification_changelog.json,
 * regional_gap_snapshot.json — including the regional snapshot's
 * `methodology` field) is already served unauthenticated at those exact
 * paths regardless of the gate. Statically rendering full content here adds
 * no exposure beyond what already ships, and matches sitemap-pages.xml
 * already listing /boards, /changelog, /regional-snapshot as indexable.
 * Real gated users still see the CSS-hidden shell until they unlock — this
 * change only replaces the "Loading…" placeholder markup with the real
 * content markup a crawler or view-source sees.
 */
import { escapeHtml, safeStr } from '../src/js/utils/helpers.js';

/** Mirrors buildHref() in src/html/boards.html's inline script. */
function boardItemHref(item) {
  switch (item.type) {
    case 'preset':
      return '/?mode=navigator&preset=' + encodeURIComponent(item.preset_id || '');
    case 'internal_search':
    case 'program_id':
    case 'guide_anchor':
    case 'external':
      return item.href || '#';
    default:
      return item.href || '#';
  }
}

/** Mirrors typeBadge() in src/html/boards.html's inline script. */
function boardTypeBadge(type) {
  if (type === 'external') return { cls: 'external', label: 'External' };
  if (type === 'guide_anchor') return { cls: 'guide', label: 'Guide' };
  if (type === 'preset') return { cls: '', label: 'Search preset' };
  if (type === 'internal_search') return { cls: '', label: 'Search' };
  if (type === 'program_id') return { cls: '', label: 'Program' };
  return { cls: '', label: 'Link' };
}

/**
 * Renders the content for `#boardsContent` in dist/boards.html, mirroring
 * renderBoards() in the page's inline script (nav + board cards + editorial
 * policy note). Wraps the result in `data-prerendered="true"` so the client
 * script skips its fetch. Data-driven empty state ("No boards available
 * right now.") is kept verbatim when the boards array is empty.
 */
export function renderBoardsContent(data) {
  const boards = Array.isArray(data && data.boards) ? data.boards : [];

  if (boards.length === 0) {
    return '<div data-prerendered="true"><p class="boards-error">No boards available right now.</p></div>';
  }

  const navHtml =
    '<nav aria-label="Boards" style="margin-bottom: 24px;"><strong style="display:block;margin-bottom:8px;">Jump to a board</strong><ul style="margin:0;padding-left:1.2rem;display:grid;gap:6px;">' +
    boards.map((b) => `<li><a href="#${escapeHtml(b.id)}">${escapeHtml(b.title)}</a></li>`).join('') +
    '</ul></nav>';

  const boardsHtml =
    '<div class="boards-list">' +
    boards
      .map((b) => {
        return `
            <article class="board-card" id="${escapeHtml(b.id)}" aria-labelledby="board-${escapeHtml(b.id)}-title">
              <h2 id="board-${escapeHtml(b.id)}-title">${escapeHtml(b.title)}</h2>
              <p class="board-summary">${escapeHtml(b.summary || '')}</p>
              ${b.editorial_note ? `<p class="board-editorial">${escapeHtml(b.editorial_note)}</p>` : ''}
              <ul class="board-items">
                ${(Array.isArray(b.items) ? b.items : [])
                  .map((item) => {
                    const href = boardItemHref(item);
                    const badge = boardTypeBadge(item.type);
                    const isExternal = item.type === 'external';
                    const newTab = isExternal && !/^(tel:|sms:|mailto:)/i.test(href);
                    return `
                    <li class="board-item">
                      <div class="board-item__top">
                        <a class="board-item__label" href="${escapeHtml(href)}"${newTab ? ' target="_blank" rel="noopener noreferrer"' : ''} data-pro-event="board_open" data-pro-event-props='{"board_id":"${escapeHtml(b.id)}"}'>
                          ${escapeHtml(item.label || href)}${newTab ? ' <span aria-hidden="true">↗</span><span class="sr-only"> (opens in new tab)</span>' : ''}
                        </a>
                        <span class="board-item__type ${badge.cls}">${escapeHtml(badge.label)}</span>
                      </div>
                      ${item.description ? `<p class="board-item__description">${escapeHtml(item.description)}</p>` : ''}
                    </li>
                  `;
                  })
                  .join('')}
              </ul>
            </article>
          `;
      })
      .join('') +
    '</div>';

  const note =
    data.metadata && data.metadata.editorial_policy
      ? `<p style="margin-top: 28px; color: var(--muted); font-size: 13px;">${escapeHtml(data.metadata.editorial_policy)}</p>`
      : '';

  return `<div data-prerendered="true">${navHtml}${boardsHtml}${note}</div>`;
}

/**
 * Renders the content for `#changelogContent` in dist/changelog.html,
 * mirroring render() in the page's inline script (events sorted newest
 * first). Data-driven empty state kept verbatim.
 */
export function renderChangelogContent(data) {
  const events = Array.isArray(data && data.events) ? data.events : [];
  if (!events.length) {
    return '<div data-prerendered="true"><p class="cl-lead">No verification events have been published yet.</p></div>';
  }

  const sorted = events.slice().sort((a, b) => safeStr(b.date).localeCompare(safeStr(a.date)));
  const list =
    '<div class="cl-list">' +
    sorted
      .map((ev) => {
        return `
            <article class="cl-event">
              <div class="cl-event__head">
                <span class="cl-event__date">${escapeHtml(ev.date || 'Date unknown')}</span>
                <span class="cl-event__scope">${escapeHtml(ev.scope || 'event')}</span>
              </div>
              <p class="cl-event__meta">Programs reviewed: <strong>${escapeHtml(ev.programs_reviewed_count || 0)}</strong>${ev.source ? ' · Source: ' + escapeHtml(ev.source) : ''}</p>
              ${ev.notes ? `<p class="cl-event__notes">${escapeHtml(ev.notes)}</p>` : ''}
            </article>
          `;
      })
      .join('') +
    '</div>';

  return `<div data-prerendered="true">${list}</div>`;
}

/**
 * Renders the content for `#rsContent` in dist/regional-snapshot.html,
 * mirroring render() in the page's inline script (headline tiles, thin
 * coverage table, zero-result signatures, methodology). No pro-gate
 * subsetting — see the file-header note above for why the full section set
 * renders statically.
 */
export function renderRegionalSnapshotContent(data) {
  const meta = data.metadata || {};
  const counts = data.counts || {};
  const missing = counts.missing_field_counts || {};
  const thin = Array.isArray(data.thin_coverage) ? data.thin_coverage : [];
  const zero = Array.isArray(data.top_zero_result_signatures) ? data.top_zero_result_signatures : [];

  const tiles = `
          <div class="rs-grid">
            <div class="rs-tile"><div class="rs-tile__label">Programs in directory</div><div class="rs-tile__value">${escapeHtml(meta.total_programs || 0)}</div></div>
            <div class="rs-tile"><div class="rs-tile__label">Stale programs (&gt; 90 days)</div><div class="rs-tile__value">${escapeHtml(counts.stale_program_count || 0)}</div></div>
            <div class="rs-tile"><div class="rs-tile__label">Recently updated (&le; 30 days)</div><div class="rs-tile__value">${escapeHtml(counts.recently_updated_count || 0)}</div></div>
            <div class="rs-tile"><div class="rs-tile__label">Missing website</div><div class="rs-tile__value">${escapeHtml(missing.website_url || 0)}</div></div>
            <div class="rs-tile"><div class="rs-tile__label">Insurance unclear</div><div class="rs-tile__value">${escapeHtml(missing.insurance_clear || 0)}</div></div>
            <div class="rs-tile"><div class="rs-tile__label">Intake phone unlabeled</div><div class="rs-tile__value">${escapeHtml(missing.intake_phone_labeled || 0)}</div></div>
            <div class="rs-tile"><div class="rs-tile__label">Care level missing</div><div class="rs-tile__value">${escapeHtml(missing.care_level || 0)}</div></div>
          </div>
        `;

  const thinHtml = thin.length
    ? `<table class="rs-table"><thead><tr><th>City</th><th>Care level</th><th>Programs</th></tr></thead><tbody>${thin
        .map((row) => `<tr><td>${escapeHtml(row.city)}</td><td>${escapeHtml(row.care_level)}</td><td>${escapeHtml(row.program_count)}</td></tr>`)
        .join('')}</tbody></table>`
    : '<p class="rs-meta">No thin-coverage entries at the current threshold.</p>';

  const zeroHtml = zero.length
    ? `<table class="rs-table"><thead><tr><th>Filter signature</th><th>Zero-result events</th></tr></thead><tbody>${zero
        .map((row) => `<tr><td><code>${escapeHtml(row.signature)}</code></td><td>${escapeHtml(row.count)}</td></tr>`)
        .join('')}</tbody></table>`
    : '<p class="rs-meta">No aggregated zero-result data published with this snapshot.</p>';

  const body = `
          <section class="rs-section">
            <h2>Headline counts</h2>
            <p class="rs-meta">Period: <strong>${escapeHtml(meta.period)}</strong> · Generated: ${escapeHtml(meta.generated_at)}</p>
            ${tiles}
            <div class="rs-actions">
              <a class="btnlike" href="data/regional_gap_snapshot.json" download data-pro-event="regional_snapshot_download" data-pro-event-props='{"period":"${escapeHtml(meta.period)}"}'>Download JSON</a>
            </div>
          </section>

          <section class="rs-section">
            <h2>Thin coverage (city × care level)</h2>
            <p class="rs-meta">Pairs with 2 or fewer programs. Useful for QI and coalition planning.</p>
            ${thinHtml}
          </section>

          <section class="rs-section">
            <h2>Top zero-result filter signatures</h2>
            <p class="rs-meta">Aggregated from optional staging metrics. Signatures encode filter combinations only, never raw query text.</p>
            ${zeroHtml}
          </section>

          <section class="rs-section">
            <h2>Methodology</h2>
            <p>${escapeHtml(meta.methodology || '')}</p>
            ${Array.isArray(data.notes) ? `<ul>${data.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
          </section>
        `;

  return `<div data-prerendered="true">${body}</div>`;
}

/** Function-form replace so a literal $&/$'/$` etc. in data-derived content can never be interpreted by String.replace's special-pattern substitution. */
function mustFillMarker(html, marker, replacement, label) {
  if (!html.includes(marker)) {
    throw new Error(`render-professional-pages: expected to find ${marker} in ${label} but it was missing`);
  }
  return html.replace(marker, () => replacement);
}

/**
 * Fills the three professional-layer page markers in dist/. Called from
 * generateProgramPages() after the HTML files exist in dist/ and after
 * public/data has already been copied there by scripts/build.js.
 */
export function fillProfessionalPages({ readFileSync, writeFileSync, join, root }) {
  const pages = [
    {
      htmlPath: join(root, 'dist', 'boards.html'),
      dataPath: join(root, 'dist', 'data', 'resource_boards.json'),
      marker: '<!--vmhr-boards-content-->',
      render: renderBoardsContent,
      label: 'dist/boards.html',
    },
    {
      htmlPath: join(root, 'dist', 'changelog.html'),
      dataPath: join(root, 'dist', 'data', 'verification_changelog.json'),
      marker: '<!--vmhr-changelog-content-->',
      render: renderChangelogContent,
      label: 'dist/changelog.html',
    },
    {
      htmlPath: join(root, 'dist', 'regional-snapshot.html'),
      dataPath: join(root, 'dist', 'data', 'regional_gap_snapshot.json'),
      marker: '<!--vmhr-regional-snapshot-content-->',
      render: renderRegionalSnapshotContent,
      label: 'dist/regional-snapshot.html',
    },
  ];

  for (const page of pages) {
    const data = JSON.parse(readFileSync(page.dataPath, 'utf8'));
    const html = readFileSync(page.htmlPath, 'utf8');
    const filled = mustFillMarker(html, page.marker, page.render(data), page.label);
    writeFileSync(page.htmlPath, filled, 'utf8');
    console.log(`Professional page: ${page.label} filled from ${page.dataPath.split('/').slice(-2).join('/')}`);
  }
}
