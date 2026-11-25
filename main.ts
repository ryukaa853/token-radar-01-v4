// Token Radar v4 — the program (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// scores every rankable pre-token protocol with the fitted model in
// lib/model.ts, writes the ranked board to /output/board.json, writes the
// dashboard's data beside the page as /output/data.js, copies this
// repository's dashboard/ and screenshots/ to /output, and writes
// /output/dossier.json with the vendored make.fun library.
//
// Before anything is written the board passes the gate's own checks
// (boardIssue); after the copy the program checks the other six rows too —
// the dashboard's files and their no-network rule, the screenshots' sizes
// and dimensions, and the dossier rebuilt byte for byte — and refuses to
// exit 0 on any failure. A run that cannot produce a valid board fails
// loudly here, in development, instead of failing the gate on the server.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const DOSSIER_MAX_BYTES = 1_572_864; // 1.5 MiB, the gate's dossier cap
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** Fail with a message on stderr and exit 1. */
function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));

/** The gate's dashboard row, checked on what was just written. */
function dashboardIssue(): string | null {
  if (!dashFiles.includes('index.html')) return 'dashboard/ holds no index.html';
  if (!dashFiles.some((f) => f.endsWith('.css'))) return 'dashboard/ holds no .css file';
  if (!dashFiles.some((f) => f.endsWith('.js'))) return 'dashboard/ holds no .js file';
  if (dashFiles.length > DASHBOARD_CAPS.max_files) return `dashboard/ holds ${dashFiles.length} files, over the ${DASHBOARD_CAPS.max_files} it may`;
  let bytes = 0;
  for (const name of dashFiles) {
    if (!PLAIN_NAME.test(name)) return `dashboard/${name}: a file's name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`;
    const buf = readFileSync(join(out, 'dashboard', name));
    bytes += buf.length;
    // The page carries no network address at all: no http:// or https://
    // string anywhere in any dashboard file, so no attribute, style body,
    // stylesheet or script import can name one.
    const text = buf.toString('utf8');
    if (text.includes('http://') || text.includes('https://')) return `dashboard/${name} names a network address`;
  }
  if (bytes > DASHBOARD_CAPS.max_bytes) return `dashboard/'s files come to ${bytes} bytes, over the ${DASHBOARD_CAPS.max_bytes} they may`;
  return null;
}

/** A PNG or JPEG's pixel size, from its header bytes, or null when unreadable. */
function imageSize(buf: Buffer): { width: number; height: number } | null {
  const png = PNG_MAGIC.every((b, i) => buf[i] === b);
  if (png && buf.length >= 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  const jpeg = JPEG_MAGIC.every((b, i) => buf[i] === b);
  if (!jpeg) return null;
  // Walk the JPEG markers to the first start-of-frame segment.
  let at = 2;
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) return null;
    const marker = buf[at + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const len = buf.readUInt16BE(at + 2);
    if (len < 2 || at + 2 + len > buf.length) return null;
    if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) || marker === 0xc2) {
      return { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
    }
    at += 2 + len;
  }
  return null;
}

/** The gate's screenshots row, checked on what was just written. */
function screenshotsIssue(): string | null {
  if (shots.length < 3 || shots.length > SCREENSHOT_CAPS.max) return `screenshots/ holds ${shots.length} images: hand in 3, the board, a detail view and a filtered view`;
  for (const name of shots) {
    if (!PLAIN_NAME.test(name)) return `screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`;
    const buf = readFileSync(join(out, 'screenshots', name));
    if (buf.length > SCREENSHOT_CAPS.max_bytes) return `screenshots/${name} is ${buf.length} bytes, over the ${SCREENSHOT_CAPS.max_bytes} it may`;
    const size = imageSize(buf);
    if (size === null) return `screenshots/${name} is neither a whole PNG nor a whole JPEG`;
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > 1440) return `screenshots/${name} is ${size.width}x${size.height}: its long side is over 1440`;
    if (short < 800) return `screenshots/${name} is ${size.width}x${size.height}: its short side is under 800`;
  }
  return null;
}

const dashIssue = dashboardIssue();
if (dashIssue !== null) fail(`the dashboard the gate refuses: ${dashIssue}`);
const shotIssue = screenshotsIssue();
if (shotIssue !== null) fail(`the screenshots the gate refuses: ${shotIssue}`);

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const dossier = buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS });
if (dossier.length > DOSSIER_MAX_BYTES) fail(`the dossier is ${dossier.length} bytes, over the ${DOSSIER_MAX_BYTES} the gate allows`);
writeFileSync(join(out, 'dossier.json'), dossier);

// Rebuild and compare: the dossier on disk must be byte for byte what the
// library writes from this /output, or the gate's dossier row fails.
const again = buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS });
const written = readFileSync(join(out, 'dossier.json'));
if (!written.equals(Buffer.from(again))) fail('dossier.json is not byte for byte what buildDossier writes from this /output');

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')} (${dossier.length} bytes)\n` +
    `token radar: gate self-check passed (board, dashboard, screenshots, dossier)\n`,
);
