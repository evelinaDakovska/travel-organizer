import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { DATABASE_NAME } from '../db/client';

/**
 * Travel Organizer Beta must install beside the stable app and never touch it (docs/beta-variant.md).
 * These check the configuration and the build/install guards; the built APK itself is checked by
 * scripts/build-beta.mjs and scripts/install-beta.mjs before it goes anywhere near a phone.
 */

const root = join(__dirname, '..', '..');
// CommonJS config files, read the way Expo and the scripts read them.
const appConfig = require('../../app.config.js');
const guard = require('../../scripts/beta-guard.js');
const { applyBetaSigning } = require('../../plugins/withBetaSigning.js');
const { applySigning } = require('../../plugins/withReleaseSigning.js');
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));

const STABLE = 'com.evelinadakovska.travelorganizer';
const BETA = 'com.evelinadakovska.travelorganizer.beta';

function resolve(variant: string | undefined) {
  const saved = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  try {
    return appConfig({ config: structuredClone(appJson.expo) });
  } finally {
    if (saved === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = saved;
  }
}

/** One file out of a .tgz, without a tar dependency: 512-byte headers, size in octal. */
function fromTarball(tgz: string, name: string): string {
  const tar = gunzipSync(readFileSync(tgz));
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const entry = tar.toString('utf8', offset, offset + 100).replace(/\0.*$/s, '');
    if (!entry) break;
    const size = parseInt(tar.toString('utf8', offset + 124, offset + 136).replace(/\0.*$/s, '').trim(), 8);
    if (entry === name) return tar.toString('utf8', offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${name} not in ${tgz}`);
}

const templateGradle = fromTarball(join(root, 'node_modules', 'expo', 'template.tgz'), 'package/android/app/build.gradle');

/** Block `name { … }` at the indentation it is found at, braces balanced. */
function block(text: string, name: string): string {
  const start = text.search(new RegExp(`\\n\\s*${name} \\{`));
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`${name} block not closed`);
}

const sha = (file: string) => createHash('sha256').update(readFileSync(join(root, file))).digest('hex');

describe('stable identity stays as it is', () => {
  it('without APP_VARIANT the config is app.json, unchanged', () => {
    expect(resolve(undefined)).toEqual(appJson.expo);
    expect(resolve('stable')).toEqual(appJson.expo);
  });

  it('app.json still names the stable package, label, scheme and signing', () => {
    expect(appJson.expo.android.package).toBe(STABLE);
    expect(appJson.expo.name).toBe('Travel Organizer');
    expect(appJson.expo.scheme).toBe('travelorganizer');
    expect(appJson.expo.plugins).toContain('./plugins/withReleaseSigning');
    expect(appJson.expo.android.allowBackup).toBeUndefined();
  });

  it('the stable signing plugin still signs release with the stable keystore', () => {
    const release = block(applySigning(templateGradle), 'release');
    expect(applySigning(templateGradle)).toContain("project.property('TRAVEL_ORGANIZER_STORE_FILE')");
    expect(block(block(applySigning(templateGradle), 'buildTypes'), 'release')).toContain(
      "project.hasProperty('TRAVEL_ORGANIZER_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    expect(release).not.toContain('BETA');
  });

  it('a stable release build without the keystore fails instead of using the debug key (F-03)', () => {
    const gradle = applySigning(templateGradle);
    const guard = gradle.slice(gradle.indexOf('gradle.taskGraph.whenReady'));
    expect(guard).toContain("'packageRelease', 'packageReleaseBundle', 'signReleaseBundle'");
    expect(guard).toContain("!project.hasProperty('TRAVEL_ORGANIZER_STORE_FILE')");
    expect(guard).toContain("!project.hasProperty('TRAVEL_ORGANIZER_ALLOW_DEBUG_SIGNING')");
    expect(guard).toContain('throw new GradleException');
    // Applied once, however often prebuild runs it.
    expect(applySigning(gradle)).toBe(gradle);
    expect(gradle.split('gradle.taskGraph.whenReady')).toHaveLength(2);
  });

  it('an unknown variant is refused rather than falling back to stable', () => {
    expect(() => resolve('Beta')).toThrow(/APP_VARIANT/);
    expect(() => resolve('')).toThrow(/APP_VARIANT/);
  });
});

describe('Beta is a separate app', () => {
  const beta = resolve('beta');

  it('has its own package id, so its own sandbox, database and files', () => {
    expect(beta.android.package).toBe(BETA);
    expect(beta.android.package).not.toBe(STABLE);
  });

  it('is labelled as Beta and has its own icons, different from the stable ones', () => {
    expect(beta.name).toBe('Travel Organizer Beta');
    for (const file of [beta.icon, beta.android.adaptiveIcon.foregroundImage, beta.android.adaptiveIcon.monochromeImage]) {
      expect(existsSync(join(root, file))).toBe(true);
    }
    expect(sha(beta.icon)).not.toBe(sha(appJson.expo.icon));
    expect(sha(beta.android.adaptiveIcon.foregroundImage)).not.toBe(
      sha(appJson.expo.android.adaptiveIcon.foregroundImage),
    );
    expect(sha(beta.android.adaptiveIcon.monochromeImage)).not.toBe(
      sha(appJson.expo.android.adaptiveIcon.monochromeImage),
    );
  });

  it('opens on its own link schemes, valid per RFC 3986, never the stable ones', () => {
    expect(beta.scheme).toBe('travelorganizer-beta');
    expect(beta.scheme).toMatch(/^[a-z][a-z0-9+.-]*$/);
    // expo-dev-client registers exp+<slug> as well.
    expect(beta.slug).toBe('travel-organizer-beta');
    expect(beta.slug).not.toBe(appJson.expo.slug);
  });

  it('receives the same shares as stable, so both appear in the share sheet under their own names', () => {
    const shareIntent = (config: typeof beta) =>
      config.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-share-intent');
    expect(shareIntent(beta)).toEqual(shareIntent(appJson.expo));
  });

  it('is left out of Android cloud backup; stable is not changed', () => {
    expect(beta.android.allowBackup).toBe(false);
  });

  it('keeps every other setting and plugin, swapping only the signing plugin', () => {
    expect(beta.plugins).not.toContain('./plugins/withReleaseSigning');
    expect(beta.plugins).toContain('./plugins/withBetaSigning');
    expect(beta.plugins.filter((p: unknown) => p !== './plugins/withBetaSigning')).toEqual(
      appJson.expo.plugins.filter((p: unknown) => p !== './plugins/withReleaseSigning'),
    );
    expect(beta.version).toBe(appJson.expo.version);
    expect(beta.android.versionCode).toBe(appJson.expo.android.versionCode);
    expect(beta.android.permissions).toEqual(appJson.expo.android.permissions);
  });

  it('is derived only from the stable app.json, never from anything else', () => {
    const other = { ...structuredClone(appJson.expo), android: { ...appJson.expo.android, package: 'com.other' } };
    expect(() => appConfig.betaConfig(other)).toThrow(/refusing/);
  });
});

describe('Beta signing', () => {
  const gradle = applyBetaSigning(templateGradle);
  const release = block(block(gradle, 'buildTypes'), 'release');

  it('never reads the stable keystore', () => {
    expect(gradle).not.toContain('TRAVEL_ORGANIZER_STORE_FILE');
    expect(gradle).not.toContain("'TRAVEL_ORGANIZER_STORE_PASSWORD'");
  });

  it('signs release with a Beta keystore when configured, otherwise the debug key, and is debuggable', () => {
    expect(release).toContain(
      "signingConfig project.hasProperty('TRAVEL_ORGANIZER_BETA_STORE_FILE') ? signingConfigs.beta : signingConfigs.debug",
    );
    expect(release).toMatch(/\n\s+debuggable true/);
    expect(block(gradle, 'signingConfigs')).toContain("project.property('TRAVEL_ORGANIZER_BETA_STORE_FILE')");
  });

  it('fails the Gradle build unless the application id is Beta', () => {
    expect(gradle).toContain("if (id != 'com.evelinadakovska.travelorganizer.beta')");
    expect(gradle).toContain('throw new GradleException');
  });

  it('runs once, and refuses a project still configured for the stable key', () => {
    expect(applyBetaSigning(gradle)).toBe(gradle);
    expect(() => applyBetaSigning(applySigning(templateGradle))).toThrow(/--clean/);
  });

  it('refuses to run for a config that is not the Beta package', () => {
    const withBetaSigning = require('../../plugins/withBetaSigning.js');
    expect(() => withBetaSigning({ ...appJson.expo })).toThrow(/not com\.evelinadakovska\.travelorganizer\.beta/);
  });
});

describe('nothing the two apps share', () => {
  it('every content-provider authority in a native module is derived from the application id', () => {
    const manifests: string[] = [];
    const modules = join(root, 'node_modules');
    for (const name of readdirSync(modules)) {
      const dirs = name.startsWith('@')
        ? readdirSync(join(modules, name)).map((sub) => join(modules, name, sub))
        : [join(modules, name)];
      for (const dir of dirs) {
        const manifest = join(dir, 'android', 'src', 'main', 'AndroidManifest.xml');
        if (existsSync(manifest)) manifests.push(manifest);
      }
    }
    const authorities = manifests.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/android:authorities="([^"]+)"/g)].map((m) => m[1]),
    );
    expect(authorities.length).toBeGreaterThan(0);
    for (const authority of authorities) expect(authority).toMatch(/^\$\{applicationId\}\./);
  });

  it('the database is a bare file name, opened inside the app’s own sandbox', () => {
    expect(DATABASE_NAME).toBe('travel-organizer.db');
    expect(DATABASE_NAME).not.toMatch(/[\\/]/);
  });

  it('app code names no package, sandbox path or link scheme of its own', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    walk(join(root, 'app'));
    walk(join(root, 'src'));
    const offenders = files.filter((file) =>
      /com\.evelinadakovska|\/data\/(user|data)\/|travelorganizer:\/\//.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the build and install guards', () => {
  const badging = (pkg: string, label: string, extra = '') =>
    `package: name='${pkg}' versionCode='33' versionName='0.21.0' platformBuildVersionName='16'\n` +
    `application-label:'${label}'\n${extra}`;
  const DEBUG_CERT = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';

  it('accepts a Beta APK signed with another key', () => {
    const parsed = guard.parseBadging(badging(BETA, 'Travel Organizer Beta', 'application-debuggable\n'));
    expect(parsed).toEqual({
      package: BETA,
      versionCode: '33',
      versionName: '0.21.0',
      label: 'Travel Organizer Beta',
      debuggable: true,
    });
    expect(guard.betaApkProblems({ badging: parsed, certDigests: [DEBUG_CERT] })).toEqual([]);
  });

  it('refuses an APK with the stable package, the stable label or the stable key', () => {
    const problems = guard.betaApkProblems({
      badging: guard.parseBadging(badging(STABLE, 'Travel Organizer')),
      certDigests: [guard.STABLE_CERT_SHA256],
    });
    expect(problems).toHaveLength(3);
    expect(problems.join()).toMatch(/package is 'com\.evelinadakovska\.travelorganizer'/);
    expect(problems.join()).toMatch(/stable app's release key/);
  });

  it('refuses an APK it cannot read', () => {
    expect(guard.betaApkProblems({ badging: guard.parseBadging(''), certDigests: [] })).toHaveLength(3);
  });

  it('reads signer digests from apksigner', () => {
    expect(
      guard.parseCertDigests(`Signer #1 certificate DN: CN=x\nSigner #1 certificate SHA-256 digest: ${DEBUG_CERT.toUpperCase()}\n`),
    ).toEqual([DEBUG_CERT]);
  });

  it('installs only Beta, only for the personal profile, never replacing another app', () => {
    const args = guard.betaInstallArgs('/data/local/tmp/x.apk');
    expect(args).toEqual(['shell', 'pm', 'install', '-R', '--user', '0', '--pkg', BETA, '/data/local/tmp/x.apk']);
    expect(guard.betaInstallArgs('/x', { replace: true })).toContain('-r');
    expect(guard.betaInstallArgs('/x', { replace: true })).toContain(BETA);
  });

  it('replaces an installed Beta only when --replace was given, and otherwise refuses any replacement', () => {
    expect(guard.installPlan({ betaInstalled: true, replaceAuthorised: false }, '/x')).toEqual({
      ok: false,
      reason: expect.stringMatching(/already installed/),
    });
    expect(guard.installPlan({ betaInstalled: true, replaceAuthorised: true }, '/x').args).toContain('-r');
    // Not installed: -R even with --replace, so Android refuses to replace whatever it finds.
    for (const replaceAuthorised of [false, true]) {
      const plan = guard.installPlan({ betaInstalled: false, replaceAuthorised }, '/x');
      expect(plan.args).toContain('-R');
      expect(plan.args).not.toContain('-r');
    }
  });

  it('no script installs, uninstalls or clears by any package but Beta', () => {
    const scripts = ['build-beta.mjs', 'install-beta.mjs', 'beta-guard.js'].map((name) =>
      readFileSync(join(root, 'scripts', name), 'utf8'),
    );
    for (const text of scripts) {
      expect(text).not.toMatch(/\buninstall\b|pm clear|install-existing/);
      expect(text).not.toMatch(/adb[^\n]*install[^\n]*com\.evelinadakovska\.travelorganizer(?!\.beta)/);
    }
  });

  const dumpsys = (name: string, extra = '') => `Packages:
  Package [${name}] (5e7dd8d):
    codePath=/data/app/~~A==/${name}-B==
    versionCode=12 minSdk=24 targetSdk=36
    versionName=0.7.2
    lastUpdateTime=2026-10-16 20:45:20
    signatures=PackageSignatures{49d6e84 version:2, signatures:[42566377], past signatures:[]}
    User 0: ceDataInode=1 installed=true hidden=false
      firstInstallTime=2026-09-18 21:29:43
    User 10: ceDataInode=0 installed=false hidden=false
    User 150: ceDataInode=0 installed=false hidden=false
${extra}`;

  it('reads the stable app’s identity and per-user installs from dumpsys', () => {
    expect(guard.parsePackageState(dumpsys(STABLE))).toEqual({
      name: STABLE,
      versionCode: '12',
      versionName: '0.7.2',
      lastUpdateTime: '2026-10-16 20:45:20',
      firstInstallTime: '2026-09-18 21:29:43',
      signatures: '42566377',
      codePath: `/data/app/~~A==/${STABLE}-B==`,
      users: { '0': true, '10': false, '150': false },
    });
    expect(guard.parsePackageState('Unable to find package: x')).toBeNull();
  });

  it('reports any change to the stable app across an install', () => {
    const before = guard.parsePackageState(dumpsys(STABLE));
    expect(guard.stableChanges(before, guard.parsePackageState(dumpsys(STABLE)))).toEqual([]);
    const updated = guard.parsePackageState(dumpsys(STABLE).replace('versionCode=12', 'versionCode=33'));
    expect(guard.stableChanges(before, updated)).toEqual(['versionCode: 12 → 33']);
    expect(guard.stableChanges(before, null)).toHaveLength(1);
  });
});
