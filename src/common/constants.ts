// Business constants shared by pricing, validation and the `meta` query.

export interface PickupLocation {
  code: string;
  name: string;
  address: string;
  branch: string;
  branch_code: string;
}

// Alldrive branches: Butuan, Cagayan de Oro and Davao. Each branch serves its city and airport.
export const PICKUP_LOCATIONS: PickupLocation[] = [
  {
    code: 'butuan-city',
    name: 'Butuan City',
    address: 'Butuan, Agusan del Norte, 8600',
    branch: 'Butuan',
    branch_code: 'butuan',
  },
  {
    code: 'butuan-airport',
    name: 'Butuan-Bancasi Airport',
    address: 'BXU, Butuan, Agusan del Norte, 8600',
    branch: 'Butuan',
    branch_code: 'butuan',
  },
  {
    code: 'cagayan-de-oro-city',
    name: 'Cagayan de Oro City',
    address: 'Cagayan de Oro, Misamis Oriental, 9000',
    branch: 'Cagayan de Oro',
    branch_code: 'cagayan-de-oro',
  },
  {
    code: 'laguindingan-airport',
    name: 'Laguindingan Airport',
    address: 'CGY, Laguindingan, Misamis Oriental, 9019',
    branch: 'Cagayan de Oro',
    branch_code: 'cagayan-de-oro',
  },
  {
    code: 'davao-city',
    name: 'Davao City',
    address: 'Davao City, Davao del Sur, 8000',
    branch: 'Davao',
    branch_code: 'davao',
  },
  {
    code: 'davao-airport',
    name: 'Davao International Airport',
    address: 'DVO, Davao City, Davao del Sur, 8000',
    branch: 'Davao',
    branch_code: 'davao',
  },
];

export const LOCATION_CODES = PICKUP_LOCATIONS.map((loc) => loc.code);
export const LOCATION_BRANCH: Record<string, string> = Object.fromEntries(
  PICKUP_LOCATIONS.map((loc) => [loc.code, loc.branch_code]),
);

/** The pickup points of a branch, e.g. "davao" -> ["davao-city", "davao-airport"]. */
export function branchLocations(branch: string): string[] {
  return PICKUP_LOCATIONS.filter((l) => l.branch_code === branch).map(
    (l) => l.code,
  );
}

// Where each car is parked and picked up from
export const BRANCHES = [
  { code: 'butuan', name: 'Butuan', city: 'Butuan City' },
  {
    code: 'cagayan-de-oro',
    name: 'Cagayan de Oro',
    city: 'Cagayan de Oro City',
  },
  { code: 'davao', name: 'Davao', city: 'Davao City' },
];
export const BRANCH_CODES = BRANCHES.map((b) => b.code);
export const BRANCH_NAMES: Record<string, string> = Object.fromEntries(
  BRANCHES.map((b) => [b.code, b.name]),
);
export const DEFAULT_BRANCH = 'butuan';

// Mindanao regions and their provinces and cities (branch cities are listed on their own)
const REGIONS: Record<string, string[]> = {
  Caraga: [
    'Agusan del Norte',
    'Agusan del Sur',
    'Dinagat Islands',
    'Surigao del Norte',
    'Surigao del Sur',
    'Bayugan City',
    'Bislig City',
    'Cabadbaran City',
    'Surigao City',
    'Tandag City',
  ],
  'Northern Mindanao': [
    'Bukidnon',
    'Camiguin',
    'Lanao del Norte',
    'Misamis Occidental',
    'Misamis Oriental',
    'El Salvador City',
    'Gingoog City',
    'Iligan City',
    'Malaybalay City',
    'Oroquieta City',
    'Ozamiz City',
    'Tangub City',
    'Valencia City',
  ],
  'Davao Region': [
    'Davao de Oro',
    'Davao del Norte',
    'Davao del Sur',
    'Davao Occidental',
    'Davao Oriental',
    'Digos City',
    'Mati City',
    'Panabo City',
    'Samal City',
    'Tagum City',
  ],
  SOCCSKSARGEN: [
    'Cotabato',
    'Sarangani',
    'South Cotabato',
    'Sultan Kudarat',
    'General Santos City',
    'Kidapawan City',
    'Koronadal City',
    'Tacurong City',
  ],
  'Zamboanga Peninsula': [
    'Zamboanga del Norte',
    'Zamboanga del Sur',
    'Zamboanga Sibugay',
    'Dapitan City',
    'Dipolog City',
    'Isabela City',
    'Pagadian City',
    'Zamboanga City',
  ],
  'Bangsamoro and Sulu': [
    'Basilan',
    'Lanao del Sur',
    'Maguindanao del Norte',
    'Maguindanao del Sur',
    'Sulu',
    'Tawi-Tawi',
    'Cotabato City',
    'Lamitan City',
    'Marawi City',
  ],
};

