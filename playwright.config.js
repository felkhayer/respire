const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PORT || 4173;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:' + PORT,
    // Le service worker est testé à part (tests/pwa-hors-ligne.spec.js) : ailleurs il
    // empêcherait d'intercepter le CDN NoSleep.
    serviceWorkers: 'block',
    // Les tests décrivent l'interface française (langue détectée via navigator.language) ;
    // tests/internationalisation.spec.js change de locale pour vérifier l'anglais.
    locale: 'fr-FR',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/helpers/server.js',
    url: 'http://127.0.0.1:' + PORT,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) }
  }
});
