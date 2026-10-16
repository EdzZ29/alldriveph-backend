/**
 * Idempotent seed: creates the first admin and starter content when tables are empty.
 *
 * Run with:  npm run seed   (production: node dist/cli/seed.js)
 */
import * as bcrypt from 'bcryptjs';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

import { ZONE_CODES } from '../common/constants';
import {
  FuelType,
  Transmission,
  UserRole,
  VehicleCategory,
} from '../common/enums';
import { readingMinutes, slugify } from '../common/utils';
import { settings } from '../config/settings';
import dataSource from '../database/data-source';
import { BlogPost, Faq, Partner, Service, User, Vehicle } from '../entities';

const IMG = '/images/cars/';

const SEDAN_FEATURES = [
  'Bluetooth audio',
  'Rear camera',
  'Dual airbags',
  'USB charging',
  'ABS brakes',
];
const MPV_FEATURES = [
  'Third row seating',
  'Rear aircon vents',
  'Bluetooth audio',
  'USB charging',
  'Dual airbags',
];
const SUV_FEATURES = [
  'Seven seater',
  'Rear aircon vents',
  'Apple CarPlay',
  'Hill start assist',
  'Rear camera',
];
const PICKUP_FEATURES = [
  '4x2 diesel',
  'Large cargo bed',
  'Bluetooth audio',
  'Rear camera',
  'Hill start assist',
];
const VAN_FEATURES = [
  'Up to 15 passengers',
  'Dual aircon',
  'Reclining seats',
  'Large luggage area',
  'Ideal for groups',
];

interface VehicleSeed {
  name: string;
  brand: string;
  model: string;
  year: number;
  category: VehicleCategory;
  transmission: Transmission;
  fuel_type: FuelType;
  seats: number;
  luggage: number;
  color: string;
  daily_rate: number;
  /** Dropped before insert: every seeded car gets DRIVER_RATE (same as the Python seed). */
  driver_rate?: number;
  image_url: string;
  is_featured?: boolean;
  features: string[];
  description: string;
}

