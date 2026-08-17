/**
 * CORS proxy for latitude.sh object storage.
 *
 * latitude's gateway (VAST) sends no CORS headers and answers PutBucketCors
 * with NotImplemented — probing `?cors` vs `?lifecycle` unauthenticated shows
 * NotImplemented vs AccessDenied — so a browser cannot talk to it directly.
 *
 * SigV4 signs the `host` header AND the URI path, so this proxy must forward
 * both untouched. The browser signs for S3_ENDPOINT's host and merely *sends*
 * here; a Worker's outbound Host always follows its URL, so fetching
 * S3_ENDPOINT + the original path restores exactly what was signed.
 *
 * No credentials live here — it relays requests the browser already signed.
 * Anyone hitting it still needs valid keys; the origin allowlist just stops it
 * being a general-purpose relay to latitude.
 */

type Env = {
  S3_ENDPOINT: string;
  ALLOWED_ORIGINS: string;
};

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    // "*" is legal here because we never send credentials (cookies); it saves
    // enumerating content-length/etag/x-amz-* for the download progress bar.
    "Access-Control-Expose-Headers": "*",
    Vary: "Origin",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    if (!allowed.includes(origin)) {
      return new Response(`Origin not allowed: ${origin || "(none)"}\n`, {
        status: 403,
      });
    }

    // Answer the preflight ourselves — forwarding it just gets a 204 with no
    // Access-Control-Allow-Origin, which is the whole problem.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "Access-Control-Allow-Methods": "GET,HEAD,PUT,POST,DELETE",
          "Access-Control-Allow-Headers":
            request.headers.get("Access-Control-Request-Headers") ?? "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const incoming = new URL(request.url);
    const target = new URL(env.S3_ENDPOINT);
    target.pathname = incoming.pathname;
    target.search = incoming.search;

    const upstream = await fetch(new Request(target.toString(), request), {
      // Never replay a signed Authorization header to a host the browser
      // didn't sign for.
      redirect: "manual",
    });

    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);

    // Body is passed through as a stream — these objects run to ~100MB.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