const BRANCH_HOME: Record<
  string,
  { city: string; short: string; region: string }
> = {
  butuan: { city: 'Butuan City', short: 'Butuan', region: 'Caraga' },
  'cagayan-de-oro': {
    city: 'Cagayan de Oro City',
    short: 'CDO',
    region: 'Northern Mindanao',
  },
  davao: { city: 'Davao City', short: 'Davao', region: 'Davao Region' },
};

// Daily rates depend on how far the car travels from its branch. Every branch has the same
// four zone codes, so each vehicle stores one rate per code for its own branch.
export const ZONE_CODES = ['local', 'region', 'cities', 'mindanao'];
export const DEFAULT_ZONE = 'local';

export interface RateZone {
  code: string;
  name: string;
  groups: { name: string | null; places: string[] }[];
}

function branchZones(branch: string): RateZone[] {
  const home = BRANCH_HOME[branch];
  const others = Object.entries(BRANCH_HOME)
    .filter(([code]) => code !== branch)
    .map(([, b]) => b);
  return [
    {
      code: 'local',
      name: home.city,
      groups: [{ name: null, places: [home.city] }],
    },
    {
      code: 'region',
      name: `Within ${home.region}`,
      groups: [{ name: null, places: REGIONS[home.region] }],
    },
    {
      code: 'cities',
      name: `${others[0].short} & ${others[1].short} City`,
      groups: [{ name: null, places: others.map((o) => o.city) }],
    },
    {
      code: 'mindanao',
      name: 'Rest of Mindanao',
      groups: Object.entries(REGIONS)
        .filter(([region]) => region !== home.region)
        .map(([region, places]) => ({ name: region, places })),
    },
  ];
}

export const BRANCH_ZONES: Record<string, RateZone[]> = Object.fromEntries(
  Object.keys(BRANCH_HOME).map((branch) => [branch, branchZones(branch)]),
);

// place -> zone code, per branch
export const PLACE_ZONE: Record<
  string,
  Record<string, string>
> = Object.fromEntries(
  Object.entries(BRANCH_ZONES).map(([branch, zones]) => [
    branch,
    Object.fromEntries(
      zones.flatMap((zone) =>
        zone.groups.flatMap((group) =>
          group.places.map((place) => [place, zone.code]),
        ),
      ),
    ),
  ]),
);
export const ALL_PLACES = Object.keys(PLACE_ZONE.butuan);

export function zoneName(branch: string, code: string): string {
  return BRANCH_ZONES[branch]?.find((z) => z.code === code)?.name ?? code;
}

export interface ExtraOption {
  code: string;
  name: string;
  description: string;
  price: number;
  /** price is per day when true, otherwise a flat fee per booking */
  per_day: boolean;
}

export const EXTRAS: ExtraOption[] = [
  {
    code: 'child-seat',
    name: 'Child seat',
    description: 'Rear facing or booster seat, installed before pickup.',
    price: 250,
    per_day: true,
  },
  {
    code: 'full-insurance',
    name: 'Full coverage insurance',
    description: 'Zero participation fee for covered damage.',
    price: 500,
    per_day: true,
  },
  {
    code: 'additional-driver',
    name: 'Additional driver',
    description: 'Register one more licensed driver for self drive trips.',
    price: 500,
    per_day: false,
  },
  {
    code: 'delivery',
    name: 'Door to door delivery',
    description:
      'We bring the car to your hotel, home or office within city limits.',
    price: 800,
    per_day: false,
  },
  {
    code: 'pocket-wifi',
    name: 'Pocket WiFi',
    description: 'Stay connected on the road with unlimited 4G data.',
    price: 150,
    per_day: true,
  },
];
export const EXTRAS_BY_CODE: Record<string, ExtraOption> = Object.fromEntries(
  EXTRAS.map((extra) => [extra.code, extra]),
);

export const DEFAULT_DRIVER_RATE = 1000;
export const LONG_RENTAL_DAYS = 7;
export const LONG_RENTAL_DISCOUNT = 0.1;
export const SECURITY_DEPOSIT = 5000;
export const MIN_RENTAL_HOURS = 12;
export const MAX_RENTAL_DAYS = 60;
export const MIN_LEAD_HOURS = 2;