const VEHICLES: VehicleSeed[] = [
  {
    name: 'Toyota Vios 1.3 XLE AT',
    brand: 'Toyota',
    model: 'Vios',
    year: 2023,
    category: VehicleCategory.sedan,
    transmission: Transmission.automatic,
    fuel_type: FuelType.gasoline,
    seats: 5,
    luggage: 2,
    color: 'Black',
    daily_rate: 1800,
    image_url: IMG + 'toyota-vios-black.png',
    is_featured: true,
    features: SEDAN_FEATURES,
    description:
      "The Philippines' favorite city car. Fuel efficient, easy to park and comfortable for daily errands or weekend trips.",
  },
  {
    name: 'Toyota Vios 1.3 E AT',
    brand: 'Toyota',
    model: 'Vios',
    year: 2022,
    category: VehicleCategory.sedan,
    transmission: Transmission.automatic,
    fuel_type: FuelType.gasoline,
    seats: 5,
    luggage: 2,
    color: 'Blue',
    daily_rate: 1700,
    image_url: IMG + 'toyota-vios-blue.webp',
    features: SEDAN_FEATURES,
    description:
      'A reliable automatic sedan with low fuel consumption, perfect for getting around Butuan, Cagayan de Oro and Davao.',
  },
  {
    name: 'Toyota Vios 1.3 J MT',
    brand: 'Toyota',
    model: 'Vios',
    year: 2022,
    category: VehicleCategory.sedan,
    transmission: Transmission.manual,
    fuel_type: FuelType.gasoline,
    seats: 5,
    luggage: 2,
    color: 'Green',
    daily_rate: 1500,
    image_url: IMG + 'toyota-vios-green.png',
    features: SEDAN_FEATURES,
    description:
      'Our most affordable option for drivers who prefer a manual gearbox. Light, nimble and very economical.',
  },
  {
    name: 'Toyota Vios 1.3 E AT',
    brand: 'Toyota',
    model: 'Vios',
    year: 2021,
    category: VehicleCategory.sedan,
    transmission: Transmission.automatic,
    fuel_type: FuelType.gasoline,
    seats: 5,
    luggage: 2,
    color: 'Silver',
    daily_rate: 1600,
    image_url: IMG + 'toyota-vios-at-2021.jpg',
    features: SEDAN_FEATURES,
    description:
      'Well maintained automatic sedan that balances comfort, space and value for money.',
  },
  {
    name: 'Nissan Almera Livina',
    brand: 'Nissan',
    model: 'Livina',
    year: 2023,
    category: VehicleCategory.mpv,
    transmission: Transmission.automatic,
    fuel_type: FuelType.gasoline,
    seats: 7,
    luggage: 3,
    color: 'White',
    daily_rate: 2200,
    image_url: IMG + 'nissan-livina.webp',
    features: MPV_FEATURES,
    description:
      'A compact seven seater with flexible seating, great for small families and barkada road trips.',
  },
  {
    name: 'Toyota Avanza 1.5 G AT',
    brand: 'Toyota',
    model: 'Avanza',
    year: 2023,
    category: VehicleCategory.mpv,
    transmission: Transmission.automatic,
    fuel_type: FuelType.gasoline,
    seats: 7,
    luggage: 3,
    color: 'Silver',
    daily_rate: 2300,
    image_url: IMG + 'toyota-avanza.png',
    is_featured: true,
    features: MPV_FEATURES,
    description:
      'Roomy, practical and easy to drive. The Avanza seats seven and handles Mindanao highways with ease.',
  },
  {
    name: 'Toyota Innova 2.8 E AT',
    brand: 'Toyota',
    model: 'Innova',
    year: 2023,
    category: VehicleCategory.mpv,
    transmission: Transmission.automatic,
    fuel_type: FuelType.diesel,
    seats: 7,
    luggage: 4,
    color: 'Pearl White',
    daily_rate: 2900,
    image_url: IMG + 'toyota-innova-white.png',
    is_featured: true,
    features: MPV_FEATURES,
    description:
      'The go to family van. Diesel torque, captain like comfort and space for everyone plus their luggage.',
  },
  {
    name: 'Toyota Innova 2.8 J MT',
    brand: 'Toyota',
    model: 'Innova',
    year: 2022,
    category: VehicleCategory.mpv,
    transmission: Transmission.manual,
    fuel_type: FuelType.diesel,
    seats: 8,
    luggage: 4,
    color: 'Maroon',
    daily_rate: 2600,
    image_url: IMG + 'toyota-innova.jpg',
    features: MPV_FEATURES,
    description:
      'Durable diesel MPV with eight seats. A favorite for out of town trips and company outings.',
  },
  {
    name: 'Toyota Fortuner 2.4 G AT',
    brand: 'Toyota',
    model: 'Fortuner',
    year: 2023,
    category: VehicleCategory.suv,
    transmission: Transmission.automatic,
    fuel_type: FuelType.diesel,
    seats: 7,
    luggage: 4,
    color: 'White',
    daily_rate: 3800,
    image_url: IMG + 'toyota-fortuner-g.jpg',
    is_featured: true,
    features: SUV_FEATURES,
    description:
      'Commanding, comfortable and capable. The Fortuner is ready for city meetings and mountain roads alike.',
  },
  {
    name: 'Mitsubishi Montero Sport GLS AT',
    brand: 'Mitsubishi',
    model: 'Montero Sport',
    year: 2023,
    category: VehicleCategory.suv,
    transmission: Transmission.automatic,
    fuel_type: FuelType.diesel,
    seats: 7,
    luggage: 4,
    color: 'Gray',
    daily_rate: 3800,
    image_url: IMG + 'montero-sports.png',
    features: SUV_FEATURES,
    description:
      'A refined seven seater SUV with smooth power delivery and a quiet cabin for long drives.',
  },
  {
    name: 'Nissan Terra VE AT',
    brand: 'Nissan',
    model: 'Terra',
    year: 2022,
    category: VehicleCategory.suv,
    transmission: Transmission.automatic,
    fuel_type: FuelType.diesel,
    seats: 7,
    luggage: 4,
    color: 'Brown',
    daily_rate: 3600,
    image_url: IMG + 'nissan-terra.webp',
    features: SUV_FEATURES,
    description:
      'Spacious midsize SUV with high ground clearance, ideal for families heading out of town.',
  },
  {
    name: 'Toyota Hilux 2.4 G AT',
    brand: 'Toyota',
    model: 'Hilux',
    year: 2023,
    category: VehicleCategory.pickup,
    transmission: Transmission.automatic,
    fuel_type: FuelType.diesel,
    seats: 5,
    luggage: 6,
    color: 'Red',
    daily_rate: 3400,
    image_url: IMG + 'toyota-hilux.avif',
    features: PICKUP_FEATURES,
    description:
      'Tough and dependable pickup for cargo, construction sites or adventures off the beaten path.',
  },
  {
    name: 'Mitsubishi Triton GLS AT',
    brand: 'Mitsubishi',
    model: 'Triton',
    year: 2023,
    category: VehicleCategory.pickup,
    transmission: Transmission.automatic,
    fuel_type: FuelType.diesel,
    seats: 5,
    luggage: 6,
    color: 'Orange',
    daily_rate: 3300,
    image_url: IMG + 'mitsubishi-triton.png',
    features: PICKUP_FEATURES,
    description:
      'A comfortable pickup that rides like an SUV, with plenty of bed space for your gear.',
  },
  {
    name: 'Nissan Navara VE AT',
    brand: 'Nissan',
    model: 'Navara',
    year: 2022,
    category: VehicleCategory.pickup,
    transmission: Transmission.automatic,
    fuel_type: FuelType.diesel,
    seats: 5,
    luggage: 6,
    color: 'White',
    daily_rate: 3200,
    image_url: IMG + 'navara-ve.jpg',
    features: PICKUP_FEATURES,
    description:
      'Smooth riding pickup with a coil spring rear suspension and a roomy double cab.',
  },
  {
    name: 'Nissan Urvan Premium',
    brand: 'Nissan',
    model: 'Urvan',
    year: 2023,
    category: VehicleCategory.van,
    transmission: Transmission.manual,
    fuel_type: FuelType.diesel,
    seats: 15,
    luggage: 10,
    color: 'Gray',
    daily_rate: 4500,
    driver_rate: 1800,
    image_url: IMG + 'nissan-urvan.png',
    features: VAN_FEATURES,
    description:
      'High roof van that fits up to fifteen passengers. Perfect for company trips, events and airport runs.',
  },
  {
    name: 'Toyota Hiace Commuter Deluxe MT',
    brand: 'Toyota',
    model: 'Hiace Commuter',
    year: 2023,
    category: VehicleCategory.van,
    transmission: Transmission.manual,
    fuel_type: FuelType.diesel,
    seats: 15,
    luggage: 10,
    color: 'White',
    daily_rate: 4800,
    driver_rate: 1800,
    image_url: IMG + 'toyota-commuter-deluxe-2023-mt.png',
    is_featured: true,
    features: VAN_FEATURES,
    description:
      'The most trusted people mover in the country. Comfortable seats and strong aircon for big groups.',
  },
  {
    name: 'Toyota Hiace GL Grandia AT',
    brand: 'Toyota',
    model: 'Hiace GL Grandia',
    year: 2023,
    category: VehicleCategory.van,
    transmission: Transmission.automatic,
    fuel_type: FuelType.diesel,
    seats: 12,
    luggage: 8,
    color: 'Pearl White',
    daily_rate: 5500,
    driver_rate: 1800,
    image_url: IMG + 'toyota-gl-gradia-at-2023.png',
    features: [...VAN_FEATURES.slice(1), 'Premium interior'],
    description:
      'Premium van with a refined interior. Ideal for VIP transfers, weddings and executive travel.',
  },
];

