const app = require("../src/server");

module.exports = (req, res) => {
  // If Vercel serverless rewrote the URL to /api/index.js, restore the original request path
  if (req.url === "/api/index.js" || req.url === "/api" || req.url.startsWith("/api/index.js?")) {
    const original = req.headers["x-matched-path"] || req.headers["x-invoke-path"] || "/";
    req.url = original;
  }
  return app(req, res);
};
