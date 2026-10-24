/**
 * The checks that keep a Beta build and install away from the stable app, shared by
 * scripts/build-beta.mjs and scripts/install-beta.mjs and tested in src/config/betaVariant.test.ts.
 * Pure functions over the text that aapt2, apksigner and `dumpsys package` print.
 */

const STABLE_PACKAGE = 'com.evelinadakovska.travelorganizer';
const BETA_PACKAGE = `${STABLE_PACKAGE}.beta`;
const BETA_LABEL = 'Travel Organizer Beta';
/** The stable app's release certificate (docs/windows-handoff.md); Beta must never carry it. */
const STABLE_CERT_SHA256 = '638dc686bdb7e5e6ce645935c020b5c4e36f14a3937cc0e617831268b45235e7';

/** `aapt2 dump badging` → the fields the checks need. */
function parseBadging(text) {
  const field = (pattern) => text.match(pattern)?.[1] ?? null;
  return {
    package: field(/^package: name='([^']+)'/m),
    versionCode: field(/^package: .*?versionCode='([^']+)'/m),
    versionName: field(/^package: .*?versionName='([^']*)'/m),
    label: field(/^application-label:'([^']*)'/m),
    debuggable: /^application-debuggable/m.test(text),
  };
}

/** `apksigner verify --print-certs` → every signer's certificate SHA-256, lower case. */
function parseCertDigests(text) {
  return [...text.matchAll(/certificate SHA-256 digest: ([0-9a-f]{64})/gi)].map((m) => m[1].toLowerCase());
}

/** Everything wrong with an APK that is about to be installed as Beta; empty when it is safe. */
function betaApkProblems({ badging, certDigests }) {
  const problems = [];
  if (badging.package !== BETA_PACKAGE) {
    problems.push(`package is '${badging.package}', not '${BETA_PACKAGE}'`);
  }
  if (badging.label !== BETA_LABEL) problems.push(`label is '${badging.label}', not '${BETA_LABEL}'`);
  if (certDigests.length === 0) problems.push('no signing certificate found');
  if (certDigests.includes(STABLE_CERT_SHA256)) {
    problems.push("signed with the stable app's release key");
  }
  return problems;
}

/**
 * `dumpsys package <pkg>` → what must not change on the stable app, and per Android user whether
 * the package is installed there. Null when the package is unknown to the device.
 */
function parsePackageState(text) {
  if (!/^\s*Package \[/m.test(text)) return null;
  const field = (pattern) => text.match(pattern)?.[1] ?? null;
  const users = {};
  for (const m of text.matchAll(/^\s*User (\d+):.*?installed=(true|false)/gm)) {
    users[m[1]] = m[2] === 'true';
  }
  return {
    name: field(/^\s*Package \[([^\]]+)\]/m),
    versionCode: field(/versionCode=(\d+)/),
    versionName: field(/versionName=(\S+)/),
    lastUpdateTime: field(/lastUpdateTime=([^\n\r]+)/)?.trim() ?? null,
    firstInstallTime: field(/firstInstallTime=([^\n\r]+)/)?.trim() ?? null,
    signatures: field(/signatures=PackageSignatures\{\S+ version:\d+, signatures:\[([^\]]*)\]/),
    codePath: field(/codePath=(\S+)/),
    users,
  };
}

/** Differences between two stable-app states, as readable lines; empty when nothing changed. */
function stableChanges(before, after) {
  if (!before || !after) return ['the stable app could not be read before and after'];
  const keys = ['name', 'versionCode', 'versionName', 'lastUpdateTime', 'firstInstallTime', 'signatures', 'codePath'];
  const changes = keys
    .filter((key) => before[key] !== after[key])
    .map((key) => `${key}: ${before[key]} → ${after[key]}`);
  if (JSON.stringify(before.users) !== JSON.stringify(after.users)) {
    changes.push(`users: ${JSON.stringify(before.users)} → ${JSON.stringify(after.users)}`);
  }
  return changes;
}

/**
 * The one install command the procedure allows: Beta only (`--pkg`, enforced by the platform), the
 * personal profile only (`--user 0`), never replacing an app unless Beta itself is being updated.
 */
function betaInstallArgs(devicePath, { replace = false } = {}) {
  return ['shell', 'pm', 'install', replace ? '-r' : '-R', '--user', '0', '--pkg', BETA_PACKAGE, devicePath];
}

/**
 * Whether to install, and how: an installed Beta is replaced only when the person passed --replace;
 * otherwise `-R`, so Android itself refuses to replace anything (`pm install` replaces by default).
 */
function installPlan({ betaInstalled, replaceAuthorised }, devicePath) {
  if (betaInstalled && !replaceAuthorised) {
    return { ok: false, reason: 'Beta is already installed. Pass --replace to update Beta itself.' };
  }
  return { ok: true, args: betaInstallArgs(devicePath, { replace: betaInstalled }) };
}

module.exports = {
  STABLE_PACKAGE,
  BETA_PACKAGE,
  BETA_LABEL,
  STABLE_CERT_SHA256,
  parseBadging,
  parseCertDigests,
  betaApkProblems,
  parsePackageState,
  stableChanges,
  betaInstallArgs,
  installPlan,
};
