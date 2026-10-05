import { DRIVE } from './swing';

/** What a shop sells: one rolled item, a big heal and a drive upgrade, each once per shop. */
export type Ware = 'item' | 'heal' | 'drive';

export const SHOP = {
  prices: { item: 15, heal: 5, drive: 10 } satisfies Record<Ware, number>,
  /** Share of max HP the shop's heal restores, rounded up. */
  healShare: 0.4,
} as const;

/** The run state a purchase reads and changes. */
export interface Wallet {
  currency: number;
  health: number;
  maxHealth: number;
  drive: number;
  driveMax: number;
}

/** Wares on display, in pedestal order; the drive upgrade leaves once the max is reached. */
export function shopWares(driveMax: number): Ware[] {
  return driveMax < DRIVE.maxCap ? ['item', 'heal', 'drive'] : ['item', 'heal'];
}

export function shopHealHp(maxHealth: number): number {
  return Math.ceil(maxHealth * SHOP.healShare);
}

/** Enough currency, and the ware would do something: no heal at full HP, no upgrade past the cap. */
export function canBuy(ware: Ware, wallet: Wallet): boolean {
  if (wallet.currency < SHOP.prices[ware]) return false;
  if (ware === 'heal') return wallet.health < wallet.maxHealth;
  if (ware === 'drive') return wallet.driveMax < DRIVE.maxCap;
  return true;
}

/** The wallet after buying; the scene grants the item itself. A drive upgrade comes charged. */
export function buy(ware: Ware, wallet: Wallet): Wallet {
  const paid = { ...wallet, currency: wallet.currency - SHOP.prices[ware] };
  if (ware === 'heal') return { ...paid, health: Math.min(paid.maxHealth, paid.health + shopHealHp(paid.maxHealth)) };
  if (ware === 'drive') return { ...paid, driveMax: paid.driveMax + 1, drive: paid.drive + 1 };
  return paid;
}