// Daily rates per destination zone (local city, within region, other branch cities, rest of Mindanao).
// Vans are quoted on request, so they keep a single base rate.
const ZONE_RATE_TABLE: Record<string, [number, number, number, number]> = {
  sedan: [1300, 1800, 2300, 2800],
  mpv: [1800, 2300, 2800, 3300],
  innova: [2300, 2800, 3300, 3800],
  suv: [2500, 3000, 3500, 4000],
  pickup: [2500, 3000, 3500, 4000],
};
const DRIVER_RATE = 1000;

// Sample split of the fleet across branches. Update the real location of each car in Admin > Fleet.
const BRANCH_BY_IMAGE: Record<string, string> = {
  'toyota-vios-at-2021.jpg': 'cagayan-de-oro',
  'nissan-livina.webp': 'cagayan-de-oro',
  'toyota-innova.jpg': 'cagayan-de-oro',
  'montero-sports.png': 'cagayan-de-oro',
  'nissan-terra.webp': 'davao',
  'navara-ve.jpg': 'davao',
  'toyota-gl-gradia-at-2023.png': 'davao',
};

function branchFor(imageUrl: string): string {
  return (
    BRANCH_BY_IMAGE[imageUrl.slice(imageUrl.lastIndexOf('/') + 1)] ?? 'butuan'
  );
}

