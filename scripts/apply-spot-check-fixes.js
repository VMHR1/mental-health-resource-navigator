#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const VERIFIED = '2026-05-17';

/** @type {Record<string, object>} */
const PATCHES = {
  'eating-disorder-childrens-health-plano': {
    phone: '469-303-4787',
    verification_source:
      "Children's Health Eating Disorders Program: https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology/conditions-and-programs/eating-disorders",
    website: 'https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology/conditions-and-programs/eating-disorders',
    website_url:
      'https://www.childrens.com/specialties-services/specialty-centers-and-programs/psychiatry-and-psychology/conditions-and-programs/eating-disorders',
    website_domain: 'childrens.com',
    locations: [
      {
        city: 'Plano',
        state: 'TX',
        zip: '75024',
        address: '7609 Preston Rd, Suite P4300',
      },
    ],
    notes:
      "Services: Partial (day treatment), Intensive Outpatient, Inpatient Children's Eating Disorders Program. Program line verified on Children's Health eating disorders page (May 2026).",
  },
  'eating-disorder-center-discovery-plano': {
    verification_source: 'Center for Discovery Plano: https://www.centerfordiscovery.com/locations/plano/',
    website: 'https://www.centerfordiscovery.com/locations/plano/',
    website_url: 'https://www.centerfordiscovery.com/locations/plano/',
    website_domain: 'centerfordiscovery.com',
    ages_served: '9-17',
    notes:
      'Services: Residential Program and Partial Hospitalization Program for children ages 9-17 who have been diagnosed with an eating disorder. Prior domain centerfordiscoveryplano.com is a stub; canonical location page is centerfordiscovery.com/locations/plano/ (May 2026).',
  },
  'eating-disorder-eating-recovery-center-dallas': {
    verification_source:
      'Eating Recovery Center of Dallas: https://www.eatingrecoverycenter.com/locations/dallas/',
    website: 'https://www.eatingrecoverycenter.com/locations/dallas/',
    website_url: 'https://www.eatingrecoverycenter.com/locations/dallas/',
    notes:
      'Services: 7 day per week Partial Hospitalization Program and three day per week Intensive Outpatient Program for children ages 10 and older with anorexia, bulimia and binge eating disorders. Plano/Dallas location page verified May 2026.',
  },
  'substance-use-cenikor-odyssey-house-houston': {
    phone: '888-236-4567',
    verification_source:
      'Cenikor Odyssey House adolescent services: https://www.cenikor.org/adolescent-services/',
    website: 'https://www.cenikor.org/adolescent-services/',
    website_url: 'https://www.cenikor.org/adolescent-services/',
    website_domain: 'cenikor.org',
    notes:
      'Residential treatment and outpatient programming for adolescents, ages 13-17, at 5629 Grapevine St, Houston. Previously linked to unrelated Houston Recovery Center site; corrected to Cenikor May 2026.',
  },
  'substance-use-carrus-cares-plano': {
    organization: 'Carrus Care Plano',
    verification_source: 'https://www.carruscarebehavioral.com/plano',
    website: 'https://www.carruscarebehavioral.com/plano',
    website_url: 'https://www.carruscarebehavioral.com/plano',
    website_domain: 'carruscarebehavioral.com',
    accepted_insurance: {
      status: 'verified_on_website',
      last_verified: VERIFIED,
      source_url: 'https://www.carruscarebehavioral.com/plano',
      types: ['Commercial (all)', 'Medicaid/CHIP', 'Military (TRICARE)'],
    },
    notes:
      'Intensive Outpatient Program and Partial Hospitalization Program for teens with co-occurring mental health and substance use disorders, ages 12-17. Accepts all insurance including Medicaid and Tricare. Mental health must be the primary issue. Location page: carruscarebehavioral.com/plano (May 2026).',
  },
  'substance-use-grace-counseling-lewisville': {
    verification_source: 'Grace Counseling teen IOP Lewisville: https://www.grace-counseling.com/teen-iop-lewisville/',
    website: 'https://www.grace-counseling.com/teen-iop-lewisville/',
    website_url: 'https://www.grace-counseling.com/teen-iop-lewisville/',
    accepted_insurance: {
      status: 'contact_for_info',
      last_verified: VERIFIED,
      source_url: 'https://www.grace-counseling.com/teen-iop-lewisville/',
      notes: 'Confirm in-network plans with admissions; website does not publish an up-to-date payer list.',
      types: [],
    },
  },
  'php-connections-denton': {
    phone: '940-239-3578',
    verification_source: 'https://connectionswellnessgroup.com/denton/',
    website: 'https://connectionswellnessgroup.com/denton/',
    website_url: 'https://connectionswellnessgroup.com/denton/',
    locations: [
      {
        city: 'Denton',
        state: 'TX',
        zip: '76210',
        address: '2711 Shoreline Dr., Ste. 121',
      },
    ],
  },
  'iop-connections-denton': {
    phone: '940-239-3578',
    verification_source: 'https://connectionswellnessgroup.com/denton/',
    website: 'https://connectionswellnessgroup.com/denton/',
    website_url: 'https://connectionswellnessgroup.com/denton/',
    locations: [
      {
        city: 'Denton',
        state: 'TX',
        zip: '76210',
        address: '2711 Shoreline Dr., Ste. 121',
      },
    ],
  },
  'osar-mhmr-tarrant-county': {
    verification_source: 'MHMR of Tarrant County substance use / OSAR: https://mhmrtarrant.org/addiction-services/',
    website: 'https://mhmrtarrant.org/addiction-services/',
    website_url: 'https://mhmrtarrant.org/addiction-services/',
    notes:
      'Covers Cooke, Denton, Erath, Fannin, Grayson, Hood, Johnson, Palo Pinto, Parker, Somervell, Tarrant and Wise Counties. For substance use screening/referral (OSAR), use MHMR addiction services line. Crisis/ICARE: 800-866-2465 (listed separately as crisis-mcot-icare-tarrant). Recovery Resource Council OSAR: 817-332-6329 (separate listing). Verified May 2026.',
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
    if (patch.accepted_insurance && p.accepted_insurance) {
      merged.accepted_insurance = { ...p.accepted_insurance, ...patch.accepted_insurance };
    }
    if (patch.locations) merged.locations = patch.locations;
    return merged;
  });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`${rel}: patched ${n}`);
}

writeFileSync(
  join(rootDir, 'scripts/spot-check-25-summary.json'),
  JSON.stringify(
    {
      reviewed_at: new Date().toISOString(),
      total: 25,
      data_fixes_applied: Object.keys(PATCHES),
      confirmed_ok_after_fix: [
        'php-connections-denton',
        'iop-connections-denton',
      ],
      confirmed_ok: [
        'php-carrus-frisco',
        'php-carrus-mckinney',
        'php-carrus-sherman',
        'iop-carrus-frisco',
        'iop-carrus-mckinney',
        'iop-carrus-sherman',
        'iop-unity-richardson',
        'crisis-mcot-ntbha',
        'crisis-mcot-denton-mhmr',
        'crisis-mcot-icare-tarrant',
        'crisis-988',
        'crisis-textline-741741',
        'eating-disorder-walker-wellness-dallas',
        'eating-disorder-center-discovery-plano',
        'substance-use-basepoint-academy-arlington',
        'substance-use-clearfork-academy-fort-worth',
      ],
      removed_programs: ['substance-use-newport-academy-dallas'],
    },
    null,
    2,
  ),
);

console.log('Spot-check fixes applied.');
