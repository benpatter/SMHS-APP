/**
 * The school's "Who to Contact" directory, transcribed from
 * https://www.smhs.org/about/who-do-i-contact-clone
 *
 * Names, emails, phones and extensions are exactly what that page publishes —
 * including a few of its own quirks (Campus Ministry lists cutchert@smhs.org
 * for both De Vera and Cutcher; Performing Arts links johnsonm@smhs.org).
 * Correct them here when the school corrects them, not in the page component.
 */

export type Contact = {
  /** Stable id so an admin edit addresses one row, not a position. */
  id: string;
  /** Person or office to reach. */
  name: string;
  /** Title, or the office they answer for. */
  role?: string;
  email?: string;
  /** As printed by the school, e.g. '949-766-6090'. */
  phone?: string;
  /** Extension dialed after the main line. */
  ext?: string;
  /** External page to open instead of (or alongside) a call/email. */
  url?: string;
  urlLabel?: string;
};

export type ContactEntry = {
  id: string;
  /** What you're trying to do — the thing students and parents search for. */
  topic: string;
  /** Escalation ladder: start at step one, move down only if unresolved. */
  steps?: string[];
  /** Plain guidance when there's no person to call. */
  note?: string;
  contacts?: Contact[];
  /** Things this office handles, listed on the school's page. */
  handles?: string[];
  /** Extra search terms that don't appear in the visible text. */
  keywords?: string[];
  /** Hidden by an admin: kept out of the student directory until restored. */
  hidden?: boolean;
};

export type ContactGroup = {
  id: string;
  title: string;
  entries: ContactEntry[];
};

/**
 * The seed below is written without ids (they'd be noise to hand-maintain) and
 * stamped on load. Ids derive from the group + topic so they stay stable across
 * rebuilds; once an administrator publishes an edit, the server's copy carries
 * these ids forward.
 */
type RawContact = Omit<Contact, 'id'>;
type RawEntry = Omit<ContactEntry, 'id' | 'contacts'> & { contacts?: RawContact[] };
type RawGroup = { id: string; title: string; entries: RawEntry[] };

export function contactSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function stampIds(groups: RawGroup[]): ContactGroup[] {
  return groups.map((g) => ({
    ...g,
    entries: g.entries.map((e) => {
      const id = `${g.id}-${contactSlug(e.topic)}`;
      return { ...e, id, contacts: e.contacts?.map((c, i) => ({ ...c, id: `${id}-${i}` })) };
    }),
  }));
}

/** tel: href for a printed number, with the extension dropped (can't be dialed). */
export function contactTel(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `tel:+1${digits.slice(-10)}`;
}

/** '949-766-6000' + ext '4067' -> '949-766-6000 ext. 4067' */
export function contactPhoneLabel(c: Contact): string {
  if (!c.phone) return '';
  return c.ext ? `${c.phone} ext. ${c.ext}` : c.phone;
}

export const MAIN_OFFICE = {
  address: '22062 Antonio Parkway, Rancho Santa Margarita, CA 92688',
  phone: '949-766-6000',
  fax: '949-766-6005',
  directoryUrl: 'https://www.smhs.org/about/facultystaff',
  guideUrl: 'https://www.smhs.org/about/who-do-i-contact-clone',
};

/** The school points parents here first when they don't know who to ask. */
export const PARENT_LIAISON: Contact = {
  id: 'parent-liaison',
  name: 'Lori Evers',
  role: 'Parent Liaison',
  email: 'eversl@smhs.org',
  phone: '949-766-6009',
};

/** Ids of the two seeded School Office topics the Contacts page gives its own cards. */
export const SCHOOL_OFFICE_GROUP_ID = 'school-office';
export const MAIN_OFFICE_ENTRY_ID = 'school-office-main-office';
export const PARENT_LIAISON_ENTRY_ID = 'school-office-not-sure-who-to-ask';