/** {"local": 1300, "region": 1800, "cities": 2300, "mindanao": 2800}, or null for vans. */
function zoneRatesFor(
  category: string,
  model: string,
): Record<string, number> | null {
  const key = model === 'Innova' ? 'innova' : category;
  const row = ZONE_RATE_TABLE[key];
  if (!row) return null;
  if (row.length !== ZONE_CODES.length)
    throw new Error(`Zone rate row for ${key} is incomplete`);
  return Object.fromEntries(ZONE_CODES.map((code, i) => [code, row[i]]));
}

interface ServiceSeed {
  title: string;
  icon: string;
  price_from: number | null;
  summary: string;
  highlights: string[];
  description: string;
}

const SERVICES: ServiceSeed[] = [
  {
    title: 'Self Drive Rental',
    icon: 'key-round',
    price_from: 1300,
    summary: 'Pick a car, grab the keys and drive on your own schedule.',
    highlights: [
      'Unlimited mileage within Mindanao',
      'Full tank to full tank',
      '24/7 roadside assistance',
    ],
    description:
      "Our self drive rental gives you complete freedom. Every unit is cleaned, sanitized and inspected before release. Bring a valid driver's license and two valid IDs, sign the rental agreement and you are good to go.",
  },
  {
    title: 'Car With Driver',
    icon: 'user-round',
    price_from: 2300,
    summary: 'Sit back while a courteous, licensed driver takes the wheel.',
    highlights: [
      'Professional and vetted drivers',
      'Up to 10 hours per day',
      'Fuel, toll and parking at cost',
    ],
    description:
      'Ideal for business trips, family outings or when you would rather not deal with traffic. Our drivers know Butuan, Cagayan de Oro, Davao and the routes between them well, and are trained in defensive driving.',
  },
  {
    title: 'Airport Transfers',
    icon: 'plane',
    price_from: 1200,
    summary:
      'On time pickups and drop offs at Bancasi, Laguindingan and Davao airports.',
    highlights: [
      'Flight tracking',
      'Meet and greet service',
      'Free waiting time of 60 minutes',
    ],
    description:
      'Start or end your trip stress free. We track your flight so your driver is waiting when you land, even if your flight is early or delayed.',
  },
  {
    title: 'Weddings and Events',
    icon: 'sparkles',
    price_from: 5000,
    summary: 'Clean, elegant vehicles and vans for your special day.',
    highlights: [
      'Ribbon and decor ready',
      'Uniformed drivers',
      'Multi vehicle packages',
    ],
    description:
      'From the bridal car to shuttle vans for your guests, we coordinate everything so you can enjoy the celebration.',
  },
  {
    title: 'Corporate and Long Term',
    icon: 'briefcase',
    price_from: null,
    summary: 'Monthly rentals and fleet solutions for businesses.',
    highlights: [
      'Discounted monthly rates',
      'Replacement unit guarantee',
      'Consolidated billing',
    ],
    description:
      'Keep your team moving with flexible corporate accounts. We handle maintenance, registration and insurance so you can focus on your business.',
  },
  {
    title: 'Out of Town Tours',
    icon: 'map',
    price_from: 3500,
    summary:
      'Road trips to Bukidnon, Iligan, Enchanted River, Mati and beyond.',
    highlights: [
      'Suggested itineraries',
      'Drivers who know Mindanao routes',
      'Group friendly vans',
    ],
    description:
      'Planning a barkada trip or family vacation? Tell us your destination and we will recommend the right vehicle and route.',
  },
];

