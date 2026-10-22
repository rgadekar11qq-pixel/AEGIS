const app = require("../src/server");

module.exports = (req, res) => {
  // Normalize req.url if Vercel serverless rewrote the path
  const matchedPath = req.headers["x-matched-path"] || req.headers["x-invoke-path"];
  if (matchedPath && matchedPath !== "/api/index.js" && !req.url.startsWith("/auth") && !req.url.startsWith("/aegis") && !req.url.startsWith("/login")) {
    req.url = matchedPath;
  }
  return app(req, res);
};
