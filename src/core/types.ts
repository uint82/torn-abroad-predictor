export const COUNTRY_CODES = [
  'mex',
  'cay',
  'can',
  'haw',
  'uni',
  'arg',
  'swi',
  'jap',
  'chi',
  'uae',
  'sou',
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export const TRAVEL_METHODS = ['standard', 'airstrip', 'wlt', 'business'] as const;

export type TravelMethod = (typeof TRAVEL_METHODS)[number];

export const SALE_CHANNELS = ['item-market', 'bazaar', 'custom'] as const;

export type SaleChannel = (typeof SALE_CHANNELS)[number];

export type PriceBasis = 'average' | 'lowest';

export type ItemGroup = 'all' | 'plushie' | 'flower' | 'drug' | 'weapon' | 'gear' | 'other';

export type SortKey = 'profit' | 'stock' | 'name' | 'buy' | 'market';

export type Confidence = 'low' | 'medium' | 'high';

export type StockStatus = 'in-stock' | 'restock-expected' | 'sold-out' | 'unknown';

export type QuoteSource = 'live' | 'catalog' | 'none';

export interface Destination {
  code: CountryCode;
  name: string;
  shortName: string;
  city: string;
  tag: string;
  minutes: Record<TravelMethod, number>;
  standardFare: number;
}

export interface StockEntry {
  itemId: number;
  name: string;
  quantity: number;
  cost: number;
}

export interface CountryStock {
  code: CountryCode;
  updatedAt: number;
  items: StockEntry[];
}

export interface StockData {
  fetchedAt: number;
  countries: Partial<Record<CountryCode, CountryStock>>;
}

export interface CatalogShop {
  country: string;
  shop: string;
  buyPrice: number | null;
  sellPrice: number | null;
}

export interface CatalogItem {
  id: number;
  name: string;
  type: string;
  marketPrice: number | null;
  shops: CatalogShop[];
}

export interface MarketQuote {
  itemId: number;
  averagePrice: number | null;
  lowestPrice: number | null;
  listingsCount: number;
  fetchedAt: number;
}

export interface StockObservation {
  at: number;
  quantity: number;
}

export interface PriceObservation {
  at: number;
  price: number;
}

export interface StockForecast {
  status: StockStatus;
  expectedStock: number | null;
  nextRestockAt: number | null;
  nextRestockEarliestAt: number | null;
  nextRestockLatestAt: number | null;
  arrivalStockChance: number | null;
  confidence: Confidence;
  restockConfidence: Confidence;
  restockSamples: number;
  sellRatePerHour: number | null;
  restockSize: number | null;
  horizonMinutes: number;
  samples: number;
}

export interface PriceTrend {
  direction: 'rising' | 'falling' | 'stable' | 'unknown';
  changePercent: number | null;
  volatilityPercent: number | null;
  samples: number;
}

export interface Settings {
  method: TravelMethod;
  capacity: number;
  channel: SaleChannel;
  customFeePercent: number;
  priceBasis: PriceBasis;
  waitMinutes: number;
  book: boolean;
  includePredictedStock: boolean;
  businessTicketCost: number;
}

export const DEFAULT_SETTINGS: Settings = {
  method: 'airstrip',
  capacity: 28,
  channel: 'item-market',
  customFeePercent: 5,
  priceBasis: 'average',
  waitMinutes: 0,
  book: false,
  includePredictedStock: true,
  businessTicketCost: 0,
};

export interface Filters {
  group: ItemGroup;
  sort: SortKey;
  inStockOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  group: 'all',
  sort: 'profit',
  inStockOnly: false,
};

export interface ItemRow {
  itemId: number;
  name: string;
  type: string;
  group: ItemGroup;
  shop: string;
  buyPrice: number | null;
  stock: number | null;
  stockUpdatedAt: number | null;
  marketAverage: number | null;
  lowestListing: number | null;
  salePrice: number | null;
  netSalePrice: number | null;
  unitProfit: number | null;
  quoteSource: QuoteSource;
  quoteFetchedAt: number | null;
  forecast: StockForecast;
  trend: PriceTrend;
}

export interface TripPick {
  itemId: number;
  units: number;
  unitProfit: number;
  profit: number;
}

export interface TripPlan {
  country: CountryCode;
  capacity: number;
  units: number;
  buyCost: number;
  grossProfit: number;
  flightCost: number;
  netProfit: number;
  roiPercent: number | null;
  profitPerHour: number | null;
  totalMinutes: number;
  fillRate: number;
  picks: TripPick[];
}

export interface Histories {
  stock: Partial<Record<CountryCode, Record<number, StockObservation[]>>>;
  prices: Record<number, PriceObservation[]>;
}

export const EMPTY_HISTORIES: Histories = {
  stock: {},
  prices: {},
};