// Images live in alldriveph-frontend/public/AllDriveph-partners
const PARTNER_IMAGES = '/AllDriveph-partners/';

const PARTNERS: {
  name: string;
  category: string;
  description: string;
  logo_url: string | null;
  image_url: string | null;
}[] = [
  {
    name: 'Roadway Autosupply and Car Accessories',
    category: 'Auto Parts & Accessories',
    description:
      'Dealer of automotive spare parts for Toyota, Nissan, Kia, Hyundai, Suzuki, Mitsubishi, Honda, Ford, Mazda and Isuzu. T. Calo Extension, Brgy. Limaha, Butuan City.',
    logo_url: `${PARTNER_IMAGES}RoadWay-logo.png`,
    image_url: `${PARTNER_IMAGES}RoadWay-2.png`,
  },
  {
    name: 'JMDC Genuine Auto Parts & Repair Services',
    category: 'Auto Parts & Repair',
    description:
      'Genuine auto parts, repair services and Caltex Delo oil change.',
    logo_url: null,
    image_url: `${PARTNER_IMAGES}JMDC.jpg`,
  },
];

/** [category, question, answer] */
const FAQS: [string, string, string][] = [
  [
    'Booking',
    'How do I book a car?',
    'Choose a car from our fleet, select your pickup and return schedule, add any extras and fill in your details. You will receive a booking reference right away and our team will confirm your reservation within one hour during business hours.',
  ],
  [
    'Booking',
    'Do I need to pay online to reserve?',
    'No online payment is required to submit a booking. Once we confirm availability, we will send payment instructions for the reservation fee through GCash, Maya or bank transfer.',
  ],
  [
    'Booking',
    'Can I modify or cancel my booking?',
    'Yes. Contact us with your booking reference. Cancellations made at least 48 hours before pickup are free. Later cancellations may forfeit the reservation fee.',
  ],
  [
    'Booking',
    'How can I check the status of my booking?',
    'Use the Track Booking page and enter your booking reference together with the email address you used when booking.',
  ],
  [
    'Requirements',
    'What documents do I need for self drive?',
    "A valid Philippine driver's license (or international driving permit with your foreign license), two valid government IDs and proof of billing. Drivers must be at least 21 years old with two years of driving experience.",
  ],
  [
    'Requirements',
    'Is there a security deposit?',
    'Yes, a refundable security deposit of PHP 5,000 is collected at pickup for self drive rentals. It is returned after the car is inspected upon return.',
  ],
  [
    'Requirements',
    'Can foreigners rent a car?',
    "Yes. Present your passport, your valid foreign driver's license and, if your license is not in English, an international driving permit.",
  ],
  [
    'Pricing',
    'How is the rental price computed?',
    'Rates are per 24 hour block counted from your pickup time. Rentals of 7 days or more get an automatic 10 percent discount. The booking form shows the full breakdown before you submit.',
  ],
  [
    'Pricing',
    'Why do rates change depending on where I go?',
    'Each branch has its own rates, set by how far you drive from it: within the branch city, within its region, to our other branch cities, or the rest of Mindanao. For a Butuan car that means Butuan City, within Caraga, CDO and Davao City, then the rest of Mindanao. Longer trips mean more wear on the car, so pick your destination in the booking form and the price updates instantly.',
  ],
  [
    'Pricing',
    'Is fuel included?',
    'Fuel is not included. Self drive cars are released with a full tank and should be returned full. For trips with a driver, fuel, tolls and parking are charged at cost.',
  ],
  [
    'Pricing',
    'Are there extra charges for late returns?',
    'We give a 1 hour grace period. Beyond that, an hourly rate applies, and returns more than 4 hours late are charged as an extra day.',
  ],
  [
    'On the road',
    'What happens if the car breaks down?',
    'Call our 24/7 hotline. We will dispatch roadside assistance and, if needed, provide a replacement vehicle as soon as possible.',
  ],
  [
    'On the road',
    'Can I drive between Butuan, Cagayan de Oro and Davao?',
    'Yes. Our cars can travel anywhere in Mindanao, and returning to a different branch can be arranged on request. For trips to Visayas or Luzon via RoRo, let us know in advance so we can prepare the required documents.',
  ],
];

