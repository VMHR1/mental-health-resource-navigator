// ========== Export Center (Phase 8 — pilot) ==========
// Generates CSV/JSON from public/data/programs.json for partner organizations.
// Only fields documented in export_schema.json are emitted.

(function () {
  if (typeof window === 'undefined') return;

  let cachedPrograms = null;
  let cachedSchema = null;

  function safe(x) { return (x == null ? '' : String(x)).trim(); }

  function fetchJson(path) {
    return fetch(path, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${path}: HTTP ${r.status}`);
      return r.json();
    });
  }

  function loadData() {
    if (cachedPrograms && cachedSchema) {
      return Promise.resolve({ programs: cachedPrograms, schema: cachedSchema });
    }
    return Promise.all([
      fetchJson('data/programs.json'),
      fetchJson('data/export_schema.json'),
    ]).then(([programsBlob, schema]) => {
      cachedPrograms = Array.isArray(programsBlob && programsBlob.programs)
        ? programsBlob.programs
        : Array.isArray(programsBlob) ? programsBlob : [];
      cachedSchema = schema;
      return { programs: cachedPrograms, schema };
    });
  }

  function primaryLocation(program) {
    const locs = Array.isArray(program.locations) ? program.locations : [];
    return locs[0] || {};
  }

  function projectProgram(program) {
    const loc = primaryLocation(program);
    const verification = program.verification || {};
    return {
      program_id: safe(program.program_id),
      program_name: safe(program.program_name),
      organization: safe(program.organization),
      level_of_care: safe(program.level_of_care),
      entry_type: safe(program.entry_type),
      service_setting: safe(program.service_setting),
      ages_served: safe(program.ages_served),
      city: safe(loc.city),
      state: safe(loc.state),
      zip: safe(loc.zip),
      phone: safe(program.phone),
      intake_phone: safe(program.intake_phone),
      website_url: safe(program.website_url) || safe(program.website),
      insurance_notes: safe(program.insurance_notes),
      service_domains: Array.isArray(program.service_domains) ? program.service_domains.filter(Boolean).join(';') : '',
      last_verified: safe(program.last_verified || verification.last_verified_at),
      verification_status: safe(verification.status) || 'unknown',
    };
  }

  function applyFilters(programs, filters) {
    let list = programs.slice();
    if (filters.care) {
      const v = filters.care.toLowerCase();
      list = list.filter((p) => safe(p.level_of_care).toLowerCase() === v);
    }
    if (filters.city) {
      const v = filters.city.toLowerCase();
      list = list.filter((p) => primaryLocation(p) && safe(primaryLocation(p).city).toLowerCase() === v);
    }
    if (filters.domain) {
      const v = filters.domain.toLowerCase();
      list = list.filter((p) => Array.isArray(p.service_domains) && p.service_domains.some((d) => safe(d).toLowerCase() === v));
    }
    if (filters.verifiedWithinDays) {
      const days = Number(filters.verifiedWithinDays);
      if (Number.isFinite(days) && days > 0) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        list = list.filter((p) => {
          const v = safe(p.last_verified || (p.verification && p.verification.last_verified_at));
          if (!v) return false;
          const t = new Date(v).getTime();
          return Number.isFinite(t) && t >= cutoff;
        });
      }
    }
    return list;
  }

  function csvEscape(value) {
    const s = safe(value);
    if (!s) return '';
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function toCsv(rows, schema) {
    const keys = (schema && Array.isArray(schema.fields) ? schema.fields : []).map((f) => f.key);
    const header = keys.join(',');
    const body = rows.map((row) => keys.map((k) => csvEscape(row[k])).join(',')).join('\n');
    return header + '\n' + body + '\n';
  }

  function download(filename, mime, content) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function recordExport(format, count) {
    if (window.VMHRProEvents && typeof window.VMHRProEvents.record === 'function') {
      window.VMHRProEvents.record('export_center_download', {
        format,
        count,
      });
    }
  }

  function runExport(format, filters) {
    return loadData().then(({ programs, schema }) => {
      const filtered = applyFilters(programs, filters || {});
      const rows = filtered.map(projectProgram);
      const stamp = new Date().toISOString().split('T')[0];
      if (format === 'csv') {
        const csv = toCsv(rows, schema);
        download(`viablemhr-export-${stamp}.csv`, 'text/csv;charset=utf-8', csv);
      } else {
        const payload = {
          exported_at: new Date().toISOString(),
          schema_version: schema && schema.schema_version,
          license: schema && schema.license,
          filters: filters || {},
          count: rows.length,
          rows,
        };
        download(`viablemhr-export-${stamp}.json`, 'application/json', JSON.stringify(payload, null, 2));
      }
      recordExport(format, rows.length);
      return rows.length;
    });
  }

  function attach(form, statusEl) {
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const format = form.querySelector('[name="format"]:checked')?.value || 'csv';
      const filters = {
        care: form.querySelector('[name="care"]')?.value || '',
        city: form.querySelector('[name="city"]')?.value || '',
        domain: form.querySelector('[name="domain"]')?.value || '',
        verifiedWithinDays: form.querySelector('[name="verifiedWithinDays"]')?.value || '',
      };
      if (statusEl) statusEl.textContent = 'Preparing download…';
      runExport(format, filters)
        .then((count) => {
          if (statusEl) statusEl.textContent = `Downloaded ${count} program${count === 1 ? '' : 's'} as ${format.toUpperCase()}.`;
        })
        .catch((err) => {
          console.error('export error', err);
          if (statusEl) statusEl.textContent = 'Export failed. Please try again.';
        });
    });
  }

  window.VMHRExportCenter = {
    runExport,
    attach,
    loadData,
  };
})();
