// Playwright config for the end-to-end journey. Runs against a production build (`next start`)
// wired to a LOCAL Supabase stack started in CI — never against production data.
export default {
  testDir: ".",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000", trace: "off", screenshot: "only-on-failure" },
  outputDir: "../e2e-results",
};
