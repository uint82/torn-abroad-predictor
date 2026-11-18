import type { ItemGroup } from '../core/types';

const TYPE_GROUPS: Readonly<Record<string, ItemGroup>> = {
  plushie: 'plushie',
  flower: 'flower',
  drug: 'drug',
  primary: 'weapon',
  secondary: 'weapon',
  melee: 'weapon',
  temporary: 'weapon',
  defensive: 'gear',
  clothing: 'gear',
  armor: 'gear',
};

export const ITEM_GROUPS: readonly ItemGroup[] = [
  'all',
  'plushie',
  'flower',
  'drug',
  'weapon',
  'gear',
  'other',
];

export const ITEM_GROUP_LABELS: Record<ItemGroup, string> = {
  all: 'All items',
  plushie: 'Plushies',
  flower: 'Flowers',
  drug: 'Drugs',
  weapon: 'Weapons',
  gear: 'Gear',
  other: 'Other',
};

export function groupForType(type: string): ItemGroup {
  return TYPE_GROUPS[type.toLowerCase()] ?? 'other';
}
