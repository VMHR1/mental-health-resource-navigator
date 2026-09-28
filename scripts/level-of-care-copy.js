/**
 * Level-of-care explainer copy for program detail pages (spec 1.1,
 * docs/superpowers/specs/2026-09-27-program-page-content-design.md).
 *
 * Single source for the "What [level] means for your family" section.
 * General statements about each care level only — never claims about a
 * specific program. Informational, not medical advice.
 *
 * STATUS: DRAFT wording, pending owner (Jared) approval before Phase 1 ships.
 *
 * The 10 raw `level_of_care` values in public/data/programs.json map to 7
 * explainers. A value with no mapping returns null (renders no explainer);
 * scripts/validate-data.js warns about it.
 */

const GUIDE_HREF = '/guide-levels-of-care';

const EXPLAINERS = {
  php: {
    title: 'What PHP means for your family',
    body:
      'A partial hospitalization program (PHP) is one of the most intensive kinds of care where your child still sleeps at home. ' +
      'Many programs run for most of the weekday, often about five to six hours a day, several days a week. ' +
      'A typical day mixes group therapy, individual or family sessions, and check-ins with a psychiatrist or nurse, and some programs include time for schoolwork. ' +
      'PHP is often used as a step down after a hospital stay, or to give your child more support in the hope of avoiding one.',
  },
  iop: {
    title: 'What IOP means for your family',
    body:
      'An intensive outpatient program (IOP) gives more support than a weekly therapy visit while your child keeps up with school and home life. ' +
      'Many programs meet a few days a week for about three hours at a time, often in the afternoon or evening. ' +
      'Sessions are usually built around group therapy, with regular family involvement and check-ins about medication. ' +
      'Children and teens often move into IOP after PHP or a hospital stay, or start here when weekly therapy is not enough.',
  },
  residential: {
    title: 'What residential treatment means for your family',
    body:
      'In residential treatment, your child lives at the program and has care and supervision around the clock. ' +
      'It is typically for children and teens who need more support than they can safely get while living at home. ' +
      'Days usually follow a set routine of therapy, school, and daily activities, with family sessions and visits built in. ' +
      "Stays often last several weeks to a few months, depending on the program and your child's needs.",
  },
  outpatient: {
    title: 'What outpatient care means for your family',
    body:
      'Outpatient care means scheduled visits, such as therapy or medication management, while your child lives at home and goes to school as usual. ' +
      'Visits are often weekly or every other week and typically last about an hour. ' +
      'Some clinics also see walk-in patients, which can help when you need to be seen sooner than a regular appointment allows. ' +
      'Outpatient care is often the next step after a more intensive program, or a starting point when concerns are milder.',
  },
  navigation: {
    title: 'What a navigation service means for your family',
    body:
      'A navigation service does not provide treatment itself. ' +
      'Instead, it helps your family figure out what kind of care fits and how to get it, such as finding programs, understanding insurance, or connecting with local resources. ' +
      'This can help when you are not sure where to start or are trying to line up care after a hospital stay. ' +
      'Services vary, so ask what they can help with when you call.',
  },
  crisisInPerson: {
    title: 'What in-person crisis care means for your family',
    body:
      "In-person crisis services help when your child's mental health needs attention right away. " +
      'Depending on the service, a trained team may come to your home or another location, or you may bring your child in for an urgent evaluation. ' +
      'Staff typically check on safety, help calm the situation, and connect your family to next steps for ongoing care. ' +
      'If your child is in immediate danger, call 911, and for urgent support at any hour, call or text 988.',
  },
  crisisPhoneText: {
    title: 'What a crisis line means for your family',
    body:
      'A crisis line lets you or your child talk with a trained counselor by phone, text, or chat, often at any hour. ' +
      'You do not need to be in immediate danger to reach out, and many people call when they are worried, overwhelmed, or unsure what to do next. ' +
      'Counselors listen, help with safety, and can point you to local services. ' +
      'You can call or text 988 at any time, and if someone is in immediate danger, call 911.',
  },
};

for (const e of Object.values(EXPLAINERS)) {
  e.guideHref = GUIDE_HREF;
  Object.freeze(e);
}

/** Raw `level_of_care` value (as it appears in programs.json) -> explainer key. */
const LEVEL_TO_EXPLAINER = {
  'Partial Hospitalization (PHP)': 'php',
  'Intensive Outpatient (IOP)': 'iop',
  Residential: 'residential',
  Outpatient: 'outpatient',
  'Walk-In Outpatient': 'outpatient',
  Navigation: 'navigation',
  'Mobile Crisis': 'crisisInPerson',
  'Walk-In Crisis / Urgent': 'crisisInPerson',
  'Psychiatric Triage': 'crisisInPerson',
  'Crisis Hotline': 'crisisPhoneText',
};

/**
 * @param {string} levelOfCare raw `level_of_care` value from programs.json
 * @returns {{ title: string, body: string, guideHref: string } | null}
 */
export function explainerFor(levelOfCare) {
  if (typeof levelOfCare !== 'string') return null;
  if (!Object.hasOwn(LEVEL_TO_EXPLAINER, levelOfCare)) return null;
  return EXPLAINERS[LEVEL_TO_EXPLAINER[levelOfCare]];
}
