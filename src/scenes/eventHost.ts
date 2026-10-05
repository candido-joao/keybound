import type { GameScene } from './GameScene';
import type { EventHost } from './RoomEventDirector';

/** What room events may do to the floor, handed to the systems that do it. */
export function eventHost(game: GameScene): EventHost {
  return {
    get seed() {
      return game.seed;
    },
    get depth() {
      return game.depth;
    },
    get player() {
      return game.player;
    },
    now: () => game.clock.now,
    enemiesLeft: () => game.enemiesLeft(),
    spawnWave: (room, wave, transform) => game.spawner.wave(room, wave, transform),
    spawnTwins: () => game.spawner.twins(),
    spawnMiniBoss: (room) => game.spawner.miniBoss(room),
    rainDrops: (kinds) => game.drops.rain(kinds),
    payAltar: (room, rng) => game.rewards.payAltar(room, rng),
    placeAltarPedestal: (room) => game.rewards.placeAltarPedestal(room),
    placeRewardItem: (room, rng) => game.rewards.placeRewardItem(room, rng),
    banner: (title, subtitle) => game.banner(title, subtitle),
    keep: (object) => game.keep(object),
  };
}
