/**
 * The build's identity. `app.json` is the stable app and is never edited for a Beta build: this file
 * returns it unchanged unless APP_VARIANT=beta, and then derives Travel Organizer Beta from it — a
 * separate Android app, with its own package (so its own sandbox, database, files and providers),
 * name, icon, link schemes and signing, installed side by side with the stable one.
 *
 * Build Beta only through `scripts/build-beta.mjs`, which sets the variant and checks the APK.
 * docs/beta-variant.md has the procedure and why each difference exists.
 */

const STABLE_PACKAGE = 'com.evelinadakovska.travelorganizer';
const BETA_PACKAGE = `${STABLE_PACKAGE}.beta`;

const VARIANTS = ['stable', 'beta'];

function variantFrom(env) {
  const value = env.APP_VARIANT ?? 'stable';
  if (!VARIANTS.includes(value)) {
    throw new Error(`APP_VARIANT must be one of ${VARIANTS.join(', ')}; got "${value}"`);
  }
  return value;
}

function betaConfig(config) {
  if (config.android?.package !== STABLE_PACKAGE) {
    throw new Error(`app.json android.package is not ${STABLE_PACKAGE}; refusing to derive Beta from it`);
  }
  return {
    ...config,
    name: `${config.name} Beta`,
    // The dev client registers exp+<slug>; a different slug keeps that scheme apart too.
    slug: `${config.slug}-beta`,
    scheme: `${config.scheme}-beta`,
    icon: './assets/beta/icon.png',
    android: {
      ...config.android,
      package: BETA_PACKAGE,
      // No Android cloud backup of Beta's test data; the in-app backup is unaffected.
      allowBackup: false,
      adaptiveIcon: {
        ...config.android.adaptiveIcon,
        foregroundImage: './assets/beta/android-icon-foreground.png',
        monochromeImage: './assets/beta/android-icon-monochrome.png',
      },
    },
    // Never the stable key: an APK that somehow kept the stable package would then be refused as an
    // update of the stable app instead of replacing it.
    plugins: config.plugins.map((plugin) =>
      plugin === './plugins/withReleaseSigning' ? './plugins/withBetaSigning' : plugin,
    ),
    extra: { ...config.extra, appVariant: 'beta' },
  };
}

module.exports = ({ config }) => {
  const variant = variantFrom(process.env);
  return variant === 'beta' ? betaConfig(config) : config;
};

module.exports.STABLE_PACKAGE = STABLE_PACKAGE;
module.exports.BETA_PACKAGE = BETA_PACKAGE;
module.exports.variantFrom = variantFrom;
module.exports.betaConfig = betaConfig;
