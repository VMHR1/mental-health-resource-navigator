#!/usr/bin/env node
/**
 * Manual internet verification pass (May 2026).
 * Sources: official provider websites only unless noted.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const V = '2026-05-18';

function v(urls, status, notes, signals = {}) {
  const source_urls = Array.isArray(urls) ? urls : [urls];
  return {
    last_verified: V,
    verification: {
      last_verified_at: V,
      source_urls,
      status,
      notes,
      audited_at: new Date().toISOString(),
      signals,
    },
  };
}

const CARRUS_INS = {
  status: 'verified_on_website',
  last_verified: V,
  source_url: 'https://www.carruscarebehavioral.com/',
  plans: [],
  types: ['Commercial (most major)', 'Medicaid', 'TRICARE (Keller location page)'],
  notes:
    'Location pages state in-network with most major insurance and Medicaid; call location to verify plan-specific benefits.',
};

function carrus(slug, { phone, address, city, zip, ages = '8–17', extraUrl = null }) {
  const url = `https://www.carruscarebehavioral.com/${slug}`;
  const urls = extraUrl ? [url, extraUrl] : [url];
  return {
    phone,
    ages_served: ages,
    locations: [{ city, state: 'TX', zip, address }],
    verification_source: `Carrus Care: ${url}`,
    website_url: url,
    website: url,
    website_domain: 'carruscarebehavioral.com',
    insurance_notes:
      'Plans: Most major commercial insurance, Medicaid | Types: Commercial, Medicaid | Hours Mon–Fri 8:00 AM–5:00 PM per location page. Call to verify plan.',
    accepted_insurance: { ...CARRUS_INS, source_url: url },
    notes:
      'PHP and IOP Mon–Fri; free assessments. Faith-based and non-faith tracks at most locations. Verified on carruscarebehavioral.com May 2026.',
    ...v(urls, 'verified', 'Phone, address, ages, and insurance language confirmed on official Carrus Care location page.', {
      phone_on_page: true,
      city_on_page: true,
    }),
  };
}

const BASEPOINT_INS_URL = 'https://basepointacademy.com/insurance/';

function basepoint(slug, label) {
  const url = slug ? `https://basepointacademy.com/locations/${slug}/` : 'https://basepointacademy.com/';
  return {
    verification_source: `BasePoint Academy ${label}: ${url}`,
    website_url: url,
    website: url,
    phone: '972-357-1749',
    insurance_notes:
      'In-network with most major commercial plans per basepointacademy.com/insurance/; call 972-357-1749 to verify benefits for your plan.',
    accepted_insurance: {
      status: 'verified_on_website',
      last_verified: V,
      source_url: BASEPOINT_INS_URL,
      types: ['Commercial (most major)'],
      notes: 'BasePoint states in-network with most major insurance; verify plan and authorization.',
    },
    ...v([url, BASEPOINT_INS_URL], 'verified', 'Location and insurance pages on basepointacademy.com verified May 2026.', {
      phone_on_page: true,
      city_on_page: true,
    }),
  };
}

/** @type {Record<string, object>} */
const PATCHES = {
  // —— Carrus (official location pages) ——
  'php-carrus-frisco': carrus('friscotx', {
    phone: '469-200-5353',
    address: '2440 Timber Ridge Dr., Suite 105',
    city: 'Frisco',
    zip: '75034',
  }),
  'iop-carrus-frisco': carrus('friscotx', {
    phone: '469-200-5353',
    address: '2440 Timber Ridge Dr., Suite 105',
    city: 'Frisco',
    zip: '75034',
  }),
  'php-carrus-mckinney': carrus('mckinney', {
    phone: '903-870-1222',
    address: '3600 Eldorado Parkway, Building C, Suite 1',
    city: 'McKinney',
    zip: '75072',
  }),
  'iop-carrus-mckinney': carrus('mckinney', {
    phone: '903-870-1222',
    address: '3600 Eldorado Parkway, Building C, Suite 1',
    city: 'McKinney',
    zip: '75072',
  }),
  'php-carrus-plano': carrus('plano', {
    phone: '903-870-1222',
    address: '4701 Old Shepard Place, Suite 200',
    city: 'Plano',
    zip: '75093',
  }),
  'iop-carrus-plano': carrus('plano', {
    phone: '903-870-1222',
    address: '4701 Old Shepard Place, Suite 200',
    city: 'Plano',
    zip: '75093',
  }),
  'php-carrus-flower-mound': carrus('flowermound', {
    phone: '903-870-1222',
    address: '2750 Churchill Dr., Suite 110',
    city: 'Flower Mound',
    zip: '75028',
  }),
  'iop-carrus-flower-mound': carrus('flowermound', {
    phone: '903-870-1222',
    address: '2750 Churchill Dr., Suite 110',
    city: 'Flower Mound',
    zip: '75028',
  }),
  'php-carrus-mansfield': carrus('mansfield', {
    phone: '903-870-1222',
    address: '1707 Fountainview Dr.',
    city: 'Mansfield',
    zip: '76063',
  }),
  'iop-carrus-mansfield': carrus('mansfield', {
    phone: '903-870-1222',
    address: '1707 Fountainview Dr.',
    city: 'Mansfield',
    zip: '76063',
  }),
  'php-carrus-keller': carrus('keller', {
    phone: '903-870-1222',
    address: '4561 Heritage Trace Parkway, Suite 109',
    city: 'Keller',
    zip: '76244',
  }),
  'iop-carrus-keller': carrus('keller', {
    phone: '903-870-1222',
    address: '4561 Heritage Trace Parkway, Suite 109',
    city: 'Keller',
    zip: '76244',
  }),
  'php-carrus-sherman': carrus('sherman', {
    phone: '903-870-1222',
    address: '1724 U.S. Highway 82 W',
    city: 'Sherman',
    zip: '75092',
    ages: '8–17',
  }),
  'iop-carrus-sherman': carrus('sherman', {
    phone: '903-870-1222',
    address: '1724 U.S. Highway 82 W',
    city: 'Sherman',
    zip: '75092',
    ages: '8–17',
  }),

  // —— BasePoint ——
  'php-basepoint-mckinney': {
    ...basepoint('mckinney', 'McKinney'),
    locations: [{ city: 'McKinney', state: 'TX', zip: '75069', address: '4733 Medical Center Dr.' }],
  },
  'iop-basepoint-mckinney': {
    ...basepoint('mckinney', 'McKinney'),
    locations: [{ city: 'McKinney', state: 'TX', zip: '75069', address: '4733 Medical Center Dr.' }],
  },
  'php-basepoint-frisco': {
    ...basepoint('frisco', 'Frisco'),
    locations: [{ city: 'Frisco', state: 'TX', zip: '75036', address: '8275 Judges Way, Suite 100' }],
  },
  'iop-basepoint-frisco': {
    ...basepoint('frisco', 'Frisco'),
    locations: [{ city: 'Frisco', state: 'TX', zip: '75036', address: '8275 Judges Way, Suite 100' }],
  },
  'php-basepoint-forney': {
    ...basepoint('forney', 'Forney'),
    locations: [{ city: 'Forney', state: 'TX', zip: '75126', address: '713 W. Broad St., Suite 200' }],
  },
  'iop-basepoint-forney': {
    ...basepoint('forney', 'Forney'),
    locations: [{ city: 'Forney', state: 'TX', zip: '75126', address: '713 W. Broad St., Suite 200' }],
  },
  'iop-basepoint-arlington': {
    ...basepoint('arlington', 'Arlington'),
    locations: [
      { city: 'Arlington', state: 'TX', zip: '76018', address: '3900 Arlington Highlands Blvd., Ste. 237' },
    ],
  },
  'php-virtual-basepoint': basepoint(null, 'Virtual'),
  'iop-virtual-basepoint': basepoint(null, 'Virtual'),
  'substance-use-basepoint-academy-arlington': {
    ...basepoint('arlington', 'Arlington'),
    ages_served: '11–17',
    notes:
      'Co-occurring MH/SUD PHP/IOP; mental health must be primary. Multi-site program. Verified May 2026.',
  },

  // —— Unity ——
  'iop-unity-richardson': {
    verification_source:
      'Unity Behavioral Health contact: https://unitybehavioral.com/contact-us',
    website_url: 'https://unitybehavioral.com/contact-us',
    website: 'https://unitybehavioral.com/contact-us',
    phone: '469-940-6900',
    locations: [
      {
        city: 'Richardson',
        state: 'TX',
        zip: '75080',
        address: '660 W. Campbell Road, Suite 100',
      },
    ],
    insurance_notes:
      'Insurance not listed on public website; call 469-940-6900 to verify coverage and benefits.',
    accepted_insurance: {
      status: 'not_listed_on_website',
      last_verified: V,
      source_url: 'https://unitybehavioral.com/contact-us',
      notes: 'No payer list on contact or services pages; call to verify.',
    },
    notes:
      'IOP 3 days/week per services page. PHP listed as coming soon on website (May 2026). Hours Mon–Fri 9 AM–5 PM.',
    ...v(
      ['https://unitybehavioral.com/contact-us', 'https://unitybehavioral.com/services'],
      'partially_verified',
      'Phone and Richardson address confirmed on contact page. Insurance not published online—call to verify. PHP not yet offered per services page.',
      { phone_on_page: true, city_on_page: true },
    ),
  },

  // —— Eating disorders ——
  'eating-disorder-childrens-health-plano': {
    organization: "Children's Health",
    ages_served: 'Children & adolescents',
    phone: '469-303-4787',
    locations: [{ city: 'Plano', state: 'TX', zip: '75024', address: '7609 Preston Rd, Suite P4300' }],
    verification_source:
      "Children's Health Eating Disorders: https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology/conditions-and-programs/eating-disorders",
    website_url:
      'https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology/conditions-and-programs/eating-disorders',
    website:
      'https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology/conditions-and-programs/eating-disorders',
    insurance_notes:
      'Accepts insurance per Children’s Health; contracted plans vary by service—confirm at childrens.com billing/insurance.',
    accepted_insurance: {
      status: 'varies_by_service',
      last_verified: V,
      source_url: 'https://www.childrens.com/patient-families/billing-and-insurance',
      notes: 'Contracted plans vary; verify plan/product with Children’s Health billing.',
    },
    notes:
      'Inpatient, partial hospitalization (day treatment), and IOP for eating disorders. Plano specialty center location verified May 2026.',
    ...v(
      [
        'https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology/conditions-and-programs/eating-disorders',
        'https://www.childrens.com/patient-families/billing-and-insurance',
      ],
      'verified',
      'Program line, Plano address, and levels of care confirmed on childrens.com May 2026.',
      { phone_on_page: true, city_on_page: true },
    ),
  },
  'eating-disorder-walker-wellness-dallas': {
    verification_source: 'Walker Wellness contact: https://www.walkerwellness.com/contact-us/',
    website_url: 'https://www.walkerwellness.com/about-us/',
    website: 'https://www.walkerwellness.com/about-us/',
    phone: '214-549-2901',
    locations: [
      {
        city: 'Dallas',
        state: 'TX',
        zip: '75230',
        address: '12200 Preston Road @ Cooper Aerobics Center',
      },
    ],
    insurance_notes: 'Contact clinic for insurance and fees; not listed on public pages reviewed.',
    accepted_insurance: {
      status: 'contact_for_info',
      last_verified: V,
      source_url: 'https://www.walkerwellness.com/contact-us/',
      notes: 'Call 214-549-2901 for insurance and program availability.',
    },
    notes:
      'Outpatient and intensive outpatient eating disorder treatment at Cooper Aerobics Center. Serves adolescents and adults—confirm adolescent IOP availability by phone.',
    ...v(
      ['https://www.walkerwellness.com/about-us/', 'https://www.walkerwellness.com/contact-us/'],
      'partially_verified',
      'Address confirmed on contact/about pages. Phone widely published; call for insurance and adolescent program fit.',
      { city_on_page: true },
    ),
  },
  'eating-disorder-center-discovery-plano': {
    level_of_care: 'Residential',
    ages_served: '9–17',
    phone: '800-760-3934',
    insurance_notes:
      'Plans: Blue Cross Blue Shield, Beacon, HealthNet, Humana, Optum, TRICARE (per location page; list changes—verify).',
    accepted_insurance: {
      status: 'verified_on_website',
      last_verified: V,
      source_url: 'https://www.centerfordiscovery.com/locations/plano/',
      plans: ['Blue Cross Blue Shield', 'Beacon', 'HealthNet', 'Humana', 'Optum', 'TRICARE'],
      types: ['Commercial', 'Military (TRICARE)'],
      notes: 'Insurances accepted change frequently; use CFD insurance verification.',
    },
    notes:
      'Residential eating disorder treatment ages 9–17 at Plano location. Page also references PHP in directory context—residential is primary level listed May 2026.',
    ...v(
      'https://www.centerfordiscovery.com/locations/plano/',
      'verified',
      'Address, phone, ages 9–17, residential level, and sample payer list confirmed on centerfordiscovery.com May 2026.',
      { phone_on_page: true, city_on_page: true },
    ),
  },
  'eating-disorder-eating-recovery-center-dallas': {
    verification_source:
      'Eating Recovery Center Dallas/Plano: https://www.eatingrecoverycenter.com/recovery-centers/dallas',
    website_url: 'https://www.eatingrecoverycenter.com/recovery-centers/dallas',
    website: 'https://www.eatingrecoverycenter.com/recovery-centers/dallas',
    phone: '469-613-1722',
    locations: [{ city: 'Plano', state: 'TX', zip: '75024', address: '5120 Legacy Dr' }],
    insurance_notes: 'Contact ERC for insurance verification; admissions 877-825-8584.',
    accepted_insurance: {
      status: 'contact_for_info',
      last_verified: V,
      source_url: 'https://www.eatingrecoverycenter.com/recovery-centers/dallas',
      notes: 'Call 469-613-1722 or 877-825-8584 to verify in-network status.',
    },
    notes:
      'Child, adolescent, and adult programs. Levels include inpatient, residential, PHP, and on-site IOP per ERC Dallas page (May 2026).',
    ...v(
      [
        'https://www.eatingrecoverycenter.com/recovery-centers/dallas',
        'https://www.eatingrecoverycenter.com/child-adolescent',
      ],
      'verified',
      '5120 Legacy Dr Plano address and 469-613-1722 confirmed on eatingrecoverycenter.com May 2026.',
      { phone_on_page: true, city_on_page: true },
    ),
  },
  'eating-disorder-eating-disorder-solutions-dallas': {
    verification_source:
      'Eating Disorder Solutions locations: https://eatingdisordersolutions.com/locations/',
    website_url: 'https://eatingdisordersolutions.com/locations/dallas/',
    website: 'https://eatingdisordersolutions.com/locations/',
    insurance_notes: 'Call 855-808-4213 for insurance verification and program eligibility.',
    accepted_insurance: {
      status: 'contact_for_info',
      last_verified: V,
      source_url: 'https://eatingdisordersolutions.com/locations/',
      notes: 'Insurance verification required; primary residential campus in Weatherford.',
    },
    notes:
      'WARNING: Official site states primary residential treatment is in Weatherford, serving DFW area—not the prior Dallas Oak Lawn outpatient address. Adolescent IOP at listed Dallas address could not be confirmed May 2026. Call before referring.',
    ...v(
      [
        'https://eatingdisordersolutions.com/locations/',
        'https://eatingdisordersolutions.com/locations/dallas/',
      ],
      'unable_to_verify',
      'Oak Lawn Dallas address and adolescent IOP could not be confirmed on official website; provider directs DFW families to Weatherford residential campus.',
    ),
  },

  // —— Substance use ——
  'substance-use-childrens-health-teen-recovery-dallas': {
    ...v(
      'https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology/conditions-and-programs/teen-recovery-program',
      'verified',
      'Teen Recovery IOP ages 13–17 confirmed on Children’s Health program page May 2026.',
      { phone_on_page: true, city_on_page: true },
    ),
  },
  'substance-use-youth180-dallas': {
    phone: '214-942-5166',
    ages_served: '13–24',
    locations: [
      { city: 'Dallas', state: 'TX', zip: '75208', address: '201 S. Tyler St., Suite 100' },
    ],
    verification_source: 'Youth180 contact: https://www.youth180tx.org/contactus',
    website_url: 'https://www.youth180tx.org/contactus',
    website: 'https://www.youth180tx.org/',
    notes:
      'Outpatient substance use and mental health for youth 13–24. Hours Mon–Thu 9 AM–4 PM, Fri 9 AM–2 PM per contact page. clinical@youth180tx.org',
    ...v(
      ['https://www.youth180tx.org/contactus', 'https://www.youth180tx.org/clinical'],
      'verified',
      'Phone, address, and clinical services confirmed on youth180tx.org May 2026.',
      { phone_on_page: true, city_on_page: true },
    ),
  },
  'substance-use-grace-counseling-lewisville': {
    phone: '844-564-0712',
    locations: [
      { city: 'Lewisville', state: 'TX', zip: '75067', address: '105 Kathryn Dr, Building 3, Suite D' },
    ],
    verification_source:
      'Grace Counseling adolescent IOP: https://www.grace-counseling.com/addiction-treatment-center-programs-tx/iop-for-adolescents/',
    website_url:
      'https://www.grace-counseling.com/addiction-treatment-center-programs-tx/iop-for-adolescents/',
    website:
      'https://www.grace-counseling.com/addiction-treatment-center-programs-tx/iop-for-adolescents/',
    insurance_notes:
      'Accepts private insurance and sliding fee scale per third-party directories; call 844-564-0712 to verify your plan.',
    accepted_insurance: {
      status: 'contact_for_info',
      last_verified: V,
      source_url:
        'https://www.grace-counseling.com/addiction-treatment-center-programs-tx/iop-for-adolescents/',
      notes: 'Confirm in-network plans with admissions; sliding scale may be available.',
    },
    notes: 'Teen IOP ages 14–18 (high school). Fort Worth location also listed in directory data.',
    ...v(
      [
        'https://www.grace-counseling.com/addiction-treatment-center-programs-tx/iop-for-adolescents/',
        'https://www.grace-counseling.com/about-grace-counseling/grace-counseling-locations/lewisville/',
      ],
      'partially_verified',
      'IOP for adolescents confirmed via Grace Counseling program pages; insurance requires call.',
    ),
  },
  'substance-use-imagine-programs-plano': {
    phone: '214-385-4264',
    locations: [
      { city: 'Plano', state: 'TX', zip: '75074', address: '1947 Ave K, Suite 100' },
    ],
    verification_source: 'Imagine Programs: https://imagineprograms.net/',
    website_url: 'https://imagineprograms.net/',
    website: 'https://imagineprograms.net/',
    notes:
      'Adolescent and adult outpatient substance use treatment. Hours Mon–Fri 8 AM–5 PM. Also lists 972-423-6007 on homepage.',
    ...v('https://imagineprograms.net/', 'verified', 'Phone, address, and hours confirmed on imagineprograms.net May 2026.', {
      phone_on_page: true,
      city_on_page: true,
    }),
  },
  'substance-use-fort-behavioral-evergreen-path-fort-worth': {
    ages_served: '11–17',
    phone: '844-986-0260',
    locations: [{ city: 'Fort Worth', state: 'TX', zip: '76132', address: '7140 Oakmont Boulevard' }],
    verification_source:
      'Fort Behavioral adolescent program: https://fortbehavioral.com/adolescent-treatment-program-fort-worth-tx/',
    website_url: 'https://fortbehavioral.com/adolescent-treatment-program-fort-worth-tx/',
    notes:
      'Evergreen Path residential co-occurring program ages 11–17 (boys and girls). Must be detoxed prior to admission.',
    ...v(
      [
        'https://fortbehavioral.com/adolescent-treatment-program-fort-worth-tx/',
        'https://fortbehavioral.com/contact-fort-behavioral-health-texas/',
      ],
      'partially_verified',
      'Program and address confirmed on fortbehavioral.com; insurance requires call.',
    ),
  },
  'substance-use-cenikor-odyssey-house-houston': {
    ages_served: '13–17',
    phone: '888-236-4567',
    ...v(
      'https://www.cenikor.org/adolescent-services/',
      'partially_verified',
      'Adolescent services page confirms ages 13–17; call admissions for Houston/Odyssey House placement and insurance.',
    ),
  },
  'substance-use-sundown-ranch-canton': {
    phone: '903-479-3933',
    locations: [
      { city: 'Canton', state: 'TX', zip: '75103', address: '3120 VZ County Road 2318, Ste. 100' },
    ],
    verification_source: 'Sundown Ranch contact: https://sundownranchinc.com/contact/',
    website_url: 'https://sundownranchinc.com/contact/',
    notes: 'Residential adolescent substance use treatment ages 13–17.',
    ...v('https://sundownranchinc.com/contact/', 'verified', 'Phone and Canton address confirmed on sundownranchinc.com May 2026.', {
      phone_on_page: true,
      city_on_page: true,
    }),
  },
  'substance-use-clearfork-academy-fort-worth': {
    ages_served: '13–18',
    phone: '866-650-5212',
    verification_source: 'Clearfork Academy: https://clearforkacademy.com/contact/',
    website_url: 'https://clearforkacademy.com/',
    insurance_notes:
      'States most major insurance, Medicaid, TRICARE on third-party profiles—call 866-650-5212 to verify.',
    notes:
      'Residential treatment for adolescent males (primary Fort Worth campus); separate Cleburne campus for girls per provider materials.',
    ...v(
      ['https://clearforkacademy.com/contact/', 'https://clearforkacademy.com/admissions/'],
      'partially_verified',
      'Phone and Fort Worth address align with clearforkacademy.com; insurance and gender-specific campus—call admissions.',
    ),
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
    const merged = { ...p, ...patch };
    if (patch.accepted_insurance && p.accepted_insurance && !patch.accepted_insurance.plans) {
      merged.accepted_insurance = { ...p.accepted_insurance, ...patch.accepted_insurance };
    } else if (patch.accepted_insurance) {
      merged.accepted_insurance = patch.accepted_insurance;
    }
    if (patch.locations) merged.locations = patch.locations;
    return merged;
  });
  if (rel.includes('programs.json')) {
    data.metadata = {
      ...data.metadata,
      last_internet_verification: V,
      last_internet_verification_notes:
        'Manual verification against official provider websites; see scripts/internet-verification-report-may2026.json',
    };
  }
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`${rel}: updated ${n} programs`);
}

console.log(`Internet verification patches applied (${Object.keys(PATCHES).length} program IDs).`);
