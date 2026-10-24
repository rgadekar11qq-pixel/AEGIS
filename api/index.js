const app = require("../src/server");

module.exports = (req, res) => {
  // Debug logging (remove after confirming fix)
  if (req.url === "/health" || req.url === "/_debug") {
    // Let it pass through normally
  }

  // With Vercel "routes" config, req.url should already contain the original path.
  // But if Vercel mangles it to the dest path, restore from headers.
  if (req.url === "/api/index.js" || req.url === "/api" || req.url === "/api/index") {
    // Try multiple Vercel headers to recover the original path
    const original = req.headers["x-invoke-path"]
      || req.headers["x-matched-path"]
      || req.headers["x-vercel-original-url"]
      || "/";
    // x-matched-path may be a pattern like "/(.*)"; don't use patterns
    if (original && !original.includes("(.") && !original.includes("*")) {
      req.url = original;
    } else {
      req.url = "/";
    }
  }

  return app(req, res);
};
