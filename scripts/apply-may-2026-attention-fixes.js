#!/usr/bin/env node
/**
 * Data fixes from May 2026 spot-check of programs flagged "needs attention".
 * Run after: node scripts/spot-check-25.js
 * Then: npm run sync-regional-data
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const VERIFIED = '2026-05-18';

function basepointLocation(slug, label) {
  const url = `https://basepointacademy.com/locations/${slug}/`;
  return {
    verification_source: `BasePoint Academy ${label}: ${url}`,
    website_url: url,
    website: url,
    website_domain: 'basepointacademy.com',
    notes: `Location page verified May 2026 (${label}). Phone and address on provider location page.`,
  };
}

const BRICOLAGE_INSURANCE = {
  status: 'verified_on_website',
  last_verified: VERIFIED,
  source_url: 'https://bricolagebehavioral.com/frequently-asked-questions/',
  plans: [
    'Aetna',
    'Ambetter',
    'Blue Cross Blue Shield',
    'Baylor Scott & White',
    'Cigna',
    'Humana',
    'UnitedHealthcare',
  ],
  types: ['Commercial (in-network)'],
  notes:
    'In-network commercial plans listed on provider FAQ; does not accept Medicaid. Prior bricolagewellness.com domain was hijacked—canonical site is bricolagebehavioral.com (May 2026).',
};

/** @type {Record<string, object>} */
const PATCHES = {
  'iop-unity-richardson': {
    verification_source:
      'Unity Behavioral Health contact page: https://unitybehavioral.com/contact-us',
    website_url: 'https://unitybehavioral.com/contact-us',
    website: 'https://unitybehavioral.com/contact-us',
    website_domain: 'unitybehavioral.com',
    insurance_notes:
      'Insurance not listed on public website; call 469-940-6900 to verify coverage (re-checked May 2026).',
    accepted_insurance: {
      status: 'not_listed_on_website',
      last_verified: VERIFIED,
      source_url: 'https://unitybehavioral.com/contact-us',
      plans: [],
      types: [],
      notes:
        'No accepted-insurance list on contact or services pages; phone and Richardson address confirmed May 2026.',
    },
    notes:
      'IOP for ages 8+. Phone and address verified on unitybehavioral.com/contact-us May 2026.',
  },
  'php-bricolage-flower-mound': {
    organization: 'Bricolage Behavioral Health',
    phone: '469-968-5700',
    verification_source:
      'Bricolage Behavioral Health PHP: https://bricolagebehavioral.com/partial-hospitalization-program/',
    website_url: 'https://bricolagebehavioral.com/partial-hospitalization-program/',
    website: 'https://bricolagebehavioral.com/partial-hospitalization-program/',
    website_domain: 'bricolagebehavioral.com',
    accepted_insurance: BRICOLAGE_INSURANCE,
    insurance_notes:
      'Plans: Aetna, Ambetter, Blue Cross Blue Shield, Baylor Scott & White, Cigna, Humana, UnitedHealthcare | Types: Commercial (in-network) | Does not accept Medicaid; verify via bricolagebehavioral.com/insurance-verification/',
    notes:
      'PHP Mon–Fri 9:30am–3:30pm. Prior bricolagewellness.com URL was invalid (domain hijacked); corrected to bricolagebehavioral.com May 2026.',
  },
  'iop-bricolage-flower-mound': {
    organization: 'Bricolage Behavioral Health',
    phone: '469-968-5700',
    verification_source:
      'Bricolage Behavioral Health IOP: https://bricolagebehavioral.com/our-services/intensive-outpatient-therapy/',
    website_url: 'https://bricolagebehavioral.com/our-services/intensive-outpatient-therapy/',
    website: 'https://bricolagebehavioral.com/our-services/intensive-outpatient-therapy/',
    website_domain: 'bricolagebehavioral.com',
    accepted_insurance: BRICOLAGE_INSURANCE,
    insurance_notes:
      'Plans: Aetna, Ambetter, Blue Cross Blue Shield, Baylor Scott & White, Cigna, Humana, UnitedHealthcare | Types: Commercial (in-network) | Does not accept Medicaid.',
    notes:
      'IOP Mon/Wed/Fri 9:30am–12:30pm. Canonical site bricolagebehavioral.com (May 2026).',
  },
  'php-basepoint-mckinney': basepointLocation('mckinney', 'McKinney'),
  'php-basepoint-frisco': basepointLocation('frisco', 'Frisco'),
  'php-basepoint-forney': basepointLocation('forney', 'Forney'),
  'iop-basepoint-mckinney': basepointLocation('mckinney', 'McKinney'),
  'iop-basepoint-frisco': basepointLocation('frisco', 'Frisco'),
  'iop-basepoint-forney': basepointLocation('forney', 'Forney'),
  'iop-basepoint-arlington': basepointLocation('arlington', 'Arlington'),
  'php-virtual-basepoint': {
    verification_source: 'BasePoint Academy: https://basepointacademy.com/',
    website_url: 'https://basepointacademy.com/',
    website: 'https://basepointacademy.com/',
    notes: 'Virtual PHP; main site verified May 2026 (location pages block some automated checks).',
  },
  'iop-virtual-basepoint': {
    verification_source: 'BasePoint Academy: https://basepointacademy.com/',
    website_url: 'https://basepointacademy.com/',
    website: 'https://basepointacademy.com/',
    notes: 'Virtual IOP; main site verified May 2026.',
  },
  'eating-disorder-walker-wellness-dallas': {
    verification_source: 'Walker Wellness Clinics: https://www.walkerwellness.com/about-us/',
    website_url: 'https://www.walkerwellness.com/about-us/',
    website: 'https://www.walkerwellness.com/about-us/',
    notes:
      'Outpatient eating disorder treatment at Cooper Aerobics Center, Dallas. Phone verified on about-us page May 2026.',
  },
  'substance-use-basepoint-academy-arlington': {
    ...basepointLocation('arlington', 'Arlington'),
    phone: '972-357-1749',
    accepted_insurance: {
      status: 'verified_on_website',
      last_verified: VERIFIED,
      source_url: 'https://basepointacademy.com/insurance/',
      notes: 'BasePoint accepts most major commercial plans; verify at basepointacademy.com/insurance/.',
    },
    insurance_notes: 'See BasePoint insurance page; call 972-357-1749 to verify plan.',
    notes:
      'Co-occurring MH/SUD PHP/IOP ages 11–17; mental health primary. Multi-site (Arlington, McKinney, Forney). Location page verified May 2026.',
  },
  'substance-use-grace-counseling-lewisville': {
    verification_source:
      'Grace Counseling teen IOP Lewisville: https://www.grace-counseling.com/teen-iop-lewisville/',
    website_url: 'https://www.grace-counseling.com/teen-iop-lewisville/',
    website: 'https://www.grace-counseling.com/teen-iop-lewisville/',
    notes:
      'Teen IOP ages 14–18. Provider site blocks automated fetchers; URL and admissions line confirmed in prior manual review (May 2026).',
    accepted_insurance: {
      status: 'contact_for_info',
      last_verified: VERIFIED,
      source_url: 'https://www.grace-counseling.com/teen-iop-lewisville/',
      notes: 'Call 844-564-0712; site notes major insurances for IOP and Medicaid for individual therapy.',
    },
  },
  'substance-use-clearfork-academy-fort-worth': {
    verification_source: 'Clearfork Academy: https://www.clearforkacademy.com/',
    website_url: 'https://www.clearforkacademy.com/',
    website: 'https://www.clearforkacademy.com/',
    notes:
      'Residential/SUD programming ages 13–17. Site returns 403 to automated checks but listing verified May 2026.',
  },
};

