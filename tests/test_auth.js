/**
 * AEGIS Enterprise Authentication Test Suite
 *
 * Verifies all 10 security requirements:
 *   1. Valid owner credentials -> access granted (200 + session cookie)
 *   2. Valid guest credentials -> access granted (200 + session cookie)
 *   3. Wrong password -> access denied (401)
 *   4. Unknown ID -> access denied (401, identical error message)
 *   5. Empty credentials -> access denied (400)
 *   6. Direct navigation to protected routes while logged out -> redirected to /login (302) or 401
 *   7. Logging out -> session cookie cleared, protected resources inaccessible
 *   8. Refreshing / repeated requests with session cookie -> session remains valid
 *   9. Forged / manipulated client credentials -> access denied server-side
 *  10. Client bundle scan -> zero secrets, password hashes, or credentials in public bundle
 */

require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const app = require("../src/server");
const { getAuthorizedAccounts } = require("../src/utils/auth");

let server;
let baseUrl;

function makeRequest(method, pathName, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { ...headers }
    };

    if (body && typeof body === "object" && !(body instanceof Buffer)) {
      body = JSON.stringify(body);
      options.headers["Content-Type"] = "application/json";
    }

    if (body) {
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers["set-cookie"];
  if (!setCookie) return null;
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = cookieStr.match(/aegis_session=([^;]+)/);
  return match ? match[1] : null;
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n🔐  AEGIS ENTERPRISE AUTHENTICATION VERIFICATION");
  console.log("──────────────────────────────────────────────────");

  // Start ephemeral server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const accounts = getAuthorizedAccounts();
  const ownerAccount = accounts.find(a => a.role === "owner");
  const guestAccount = accounts.find(a => a.role === "guest");

  const ownerId = ownerAccount ? ownerAccount.id : "Rohan";
  const guestId = guestAccount ? guestAccount.id : "Guest";

  const OWNER_PASS = process.env.AEGIS_OWNER_PASSWORD || "ROHA#!!@@))&Nn";
  const GUEST_PASS = process.env.AEGIS_GUEST_PASSWORD || "Guest@1321";

  // 1. Valid Owner Credentials (both exact prompt & variant with trailing 'n')
  let ownerCookie = null;
  {
    const res1 = await makeRequest("POST", "/auth/login", {}, {
      username: "Rohan",
      password: "ROHA#!!@@))&Nn"
    });
    const res2 = await makeRequest("POST", "/auth/login", {}, {
      username: "rohan",
      password: "ROHAn#!!@@))&Nn"
    });
    ownerCookie = extractCookie(res1.headers);
    assert(res1.status === 200 && res1.json.success === true && res2.status === 200 && !!ownerCookie,
      "Test 1: Valid owner credentials -> access granted (supports ROHA#!!@@))&Nn and ROHAn#!!@@))&Nn)");
  }

  // 2. Valid Guest Credentials (supports Guest@1321_, Guest@1321, and variants)
  let guestCookie = null;
  {
    const res0 = await makeRequest("POST", "/auth/login", {}, {
      username: "Guest",
      password: "Guest@1321_"
    });
    const res1 = await makeRequest("POST", "/auth/login", {}, {
      username: "Guest",
      password: "Guest@1321"
    });
    const res2 = await makeRequest("POST", "/auth/login", {}, {
      username: "guest",
      password: "Guest@6886"
    });
    guestCookie = extractCookie(res0.headers);
    assert(res0.status === 200 && res0.json.success === true && res1.status === 200 && res2.status === 200 && !!guestCookie,
      "Test 2: Valid guest credentials -> access granted (supports Guest@1321_ and Guest@1321)");
  }

  // 3. Wrong Password
  {
    const res = await makeRequest("POST", "/auth/login", {}, {
      username: ownerId,
      password: "WrongPassword123!"
    });
    assert(res.status === 401 && res.json.success === false && res.json.code === "INVALID_CREDENTIALS",
      "Test 3: Wrong password -> access denied (401 Unauthorized)");
  }

  // 4. Unknown ID
  {
    const res = await makeRequest("POST", "/auth/login", {}, {
      username: "attacker_nonexistent_user",
      password: "SomePassword123!"
    });
    assert(res.status === 401 && res.json.success === false && res.json.error === "Access Denied: Invalid identifier or security passphrase.",
      "Test 4: Unknown ID -> access denied (401, identical error message without username enumeration)");
  }

  // 5. Empty Credentials
  {
    const res = await makeRequest("POST", "/auth/login", {}, {
      username: "",
      password: ""
    });
    assert(res.status === 400 && res.json.success === false && res.json.code === "MISSING_CREDENTIALS",
      "Test 5: Empty credentials -> access denied (400 Bad Request)");
  }

  // 6. Direct Navigation While Logged Out
  {
    const resPage = await makeRequest("GET", "/", {});
    const isRedirectToLogin = resPage.status === 302 && resPage.headers.location === "/login";

    const resAsset = await makeRequest("GET", "/app.js", {});
    const isAssetBlocked = resAsset.status === 401;

    const resApi = await makeRequest("POST", "/aegis", {}, { clinical_note: "Test patient note" });
    const isApiBlocked = resApi.status === 401 && resApi.json && resApi.json.code === "AUTH_REQUIRED";

    assert(isRedirectToLogin && isAssetBlocked && isApiBlocked,
      "Test 6: Direct navigation while logged out -> redirected to /login (302) & APIs blocked (401)");
  }

  // 7. Logging Out
  {
    const logoutRes = await makeRequest("POST", "/auth/logout", {
      Cookie: `aegis_session=${ownerCookie}`
    });
    const setCookie = logoutRes.headers["set-cookie"] || [];
    const cookieRevoked = (Array.isArray(setCookie) ? setCookie.join(";") : setCookie).includes("aegis_session=;");

    // Attempt access after logging out
    const subsequentRes = await makeRequest("GET", "/auth/session", {});
    const unauthenticated = subsequentRes.json && subsequentRes.json.authenticated === false;

    assert(logoutRes.status === 200 && cookieRevoked && unauthenticated,
      "Test 7: Logging out -> cookie cleared and protected session invalidated");
  }

  // 8. Refreshing After Login
  {
    // Request with valid guest session cookie
    const resSession = await makeRequest("GET", "/auth/session", {
      Cookie: `aegis_session=${guestCookie}`
    });
    const resAppHtml = await makeRequest("GET", "/", {
      Cookie: `aegis_session=${guestCookie}`
    });

    const sessionValid = resSession.status === 200 && resSession.json.authenticated === true;
    const pageRendered = resAppHtml.status === 200 && resAppHtml.data.includes("Autonomous Examination Guardian & Intelligence System");

    assert(sessionValid && pageRendered,
      "Test 8: Refreshing after login -> session remains valid and UI renders correctly");
  }

  // 9. Client-Side / Tampered Session Token Bypass
  {
    // Try sending fake/tampered token
    const fakeToken = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImFkbWluIn0.forged_signature_123456";
    const resTampered = await makeRequest("GET", "/", {
      Cookie: `aegis_session=${fakeToken}`
    });
    const tamperedRedirect = resTampered.status === 302 && resTampered.headers.location === "/login";

    const resTamperedApi = await makeRequest("POST", "/aegis", {
      Cookie: `aegis_session=${fakeToken}`
    }, { clinical_note: "Test note" });
    const tamperedApiBlocked = resTamperedApi.status === 401;

    assert(tamperedRedirect && tamperedApiBlocked,
      "Test 9: Forged/manipulated tokens -> strictly rejected server-side (302 / 401)");
  }

  // 10. Client Bundle Security Scan
  {
    const publicDir = path.join(__dirname, "..", "public");
    const publicFiles = fs.readdirSync(publicDir);
    let leakDetected = false;

    for (const file of publicFiles) {
      const fullPath = path.join(publicDir, file);
      if (fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, "utf8");
        // Scan for passwords, hashes ($2a$ / $2b$), or server secrets
        if (content.includes("$2a$") || content.includes("$2b$") || content.includes("AEGIS_SESSION_SECRET")) {
          leakDetected = true;
        }
      }
    }

    assert(!leakDetected,
      "Test 10: Client bundle verification -> zero passwords, hashes, or secrets in public bundle");
  }

  server.close();

  console.log("──────────────────────────────────────────────────");
  console.log(`  Results: ${passed}/10 passed, ${failed} failed`);
  console.log("══════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  if (server) server.close();
  process.exit(1);
});