const POSTS: {
  title: string;
  tags: string[];
  excerpt: string;
  content: string;
}[] = [
  {
    title: 'Your First Self Drive Rental in Mindanao: A Simple Checklist',
    tags: ['Guides', 'Self drive'],
    excerpt:
      'Renting a car for the first time? Here is everything you need to prepare before pickup, from documents to a quick walkaround inspection.',
    content: `Renting a car should feel easy. Use this checklist to make your first self drive trip smooth from pickup to return.

## Before you book

- Make sure your driver's license is valid for the whole rental period.
- Prepare two valid government IDs and a recent proof of billing.
- Decide on the type of car based on passengers and luggage, not just price.

## At pickup

Take a few minutes to walk around the car with our staff. Check the body for existing scratches, look at the tires and confirm the fuel gauge reads full. We record everything on the release form so you will never be charged for damage that was already there.

## During your trip

Keep the rental agreement and OR/CR in the glove box. Our 24/7 hotline is printed on the key tag in case you need help.

## When you return

Refill the tank, remove your belongings and return on time. A one hour grace period applies, but letting us know about delays early helps us plan for the next customer.

Happy driving!`,
  },
  {
    title: 'Five Weekend Road Trips Across Mindanao',
    tags: ['Travel', 'Road trips'],
    excerpt:
      'Highlands, waterfalls, rivers and beaches. Easy getaways from our Butuan, Cagayan de Oro and Davao branches, plus the best car for each trip.',
    content: `You do not need a plane ticket for a great weekend. These destinations are all within a few hours' drive of one of our branches.

## 1. Dahilayan and the Bukidnon highlands

About two hours from Cagayan de Oro. Cool weather, pine forests and adventure parks. An **SUV** like the Fortuner handles the climb with ease.

## 2. Iligan City waterfalls

Maria Cristina and Tinago Falls are an easy drive along the coast from Cagayan de Oro. A sedan like the **Toyota Vios** is all you need.

## 3. Enchanted River, Hinatuan

The famous deep blue river in Surigao del Sur is a scenic road trip south from Butuan. Leave early and bring friends in an **Innova** or **Avanza**.

## 4. Lake Mainit

The fourth largest lake in the country sits between Butuan and Surigao. Great for a relaxed day trip and fresh seafood by the lake.

## 5. Dahican Beach, Mati

White sand and surf about three to four hours from Davao City. Pack the boards and go with a **pickup** or a roomy **van** for the whole group.

Not sure which car fits your trip? Send us a message and we will recommend one.`,
  },
  {
    title: 'Self Drive or With Driver: Which One Is Right for You?',
    tags: ['Guides'],
    excerpt:
      'Both options have their perks. We break down cost, comfort and convenience so you can choose with confidence.',
    content: `Choosing between self drive and a car with driver depends on your trip, your schedule and how comfortable you are on Philippine roads.

## Choose self drive if

- You want full control of your itinerary.
- You are confident navigating traffic and parking.
- You are traveling on a tighter budget.

## Choose a car with driver if

- You have meetings or events and want to arrive fresh.
- You are visiting from abroad and are unfamiliar with local roads.
- You are traveling with a big group in a van.

## The cost difference

Adding a driver costs PHP 1,000 per day for up to 10 hours. Fuel, tolls and parking are charged at cost for driver trips.

Whichever you choose, our booking form shows the full price before you confirm.`,
  },
  {
    title: 'How We Keep Every Car Clean, Safe and Road Ready',
    tags: ['Company'],
    excerpt:
      'A look behind the scenes at our inspection and cleaning process before every single release.',
    content: `Every Alldrive car goes through the same routine before it is handed to the next customer.

## The 30 point inspection

Our team checks brakes, tires, lights, fluids, aircon and the battery. Any issue means the car stays in the garage until it is fixed.

## Deep cleaning

Interiors are vacuumed, wiped down and sanitized. High touch surfaces like the steering wheel, gear shift and door handles get extra attention.

## Preventive maintenance

We follow the manufacturer's service schedule with our maintenance partner, so problems are caught early.

## Documents and insurance

Registration and comprehensive insurance are always up to date, and copies are kept in every car.

That is our promise: a car you can trust, every time.`,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

async function seed(manager: EntityManager): Promise<void> {
  const adminEmail = settings.firstAdminEmail.toLowerCase();
  const admin = await manager
    .createQueryBuilder(User, 'u')
    .where('LOWER(u.email) = :email', { email: adminEmail })
    .getOne();
  if (!admin) {
    await manager.save(
      manager.create(User, {
        email: adminEmail,
        full_name: settings.firstAdminName,
        hashed_password: await bcrypt.hash(settings.firstAdminPassword, 12),
        role: UserRole.admin,
      }),
    );
    console.log(`Created admin ${settings.firstAdminEmail}`);
  }

  const empty = async <T extends ObjectLiteral>(
    entity: EntityTarget<T>,
  ): Promise<boolean> => (await manager.count(entity)) === 0;

  if (await empty(Vehicle)) {
    const used = new Set<string>();
    const vehicles = VEHICLES.map((vehicle, i) => {
      let slug = slugify(`${vehicle.name} ${vehicle.year} ${vehicle.color}`);
      while (used.has(slug)) slug += '-2';
      used.add(slug);
      // the per car driver_rate in the data is dropped; every car gets DRIVER_RATE
      const { driver_rate, ...data } = vehicle;
      const zones = zoneRatesFor(data.category, data.model);
      // the base daily rate is the branch city ("local" zone) rate when the car has zone rates
      const daily = zones ? zones.local : data.daily_rate;
      return manager.create(Vehicle, {
        slug,
        sort_order: i,
        driver_rate: DRIVER_RATE,
        zone_rates: zones ?? {},
        branch: branchFor(data.image_url),
        ...data,
        daily_rate: daily,
      });
    });
    await manager.save(vehicles);
    console.log(`Seeded ${VEHICLES.length} vehicles`);
  }

  if (await empty(Service)) {
    const services = SERVICES.map(({ price_from, ...data }, i) =>
      manager.create(Service, {
        slug: slugify(data.title),
        sort_order: i,
        price_from: price_from ?? null,
        ...data,
      }),
    );
    await manager.save(services);
    console.log(`Seeded ${SERVICES.length} services`);
  }

  if (await empty(Partner)) {
    const partners = PARTNERS.map((data, i) =>
      manager.create(Partner, { sort_order: i, ...data }),
    );
    await manager.save(partners);
    console.log(`Seeded ${PARTNERS.length} partners`);
  }

  if (await empty(Faq)) {
    const faqs = FAQS.map(([category, question, answer], i) =>
      manager.create(Faq, { category, question, answer, sort_order: i }),
    );
    await manager.save(faqs);
    console.log(`Seeded ${FAQS.length} FAQs`);
  }

  if (await empty(BlogPost)) {
    const now = Date.now();
    const posts = POSTS.map((data, i) =>
      manager.create(BlogPost, {
        slug: slugify(data.title),
        reading_minutes: readingMinutes(data.content),
        cover_image_url: VEHICLES[(i * 3) % VEHICLES.length].image_url,
        is_published: true,
        published_at: new Date(now - 7 * (i + 1) * DAY_MS),
        ...data,
      }),
    );
    await manager.save(posts);
    console.log(`Seeded ${POSTS.length} blog posts`);
  }
}

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await dataSource.transaction((manager) => seed(manager));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