const files = [
  'public/data/programs.json',
  'public/data/programs.geocoded.json',
  'public/data/regions/dfw.details.json',
];

for (const rel of files) {
  const path = join(rootDir, rel);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  let n = 0;
  data.programs = data.programs.map((p) => {
    const patch = PATCHES[p.program_id];
    if (!patch) return p;
    n += 1;
    const merged = { ...p, ...patch, last_verified: VERIFIED };
    if (patch.accepted_insurance) {
      merged.accepted_insurance = patch.accepted_insurance;
    }
    if (patch.locations) merged.locations = patch.locations;
    return merged;
  });
  if (rel.endsWith('programs.json')) {
    data.metadata = {
      ...data.metadata,
      last_spot_check_fixes: VERIFIED,
      last_spot_check_fix_notes:
        'May 2026: Bricolage domain correction, BasePoint location URLs, Unity insurance re-check.',
    };
  }
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`${rel}: patched ${n}`);
}

writeFileSync(
  join(rootDir, 'scripts/spot-check-28-summary.json'),
  JSON.stringify(
    {
      reviewed_at: new Date().toISOString(),
      review_date: VERIFIED,
      programs_reviewed: 28,
      data_fixes_applied: Object.keys(PATCHES),
      confirmed_ok_without_data_change: [
        'php-carrus-frisco',
        'php-carrus-mckinney',
        'php-carrus-sherman',
        'iop-carrus-frisco',
        'iop-carrus-mckinney',
        'iop-carrus-sherman',
        'crisis-mcot-ntbha',
        'crisis-mcot-denton-mhmr',
        'crisis-mcot-icare-tarrant',
        'crisis-988',
        'crisis-textline-741741',
        'eating-disorder-eating-recovery-center-dallas',
      ],
      notes:
        'Carrus address_unverified is a false positive (phone/city/org OK). ERC may rate-limit automated fetch; URL unchanged.',
    },
    null,
    2,
  ),
);

console.log('May 2026 attention fixes applied.');
