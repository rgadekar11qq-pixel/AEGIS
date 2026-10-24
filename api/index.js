const app = require("../src/server");

module.exports = (req, res) => {
  // ─── Debug endpoint: placed here BEFORE Express to bypass all middleware ───
  // This helps diagnose what Vercel actually sends to the serverless function.
  if (req.url === "/_debug" || (req.url && req.url.startsWith("/_debug"))) {
    return res.end(JSON.stringify({
      raw_url: req.url,
      method: req.method,
      headers: {
        "x-matched-path": req.headers["x-matched-path"] || null,
        "x-invoke-path": req.headers["x-invoke-path"] || null,
        "x-invoke-query": req.headers["x-invoke-query"] || null,
        "x-vercel-id": req.headers["x-vercel-id"] || null,
        "x-forwarded-proto": req.headers["x-forwarded-proto"] || null,
        "x-forwarded-host": req.headers["x-forwarded-host"] || null,
        "host": req.headers["host"] || null,
        "cookie": req.headers["cookie"] ? "(present, length=" + req.headers["cookie"].length + ")" : "(absent)"
      },
      query: req.query || null
    }, null, 2));
  }

  // ─── URL Normalization for Vercel Serverless ───
  // With Vercel "routes" config: { "src": "/(.*)", "dest": "/api/index.js" }
  // Vercel sets req.url to the dest path and passes the original via headers.
  //
  // x-invoke-path: contains the actual user-requested path (e.g., "/login")
  // x-invoke-query: contains the original query string as JSON
  // x-matched-path: contains the route pattern (e.g., "/(.*)")
  
  const invokePath = req.headers["x-invoke-path"];
  
  if (invokePath && invokePath !== "/api/index.js") {
    // Vercel told us the real path — use it
    let realUrl = invokePath;
    
    // Restore query string from x-invoke-query if present
    const invokeQuery = req.headers["x-invoke-query"];
    if (invokeQuery) {
      try {
        const queryObj = JSON.parse(invokeQuery);
        const qs = Object.entries(queryObj)
          .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
          .join("&");
        if (qs) realUrl += "?" + qs;
      } catch (e) {}
    }
    
    req.url = realUrl;
  } else if (req.url === "/api/index.js" || req.url === "/api" || req.url === "/api/index" || (req.url && req.url.startsWith("/api/index.js?"))) {
    // Fallback: req.url is the dest path, no x-invoke-path header
    req.url = "/";
  }

  return app(req, res);
};
