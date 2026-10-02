import { describe, expect, it } from 'vitest';
import { SHOP, type Wallet, buy, canBuy, shopHealHp, shopWares } from './shop';
import { DRIVE } from './swing';

const WALLET: Wallet = { currency: 20, health: 30, maxHealth: 60, drive: 0, driveMax: 1 };

describe('shopWares', () => {
  it('sells all three until the drive is maxed', () => {
    expect(shopWares(1)).toEqual(['item', 'heal', 'drive']);
    expect(shopWares(DRIVE.maxCap)).toEqual(['item', 'heal']);
  });
});

describe('canBuy', () => {
  it('needs enough currency', () => {
    expect(canBuy('item', { ...WALLET, currency: SHOP.prices.item - 1 })).toBe(false);
    expect(canBuy('item', { ...WALLET, currency: SHOP.prices.item })).toBe(true);
  });

  it('will not sell a heal at full HP', () => {
    expect(canBuy('heal', { ...WALLET, health: 60 })).toBe(false);
  });

  it('will not raise the drive past its cap', () => {
    expect(canBuy('drive', { ...WALLET, driveMax: DRIVE.maxCap })).toBe(false);
  });
});

describe('buy', () => {
  it('takes the price', () => {
    expect(buy('item', WALLET).currency).toBe(20 - SHOP.prices.item);
  });

  it('heals a share of max HP, never past it', () => {
    expect(shopHealHp(60)).toBe(24);
    expect(buy('heal', WALLET).health).toBe(54);
    expect(buy('heal', { ...WALLET, health: 50 }).health).toBe(60);
  });

  it('raises the drive max and adds a charge', () => {
    const after = buy('drive', WALLET);
    expect(after.driveMax).toBe(2);
    expect(after.drive).toBe(1);
  });
});
