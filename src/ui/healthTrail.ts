/** How long the trail waits after a hit before draining. */
const HOLD_MS = 450;
/** HP per second the trail drains toward current health. */
const DRAIN_PER_S = 80;

/**
 * The pale segment behind the HP bar that shows recent damage.
 * It holds after each hit, then drains down; healing snaps it up.
 */
export class HealthTrail {
  value = 0;
  private last = 0;
  private holdMs = 0;

  reset(health: number) {
    this.value = health;
    this.last = health;
    this.holdMs = 0;
  }

  /** Returns true when `value` moved, so the bar needs a redraw. */
  update(health: number, deltaMs: number): boolean {
    if (health < this.last) this.holdMs = HOLD_MS;
    this.last = health;

    if (health >= this.value) {
      const moved = health !== this.value;
      this.value = health;
      return moved;
    }
    if (this.holdMs > 0) {
      this.holdMs -= deltaMs;
      return false;
    }
    this.value = Math.max(health, this.value - (DRAIN_PER_S * deltaMs) / 1000);
    return true;
  }
}
