/**
 * Gameplay time in ms. Advances only while GameScene updates, so pauses and
 * hidden tabs don't count, unlike scene.time.now.
 */
export class GameClock {
  private elapsed = 0;

  get now(): number {
    return this.elapsed;
  }

  tick(delta: number) {
    this.elapsed += delta;
  }
}
