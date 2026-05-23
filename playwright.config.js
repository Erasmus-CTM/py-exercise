// Local server for browser tests
module.exports = {
  testDir: "./tests",

  use: {
    baseURL: "http://localhost:8000",
  },

  webServer: {
    command: "python -m http.server 8000",
    port: 8000,
    reuseExistingServer: true,
  },
  expect: {
    // pyodide is SLOW
    timeout: 60 * 1000,
  },
};
