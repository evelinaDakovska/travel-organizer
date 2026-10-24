/**
 * Release signing for Travel Organizer Beta (APP_VARIANT=beta), used by app.config.js in place of
 * withReleaseSigning. Beta is NEVER signed with the stable app's key: Android accepts an update only
 * from the same key, so if a Beta build ever carried the stable package by mistake, installing it
 * would fail instead of replacing the stable app and migrating its real data.
 *
 * - Signed with a Beta keystore when TRAVEL_ORGANIZER_BETA_STORE_FILE (+ _PASSWORD, _KEY_ALIAS,
 *   _KEY_PASSWORD) are Gradle properties, otherwise with the debug key. The stable properties
 *   (TRAVEL_ORGANIZER_STORE_FILE …) are never read.
 * - Debuggable, so the Beta sandbox (synthetic data only) can be inspected with `run-as` during QA.
 * - The build fails unless the application id is the Beta one.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const BETA_PACKAGE = 'com.evelinadakovska.travelorganizer.beta';
const MARKER = 'TRAVEL_ORGANIZER_BETA_STORE_FILE';

const SIGNING_CONFIG = `
        beta {
            if (project.hasProperty('${MARKER}')) {
                storeFile file(project.property('${MARKER}'))
                storePassword project.property('TRAVEL_ORGANIZER_BETA_STORE_PASSWORD')
                keyAlias project.property('TRAVEL_ORGANIZER_BETA_KEY_ALIAS')
                keyPassword project.property('TRAVEL_ORGANIZER_BETA_KEY_PASSWORD')
            }
        }`;

const GUARD = `
// TRAVEL_ORGANIZER_BETA_GUARD: a Beta build must never produce the stable application id.
afterEvaluate {
    def id = android.defaultConfig.applicationId
    if (id != '${BETA_PACKAGE}') {
        throw new GradleException("Travel Organizer Beta build has applicationId '" + id + "', expected '${BETA_PACKAGE}'")
    }
}
`;

function applyBetaSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  if (gradle.includes('TRAVEL_ORGANIZER_STORE_FILE')) {
    throw new Error('withBetaSigning: the stable signing config is present; prebuild Beta with --clean');
  }

  const signingConfigs = /signingConfigs \{\n(\s+)debug \{[\s\S]*?\n\1\}/;
  if (!signingConfigs.test(gradle)) throw new Error('withBetaSigning: signingConfigs block not found');
  let next = gradle.replace(signingConfigs, (block) => block + SIGNING_CONFIG);

  const releaseUsesDebug = /(release \{\n(?:\s*\/\/.*\n)*(\s*))signingConfig signingConfigs\.debug/;
  if (!releaseUsesDebug.test(next)) throw new Error('withBetaSigning: release signingConfig not found');
  next = next.replace(
    releaseUsesDebug,
    `$1signingConfig project.hasProperty('${MARKER}') ? signingConfigs.beta : signingConfigs.debug\n$2debuggable true`,
  );
  return next + GUARD;
}

module.exports = function withBetaSigning(config) {
  if (config.android?.package !== BETA_PACKAGE) {
    throw new Error(`withBetaSigning: android.package is ${config.android?.package}, not ${BETA_PACKAGE}`);
  }
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyBetaSigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applyBetaSigning = applyBetaSigning;
module.exports.BETA_PACKAGE = BETA_PACKAGE;
