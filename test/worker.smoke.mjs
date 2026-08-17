// Smoke test for worker/ — the CORS proxy in front of latitude.sh S3.
// Boots `wrangler dev` locally and checks the three things that can break it:
// preflight is answered, real requests reach VAST with the path intact and
// come back with CORS headers, and unlisted origins are refused.
//
// No credentials needed: an unsigned GET is expected to come back as VAST's
// own AccessDenied, which is exactly what proves the forward worked.
//
// Run: npm run test:worker
import assert from "node:assert";
import { spawn } from "node:child_process";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = "http://localhost:4444";

const wrangler = spawn(
  "npx",
  ["wrangler", "dev", "-c", "worker/wrangler.jsonc", "--port", String(PORT)],
  { stdio: "ignore", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } }
);

async function waitForBoot() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(BASE, { headers: { Origin: ORIGIN } });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("wrangler dev never came up");
}

try {
  await waitForBoot();

  const preflight = await fetch(`${BASE}/workerresolved/`, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,x-amz-date",
    },
  });
  assert.equal(preflight.status, 204, "preflight should be 204");
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    ORIGIN,
    "preflight must echo the origin — its absence is the bug this proxy exists to fix"
  );
  assert.match(
    preflight.headers.get("access-control-allow-headers") ?? "",
    /authorization/,
    "preflight must allow the Authorization header"
  );

  const key = "worker_1786879124782.sqlite";
  const forwarded = await fetch(`${BASE}/workerresolved/${key}`, {
    headers: { Origin: ORIGIN },
  });
  assert.equal(
    forwarded.headers.get("access-control-allow-origin"),
    ORIGIN,
    "forwarded responses must carry CORS headers"
  );
  const body = await forwarded.text();
  assert.match(body, /AccessDenied/, "unsigned request should reach VAST");
  assert.match(
    body,
    new RegExp(`<Resource>${key}</Resource>`),
    "path must arrive unrewritten — SigV4 signs it"
  );

  const blocked = await fetch(`${BASE}/workerresolved/`, {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(blocked.status, 403, "unlisted origin should be refused");
  assert.match(await blocked.text(), /Origin not allowed/);

  console.log("OK — preflight, forward (path intact + CORS), origin allowlist");
} finally {
  wrangler.kill();
}
