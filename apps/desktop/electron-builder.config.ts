import type { Configuration } from 'electron-builder'

/**
 * Windows code signing (`certificateSubjectName`) and macOS notarization (`APPLE_ID`/
 * `APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, read automatically by electron-builder when
 * `mac.notarize` isn't `false`) are intentionally left pointed at env vars that don't exist yet —
 * a Windows code-signing certificate and an Apple Developer account are real account/cost
 * decisions outside what this repository can provision unilaterally (`PROGRESS.md`'s Decisions
 * Log). The GitHub `publish` target below is real and correct, but `release.yml` is what actually
 * supplies `GH_TOKEN` at publish time; nothing here can push a release on its own.
 */
const config: Configuration = {
  appId: 'dev.rasikstudio.ide',
  productName: 'Rasik Studio',
  copyright: 'Copyright © 2026 Rasik Studio',

  directories: {
    buildResources: 'build',
    output: 'dist-electron',
  },

  files: ['out/**/*'],

  asar: true,
  asarUnpack: ['**/node_modules/node-pty/**'],

  win: {
    target: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    icon: 'build/icon.ico',
    certificateSubjectName: process.env['WIN_CERT_SUBJECT'],
  },

  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['universal'] },
    ],
    icon: 'build/icon.icns',
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // electron-builder v24+'s `notarize` is a plain boolean toggle, not an options object (an
    // older API shape some docs/examples still show) — it reads APPLE_ID/
    // APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID (or the APPLE_API_KEY* trio) from the environment
    // itself once enabled. Explicit `!!process.env['APPLE_ID']` rather than leaving this
    // undefined (which would let electron-builder auto-enable notarization the moment those env
    // vars exist for ANY reason) — this fails closed to "no notarization" until Apple credentials
    // are deliberately configured for this purpose.
    notarize: Boolean(process.env['APPLE_ID']),
  },

  linux: {
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64'] },
      { target: 'rpm', arch: ['x64'] },
    ],
    icon: 'build/icons',
    category: 'Development',
  },

  publish: {
    provider: 'github',
    owner: 'rasik-studio',
    repo: 'rasik-studio',
  },
}

export default config
