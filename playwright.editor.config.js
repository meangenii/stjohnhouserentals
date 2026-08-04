import { defineConfig } from 'playwright/test'

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  snapshotPathTemplate: '{testDir}/editor-responsive-visual-snapshots/{arg}{ext}',
  testDir: './scripts',
  testMatch: 'editor-responsive-visual.spec.mjs',
  timeout: 45000,
})
