/**
 * Installs Travel Organizer Beta on one named device, for the personal profile only, and proves the
 * stable app was not touched (docs/beta-variant.md). Never uninstalls, clears or updates anything
 * else; the only device commands are a push to /data/local/tmp, `pm install`, removing that pushed
 * file, and read-only `dumpsys package`.
 *
 *   node scripts/install-beta.mjs --serial <adb serial> --apk <path> [--replace] [--dry-run]
 *
 * --replace updates an installed Beta (`pm install -r`, still `--pkg` Beta only); without it the
 * install refuses to replace anything (`-R`). --dry-run runs every check and prints the commands.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import guard from './beta-guard.js';
import { inspectApk } from './build-beta.mjs';

const DEVICE_PATH = '/data/local/tmp/travel-organizer-beta.apk';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const serial = argument('--serial');
const apk = argument('--apk');
const replace = process.argv.includes('--replace');
const dryRun = process.argv.includes('--dry-run');

const adbPath = join(
  process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb',
);

function adb(args, { allowFailure = false } = {}) {
  // No shell: arguments reach adb exactly as written, and MSYS never rewrites the device paths.
  const result = spawnSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`adb ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return `${result.stdout}${result.stderr}`;
}

const packageState = (name) => {
  const state = guard.parsePackageState(adb(['shell', 'dumpsys', 'package', name], { allowFailure: true }));
  return state && state.name === name ? state : null;
};

function fail(message) {
  console.error(`\nSTOPPED — nothing was installed:\n${message}`);
  process.exit(1);
}

function main() {
  if (!serial || !apk) fail('Usage: --serial <adb serial> --apk <path> [--replace] [--dry-run]');

  const devices = spawnSync(adbPath, ['devices'], { encoding: 'utf8' }).stdout;
  if (!new RegExp(`^${serial}\\s+device$`, 'm').test(devices)) {
    fail(`Device ${serial} is not connected and authorised.\n${devices}`);
  }

  const inspected = inspectApk(apk);
  console.log('APK:', { ...inspected.badging, certDigests: inspected.certDigests, sha256: inspected.sha256 });
  if (inspected.problems.length > 0) fail(`- ${inspected.problems.join('\n- ')}`);

  const stableBefore = packageState(guard.STABLE_PACKAGE);
  console.log('Stable before:', stableBefore);
  const betaBefore = packageState(guard.BETA_PACKAGE);
  if (betaBefore && !replace) fail('Beta is already installed. Pass --replace to update Beta itself.');

  const install = guard.betaInstallArgs(DEVICE_PATH, { replace: Boolean(betaBefore) });
  if (dryRun) {
    console.log(`\nDry run. Would run:\n  adb -s ${serial} push "${apk}" ${DEVICE_PATH}`);
    console.log(`  adb -s ${serial} ${install.join(' ')}\n  adb -s ${serial} shell rm ${DEVICE_PATH}`);
    return;
  }

  adb(['push', apk, DEVICE_PATH]);
  let output;
  try {
    output = adb(install, { allowFailure: true });
  } finally {
    adb(['shell', 'rm', '-f', DEVICE_PATH], { allowFailure: true });
  }
  console.log(output.trim());

  const stableAfter = packageState(guard.STABLE_PACKAGE);
  const changes = guard.stableChanges(stableBefore, stableAfter);
  if (stableBefore && changes.length > 0) {
    console.error(`\nWARNING — the stable app reads differently after the install:\n- ${changes.join('\n- ')}`);
    process.exit(2);
  }
  if (stableBefore) console.log('Stable after: unchanged');

  const betaAfter = packageState(guard.BETA_PACKAGE);
  console.log('Beta after:', betaAfter);
  const otherUsers = Object.entries(betaAfter?.users ?? {}).filter(([user, on]) => user !== '0' && on);
  if (!/Success/.test(output) || !betaAfter?.users['0']) fail('Beta is not installed for user 0.');
  if (otherUsers.length > 0) {
    console.error(`\nWARNING — Beta is installed for other users too: ${otherUsers.map(([u]) => u).join(', ')}`);
    process.exit(3);
  }
  console.log('\nBeta installed for user 0 only.');
}

main();