const RAW_GROUPS: RawGroup[] = [
  {
    // The school itself. Seeded as a normal group so administrators can correct
    // the address, the main line, and the Parent Liaison in /admin/contacts.
    id: 'school-office',
    title: 'School Office',
    entries: [
      {
        topic: 'Not sure who to ask',
        note: 'The Parent Liaison helps with anything that comes up during the year.',
        contacts: [
          {
            name: PARENT_LIAISON.name,
            role: PARENT_LIAISON.role,
            email: PARENT_LIAISON.email,
            phone: PARENT_LIAISON.phone,
          },
        ],
        keywords: ['parent liaison', 'who do i ask', 'help'],
      },
      {
        topic: 'Main Office',
        note: `${MAIN_OFFICE.address} · Fax ${MAIN_OFFICE.fax}`,
        contacts: [
          { name: 'Main office', phone: MAIN_OFFICE.phone },
          {
            name: 'Faculty & Staff Directory',
            url: MAIN_OFFICE.directoryUrl,
            urlLabel: 'Look up anyone at SMCHS',
          },
        ],
        keywords: ['address', 'fax', 'front office', 'directory', 'phone number'],
      },
    ],
  },
  {
    id: 'academics',
    title: 'Academics',
    entries: [
      {
        topic: 'Concern about a teacher or a class',
        steps: [
          'Talk to the teacher first.',
          'Not resolved? Email the department chair for that subject.',
          'Still not resolved? Contact the Registrar. For a concern about a particular class, contact your counselor.',
        ],
        contacts: [
          { name: 'Roza McCartan', role: 'Registrar', email: 'mccartanr@smhs.org', phone: '949-766-6090' },
        ],
        keywords: ['complaint', 'grade dispute', 'problem'],
      },
      {
        topic: 'What a class covers, or the material it uses',
        steps: ['Email the teacher first.', 'Not resolved? Email the department chair below.'],
        contacts: [
          { name: 'Tammy Thilken', role: 'English', email: 'thilkent@smhs.org' },
          { name: 'Noah Loungarikis', role: 'Math', email: 'loungarikisn@smhs.org' },
          { name: 'Francisco Calvo', role: 'Performing Arts', email: 'johnsonm@smhs.org' },
          { name: 'Ann Nunes', role: 'Religion', email: 'Nunesa@smhs.org' },
          { name: 'Karen Crede', role: 'Science & Health', email: 'credek@smhs.org' },
          { name: 'Tessa Fleming', role: 'Social Studies', email: 'flemingt@smhs.org' },
          { name: 'Pamela Toomey', role: 'Visual Arts', email: 'toomeyp@smhs.org' },
          { name: 'Thomas Gerlach', role: 'World Language', email: 'gerlacht@smhs.org' },
        ],
        keywords: ['department chair', 'curriculum', 'syllabus', 'books'],
      },
      {
        topic: 'Homework while you are absent',
        note: 'Check the assignment in Microsoft Teams and OneNote. If it is not posted, email the teacher.',
        keywords: ['missing work', 'sick', 'makeup'],
      },
      {
        topic: 'Standardized testing',
        note: 'Check the college counseling page, then ask your counselor if you still need more.',
        contacts: [{ name: 'Counseling Office', email: 'labc@smhs.org', phone: '949-766-6010' }],
        keywords: ['SAT', 'ACT', 'PSAT', 'college board'],
      },
      {
        topic: 'Learning disabilities and academic support',
        contacts: [
          {
            name: 'Suzy Cutter',
            role: 'Director, Auxiliary Studies Program (ASP)',
            email: 'cutters@smhs.org',
            phone: '949-766-6085',
          },
        ],
        keywords: ['ASP', 'accommodations', 'IEP', '504'],
      },
      {
        topic: 'Model United Nations (MUN)',
        contacts: [
          {
            name: 'John Remmell',
            role: 'Social Studies Teacher',
            email: 'remmell@smhs.org',
            phone: '949-766-6000',
            ext: '4067',
          },
        ],
      },
      {
        topic: 'International Baccalaureate (IB)',
        contacts: [{ name: 'Carly Gordon', email: 'gordonc@smhs.org' }],
      },
      {
        topic: 'Advanced Placement (AP)',
        contacts: [{ name: 'Seyram Bell', email: 'bells@smhs.org', phone: '949-766-6068' }],
      },
      {
        topic: 'National Honor Society (NHS)',
        contacts: [
          {
            name: 'Mark Van Ness',
            role: 'Science Teacher',
            email: 'vannessm@smhs.org',
            phone: '949-766-6000',
            ext: '4064',
          },
        ],
      },
      {
        topic: 'California Scholarship Federation (CSF)',
        contacts: [
          { name: 'Eva Hester', email: 'hestere@smhs.org', phone: '949-766-6010', ext: '1069' },
        ],
      },
      {
        topic: 'Ed tech and the One-to-One Tablet PC program',
        contacts: [
          {
            name: 'Jorge Ledezma',
            role: 'Director of Educational Technology',
            email: 'ledezmaj@smhs.org',
            phone: '949-766-6000',
            ext: '1082',
          },
        ],
      },
      {
        topic: 'Tech support for your tablet',
        note: 'Walk into the Tech Center in the Borchard Library Media Center, or email them.',
        contacts: [
          {
            name: 'Tech Center',
            role: 'Borchard Library Media Center',
            email: 'technologyservicecenter@smhs.org',
          },
        ],
        keywords: ['broken laptop', 'repair', 'surface', 'wifi'],
      },
    ],
  },
  {
    id: 'activities',
    title: 'Activities',
    entries: [
      {
        topic: 'Clubs, ASB, dances, and senior events',
        contacts: [
          { name: 'Activities Office', email: 'activities@smhs.org', phone: '949-766-6050' },
        ],
        handles: [
          'Student Council (ASB)',
          'Extracurricular clubs and activities',
          'Dance tickets',
          'ETV announcements',
          'Senior events',
        ],
        keywords: ['prom', 'homecoming', 'winter formal'],
      },
    ],
  },
  {
    id: 'attendance',
    title: 'Attendance & Dean',
    entries: [
      {
        topic: 'Absences, dress code, discipline, parking, lockers',
        contacts: [{ name: "Attendance / Dean's Office", phone: '949-766-6020' }],
        handles: [
          'Absence and tardiness',
          'Dress code',
          'Detentions',
          'Disciplinary problems and suspensions',
          'Theft and vandalism',
          'Parking permits',
          'Locker issues',
        ],
        keywords: ['tardy', 'late', 'suspension', 'detention', 'uniform violation'],
      },
    ],
  },
  {
    id: 'athletics',
    title: 'Athletics',
    entries: [
      {
        topic: 'Concern about a coach',
        steps: ['Talk to the coach first.', 'Not resolved? Email or call the Athletic Director.'],
        contacts: [
          {
            name: 'Annie Garrett',
            role: 'Athletic Director',
            email: 'garretta@smhs.org',
            phone: '949-766-1065',
          },
        ],
      },
      {
        topic: 'Athletic eligibility',
        note: 'Ask the head coach of the team.',
      },
      {
        topic: 'Physicals and team forms',
        contacts: [{ name: 'Athletic Department Trainers', phone: '949-766-2212' }],
        keywords: ['clearance', 'physical form'],
      },
      {
        topic: 'Athletic tickets',
        contacts: [{ name: 'Athletic Office', phone: '949-766-6065' }],
      },
      {
        topic: "You didn't make a team and want to know why",
        note: 'Contact the head coach of the team.',
        keywords: ['cut', 'tryouts'],
      },
      {
        topic: 'Sports calendar and season start and end dates',
        contacts: [
          { name: 'Athletic Office', email: 'mcgregord@smhs.org', phone: '949-766-6065' },
        ],
      },
    ],
  },
  {
    id: 'business',
    title: 'Business Office',
    entries: [
      {
        topic: 'Tuition payments',
        contacts: [{ name: 'Kim Read', email: 'readk@smhs.org', phone: '949-766-6055' }],
        keywords: ['billing', 'invoice', 'FACTS'],
      },
      {
        topic: 'Tuition assistance',
        contacts: [
          { name: 'Juliana Treadway', email: 'treadwayj@smhs.org', phone: '949-766-6051' },
        ],
        keywords: ['financial aid', 'scholarship'],
      },
    ],
  },
  {
    id: 'campus-ministry',
    title: 'Campus Ministry',
    entries: [
      {
        topic: 'Campus Ministry',
        contacts: [
          {
            name: 'Patrick Visconti',
            email: 'viscontip@smhs.org',
            phone: '949-766-6000',
            ext: '1513',
          },
        ],
        keywords: ['mass', 'liturgy', 'prayer'],
      },
      {
        topic: 'Class retreats and Kairos',
        contacts: [
          {
            name: 'Chris De Vera',
            email: 'cutchert@smhs.org',
            phone: '949-766-6000',
            ext: '1517',
          },
        ],
      },
      {
        topic: 'Christian Service',
        contacts: [
          { name: 'Tori Cutcher', email: 'cutchert@smhs.org', phone: '949-766-6000', ext: '1514' },
        ],
        keywords: ['service hours', 'volunteer'],
      },
    ],
  },
  {
    id: 'counseling',
    title: 'Counseling',
    entries: [
      {
        topic: 'Your class schedule, or how you are doing',
        steps: ['Start with your counselor.'],
        contacts: [
          { name: 'Counseling Office', email: 'labc@smhs.org', phone: '949-766-6010' },
          {
            name: 'Wellness Program',
            url: 'https://www.smhs.org/campus-life/wellnesspage/wellness',
            urlLabel: 'Open the Wellness page',
          },
        ],
        keywords: ['mental health', 'schedule change', 'drop a class', 'stress'],
      },
      {
        topic: 'Tutors',
        note: 'Pick up the list of faculty tutors in the Counseling Office. NHS student tutoring runs in the Library during Academic Periods, starting mid-September.',
      },
      {
        topic: 'Work permits',
        note: 'Once you have a job, download the work permit form, have your employer complete and sign their part, then bring it to the Counseling Department to be signed and certified.',
        contacts: [
          {
            name: 'Cecilia Alsing',
            role: 'Counseling Department',
            email: 'alsingc@smhs.org',
            phone: '949-766-6011',
          },
        ],
        keywords: ['job', 'employment'],
      },
    ],
  },
  {
    id: 'communications',
    title: 'Communications',
    entries: [
      {
        topic: 'Website, newsletter, and news stories',
        contacts: [
          { name: 'Communications Office', email: 'pr@smhs.org', phone: '949-766-6000', ext: '1518' },
        ],
        handles: [
          "The school's website",
          'Receiving the weekly e-newsletter',
          'Publicizing newsworthy stories and information',
        ],
        keywords: ['press', 'media', 'e-newsletter'],
      },
      {
        topic: 'Logo usage',
        contacts: [
          { name: 'Teri Beauchamp', email: 'beauchampt@smhs.org', phone: '949-766-1077' },
        ],
        keywords: ['brand', 'graphics', 'trademark'],
      },
    ],
  },
  {
    id: 'nurse',
    title: "Nurse's Office",
    entries: [
      {
        topic: 'Illness, injury, and medication at school',
        contacts: [
          {
            name: 'Rebecca Wood / Lisa Volpo',
            role: 'Nursing',
            email: 'deptofnursing@smhs.org',
            phone: '949-766-6029',
          },
        ],
        handles: [
          'Report an accident',
          'First aid during school',
          'PE illness excuses',
          'Medication at school release forms',
          'Illness related questions',
        ],
        keywords: ['sick', 'health', 'injury', 'medicine'],
      },
    ],
  },
  {
    id: 'registrar',
    title: 'Registrar',
    entries: [
      {
        topic: 'Records, transcripts, and report cards',
        contacts: [
          { name: 'Roza McCartan', role: 'Registrar', email: 'mccartanr@smhs.org', phone: '949-766-6090' },
        ],
        handles: ['School records', 'Change of address or email', 'Report cards'],
        keywords: ['transcript', 'grades record'],
      },
    ],
  },
  {
    id: 'student-services',
    title: 'Student Services',
    entries: [
      {
        topic: 'School calendar and Aeries student codes',
        contacts: [{ name: 'Kim Howard', email: 'howardk@smhs.org', phone: '949-713-4300' }],
        handles: ['The school calendar', 'Student codes to log into Aeries'],
        keywords: ['login', 'portal', 'password'],
      },
    ],
  },
  {
    id: 'eagle-foundation',
    title: 'Eagle Foundation & Alumni',
    entries: [
      {
        topic: 'Donations, fundraising, and scholarships',
        contacts: [
          {
            name: 'Santa Margarita Eagle Foundation',
            email: 'advancement@smeaglefoundation.org',
            phone: '949-766-6080',
          },
        ],
        handles: ['Fundraising', 'Donations', 'Supporting SMCHS', 'Scholarships'],
      },
      {
        topic: 'Alumni, reunions, and Class Notes',
        contacts: [
          {
            name: 'Alumni Office',
            email: 'alumni@smeaglefoundation.org',
            phone: '949-766-6000',
            ext: '1165',
          },
        ],
        handles: [
          'Reunions',
          'Getting involved as a graduate',
          'Updating alumni contact information',
          'Submitting a Class Note for Wings magazine',
        ],
      },
    ],
  },
  {
    id: 'campus',
    title: 'Around Campus',
    entries: [
      {
        topic: 'Uniforms',
        contacts: [{ name: 'Campus Store', phone: '949-766-6075' }],
        keywords: ['dress code', 'polo', 'PE clothes'],
      },
      {
        topic: 'Library',
        contacts: [{ name: 'Library', phone: '949-766-6070' }],
      },
      {
        topic: 'School books',
        contacts: [
          { name: 'eCampus', url: 'https://smhs.ecampus.com/', urlLabel: 'Open the bookstore' },
        ],
        keywords: ['textbooks', 'rental'],
      },
      {
        topic: 'Lost and found',
        contacts: [{ name: 'Welcome Center', phone: '949-766-6000', ext: '1147' }],
      },
      {
        topic: 'Yearbook',
        contacts: [
          {
            name: 'Todd Naylor',
            role: 'Yearbook Coordinator',
            email: 'yearbook@smhs.org',
            phone: '949-766-6000',
            ext: '4050',
          },
        ],
      },
      {
        topic: 'Facilities reservations',
        contacts: [
          {
            name: 'Facilities',
            email: 'facilitiesreservations@smhs.org',
            phone: '949-766-6000',
            ext: '1525',
          },
        ],
        keywords: ['book a room', 'gym', 'field'],
      },
    ],
  },
  {
    id: 'admissions',
    title: 'Admissions',
    entries: [
      {
        topic: 'Applying, transferring, and placement exams',
        contacts: [
          { name: 'Admissions Office', email: 'admissions@smhs.org', phone: '949-766-6076' },
        ],
        handles: [
          'Prospective students',
          'Transfer students',
          'Admission procedures',
          'Freshman placement exam dates',
        ],
      },
      {
        topic: 'International students',
        contacts: [{ name: 'Joy Francis', email: 'francisj@smhs.org', phone: '949-766-6076' }],
        keywords: ['visa', 'exchange'],
      },
    ],
  },
];

export const CONTACT_GROUPS: ContactGroup[] = stampIds(RAW_GROUPS);
