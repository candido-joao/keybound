// Stress test: a room full of enemies and the hero firing nonstop with the items that put the most
// bolts in the air. Runs the dev build in a headless Chromium browser and fails over budget.
//   pnpm perf            (PERF_BROWSER=<path> to pick the browser)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5299;
const DEBUG_PORT = 9399;
const ITEMS = process.env.PERF_ITEMS ?? 'quickcast,quickcast,quickcast,trinity-sigil,crystal-echo';
const ENEMY_COUNT = 12;
const WARMUP_MS = 3000;
const MEASURE_MS = 10000;

/** Over any of these, the run fails. Frame times are loose: headless rendering is slower than a real screen. */
const BUDGET = {
  scriptMsPerFrame: 4,
  p95FrameMs: 25,
  heapGrowthMb: 5,
  bolts: 160,
};

const BROWSERS = [
  process.env.PERF_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Attempts up to 240 calls, pausing 250 ms after rejected or undefined results before trying again. */
async function retry(fn) {
  for (let i = 0; i < 240; i++) {
    const value = await fn().catch(() => undefined);
    if (value !== undefined) return value;
    await wait(250);
  }
  throw new Error('timed out waiting for the server or the browser');
}

/** Opens a DevTools session with command and evaluation helpers, collecting runtime exceptions. */
function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const errors = [];
  let id = 0;
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.exception?.description);
    if (message.id && pending.has(message.id)) pending.get(message.id)(message.result ?? message.error);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  return new Promise((resolve) => (ws.onopen = () => resolve({ ws, send, evaluate, errors })));
}

async function metric(send, name) {
  const { metrics } = await send('Performance.getMetrics');
  return metrics.find((m) => m.name === name).value;
}

const heapMb = async (send) => (await metric(send, 'JSHeapUsedSize')) / 1024 / 1024;

/**
 * Rough allocation rate: the heap's rises between samples, until `done` settles. A collection
 * between two samples hides part of a rise, so it reads low; it's for comparing runs.
 */
async function allocationMbPerS(send, done) {
  let finished = false;
  done.then(() => (finished = true));
  const start = performance.now();
  let last = await heapMb(send);
  let allocated = 0;
  while (!finished) {
    await wait(50);
    const now = await heapMb(send);
    allocated += Math.max(0, now - last);
    last = now;
  }
  return allocated / ((performance.now() - start) / 1000);
}

/** Puts the hero in a fighting room, untouchable, holding fire, and keeps the room full. */
const SETUP = `(() => {
  const g = window.game.scene.getScene('game');
  const room = [...g.floor.rooms.values()].find((r) => r.type === 'normal');
  g.enterRoom(room);
  g.cheats.god = true;
  g.player.keys.RIGHT.isDown = true;
  const def = g.enemies.getChildren()[0]?.def;
  window.__refill = setInterval(() => {
    const missing = ${ENEMY_COUNT} - g.enemies.countActive();
    for (let i = 0; i < missing; i++) g.spawner.spawn(def, 200 + i * 40, 160 + (i % 3) * 120);
  }, 250);
  return Boolean(def);
})()`;

const MEASURE = `new Promise((resolve) => {
  const frames = [];
  let last = performance.now();
  const end = last + ${MEASURE_MS};
  const step = (now) => {
    frames.push(now - last);
    last = now;
    if (now < end) return requestAnimationFrame(step);
    resolve(frames);
  };
  requestAnimationFrame(step);
})`;

const BOLTS = `window.game.scene.getScene('game').shots.bolts.getLength()`;

/** Kills the whole process tree: on Windows the shell's child (vite, browser helpers) outlives a plain kill. */
function stop(child) {
  if (process.platform !== 'win32') return child.kill();
  spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
}

function percentile(values, share) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

async function run(browserPath, profile) {
  const server = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], { shell: true });
  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,800',
    'about:blank',
  ]);
  try {
    await retry(() => fetch(`http://localhost:${PORT}/`).then((r) => r.ok || undefined));
    const pages = await retry(() => fetch(`http://127.0.0.1:${DEBUG_PORT}/json`).then((r) => r.json()));
    const { ws, send, evaluate, errors } = await connect(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
    await send('Runtime.enable');
    await send('Performance.enable');
    await send('Page.navigate', { url: `http://localhost:${PORT}/?seed=PERF&items=${ITEMS}` });
    await retry(() => evaluate(`window.game?.scene.getScene('game')?.player?.active || undefined`));
    if (!(await evaluate(SETUP))) throw new Error('no enemy to fill the room with');
    await wait(WARMUP_MS);

    await send('HeapProfiler.collectGarbage');
    const heapBefore = await heapMb(send);
    const scriptBefore = await metric(send, 'ScriptDuration');
    const measuring = evaluate(MEASURE);
    const allocation = await allocationMbPerS(send, measuring);
    const frames = await measuring;
    const scriptMs = ((await metric(send, 'ScriptDuration')) - scriptBefore) * 1000;
    const bolts = await evaluate(BOLTS);
    await send('HeapProfiler.collectGarbage');
    const heapAfter = await heapMb(send);
    ws.close();
    return { frames, scriptMs, bolts, allocation, heapGrowth: heapAfter - heapBefore, errors };
  } finally {
    stop(browser);
    stop(server);
  }
}

/** Prints frame, memory and pool measurements; returns false for exceeded budgets or runtime exceptions. */
function report({ frames, scriptMs, bolts, allocation, heapGrowth, errors }) {
  const avg = frames.reduce((sum, f) => sum + f, 0) / frames.length;
  const result = {
    fps: Math.round(1000 / avg),
    scriptMsPerFrame: scriptMs / frames.length,
    p95FrameMs: percentile(frames, 0.95),
    p99FrameMs: percentile(frames, 0.99),
    worstFrameMs: Math.max(...frames),
    allocMbPerS: allocation,
    heapGrowthMb: heapGrowth,
    bolts,
  };
  console.table(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Number(v.toFixed(1))])));
  const over = Object.entries(BUDGET).filter(([key, max]) => result[key] > max);
  for (const [key, max] of over) console.error(`over budget: ${key} ${result[key].toFixed(1)} > ${max}`);
  for (const error of errors) console.error(`exception: ${error}`);
  return over.length === 0 && errors.length === 0;
}

const browserPath = BROWSERS.find((path) => path && existsSync(path));
if (!browserPath) {
  console.error('No Chromium browser found; set PERF_BROWSER to one.');
  process.exit(1);
}
const profile = mkdtempSync(join(tmpdir(), 'keybound-perf-'));
const ok = await run(browserPath, profile)
  .then(report)
  .catch((error) => {
    console.error(error);
    return false;
  });
// The browser may still hold the profile for a moment after being killed.
await wait(1000);
rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
process.exit(ok ? 0 : 1);
