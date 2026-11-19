import type { CountryCode, Destination, TravelMethod } from '../core/types';

export const DESTINATIONS: readonly Destination[] = [
  {
    code: 'mex',
    name: 'Mexico',
    shortName: 'Mexico',
    city: 'Ciudad Juarez',
    tag: 'MX',
    minutes: { standard: 24, airstrip: 17, wlt: 12, business: 7 },
    standardFare: 6500,
  },
  {
    code: 'cay',
    name: 'Cayman Islands',
    shortName: 'Cayman',
    city: 'George Town',
    tag: 'KY',
    minutes: { standard: 33, airstrip: 23, wlt: 17, business: 10 },
    standardFare: 10000,
  },
  {
    code: 'can',
    name: 'Canada',
    shortName: 'Canada',
    city: 'Toronto',
    tag: 'CA',
    minutes: { standard: 39, airstrip: 27, wlt: 19, business: 12 },
    standardFare: 9000,
  },
  {
    code: 'haw',
    name: 'Hawaii',
    shortName: 'Hawaii',
    city: 'Honolulu',
    tag: 'HI',
    minutes: { standard: 127, airstrip: 89, wlt: 63, business: 38 },
    standardFare: 11000,
  },
  {
    code: 'uni',
    name: 'United Kingdom',
    shortName: 'UK',
    city: 'London',
    tag: 'GB',
    minutes: { standard: 151, airstrip: 106, wlt: 75, business: 45 },
    standardFare: 18000,
  },
  {
    code: 'arg',
    name: 'Argentina',
    shortName: 'Argentina',
    city: 'Buenos Aires',
    tag: 'AR',
    minutes: { standard: 158, airstrip: 111, wlt: 79, business: 47 },
    standardFare: 21000,
  },
  {
    code: 'swi',
    name: 'Switzerland',
    shortName: 'Switzerland',
    city: 'Zurich',
    tag: 'CH',
    minutes: { standard: 166, airstrip: 116, wlt: 83, business: 50 },
    standardFare: 27000,
  },
  {
    code: 'jap',
    name: 'Japan',
    shortName: 'Japan',
    city: 'Tokyo',
    tag: 'JP',
    minutes: { standard: 213, airstrip: 149, wlt: 107, business: 64 },
    standardFare: 32000,
  },
  {
    code: 'chi',
    name: 'China',
    shortName: 'China',
    city: 'Beijing',
    tag: 'CN',
    minutes: { standard: 229, airstrip: 160, wlt: 114, business: 69 },
    standardFare: 35000,
  },
  {
    code: 'uae',
    name: 'United Arab Emirates',
    shortName: 'UAE',
    city: 'Dubai',
    tag: 'AE',
    minutes: { standard: 257, airstrip: 180, wlt: 128, business: 77 },
    standardFare: 32000,
  },
  {
    code: 'sou',
    name: 'South Africa',
    shortName: 'South Africa',
    city: 'Johannesburg',
    tag: 'ZA',
    minutes: { standard: 282, airstrip: 197, wlt: 141, business: 85 },
    standardFare: 40000,
  },
];

const DESTINATION_INDEX = new Map<CountryCode, Destination>(
  DESTINATIONS.map((destination) => [destination.code, destination]),
);

export const DESTINATION_BY_NAME = new Map<string, Destination>(
  DESTINATIONS.map((destination) => [destination.name, destination]),
);

export const TRAVEL_METHOD_LABELS: Record<TravelMethod, string> = {
  standard: 'Standard',
  airstrip: 'Airstrip',
  wlt: 'WLT benefit',
  business: 'Business class',
};

const BOOK_TIME_MULTIPLIER = 0.75;

export function isCountryCode(value: string): value is CountryCode {
  return DESTINATION_INDEX.has(value as CountryCode);
}

export function isTravelMethod(value: string): value is TravelMethod {
  return value === 'standard' || value === 'airstrip' || value === 'wlt' || value === 'business';
}

export function getDestination(code: CountryCode): Destination {
  const destination = DESTINATION_INDEX.get(code);
  if (!destination) {
    throw new Error(`Unknown destination: ${code}`);
  }
  return destination;
}

export function oneWayMinutes(
  destination: Destination,
  method: TravelMethod,
  hasBook = false,
): number {
  const base = destination.minutes[method];
  return hasBook ? Math.round(base * BOOK_TIME_MULTIPLIER) : base;
}

export function roundTripMinutes(
  destination: Destination,
  method: TravelMethod,
  hasBook = false,
): number {
  return oneWayMinutes(destination, method, hasBook) * 2;
}
