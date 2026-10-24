/**
 * Builds Travel Organizer Beta (docs/beta-variant.md). The only supported way to make a Beta APK:
 * it sets APP_VARIANT=beta itself, regenerates android/ for Beta, builds the release APK and then
 * refuses it — renaming it *.REJECTED.apk — unless it is the Beta package, labelled as Beta and not
 * signed with the stable app's key. An accepted APK is copied to ~/.travel-organizer/.
 *
 *   node scripts/build-beta.mjs
 *
 * android/ is left as a Beta project afterwards; a stable build must start with
 * `npx expo prebuild --platform android --clean`.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import guard from './beta-guard.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const env = { ...process.env, APP_VARIANT: 'beta' };

/** Windows needs a shell for .bat/.cmd tools, and the shell needs paths with spaces quoted. */
const quoted = (value) => (windows && /\s/.test(value) ? `"${value}"` : value);

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(quoted(command), args.map(quoted), { stdio: 'inherit', env, shell: windows, ...options });
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function capture(command, args) {
  const result = spawnSync(quoted(command), args.map(quoted), { encoding: 'utf8', shell: windows });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

export function buildTools() {
  const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  const dir = join(sdk, 'build-tools');
  const latest = readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
  return {
    aapt2: join(dir, latest, windows ? 'aapt2.exe' : 'aapt2'),
    apksigner: join(dir, latest, windows ? 'apksigner.bat' : 'apksigner'),
  };
}

/** The checks both scripts run on an APK: what it is, and why it must not be installed, if so. */
export function inspectApk(apk) {
  const tools = buildTools();
  const badging = guard.parseBadging(capture(tools.aapt2, ['dump', 'badging', apk]));
  const certDigests = guard.parseCertDigests(capture(tools.apksigner, ['verify', '--print-certs', apk]));
  const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
  return { badging, certDigests, sha256, problems: guard.betaApkProblems({ badging, certDigests }) };
}

function main() {
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], { cwd: root });
  run(windows ? 'gradlew.bat' : './gradlew', ['assembleRelease'], { cwd: join(root, 'android') });

  const apk = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!existsSync(apk)) throw new Error(`No APK at ${apk}`);
  const { badging, certDigests, sha256, problems } = inspectApk(apk);
  console.log('\nBuilt:', { ...badging, certDigests, sha256 });

  if (problems.length > 0) {
    renameSync(apk, apk.replace(/\.apk$/, '.REJECTED.apk'));
    console.error(`\nREJECTED — do not install:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }

  const store = join(homedir(), '.travel-organizer');
  mkdirSync(store, { recursive: true });
  const target = join(store, `travel-organizer-beta-${badging.versionName}.apk`);
  copyFileSync(apk, target);
  console.log(`\nAccepted as Beta: ${target}\nSHA-256 ${sha256}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
