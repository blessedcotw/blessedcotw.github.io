/**
 * Cloudflare Worker — GitHub API Proxy untuk SongRepo
 * ====================================================
 * Deploy ke: songrepo-userdata.mm-cotw.workers.dev
 *
 * Environment Secrets yang diperlukan (atur di Cloudflare Dashboard):
 *   - GITHUB_TOKEN       : GitHub Personal Access Token (PAT)
 *   - ADMIN_PASSWORD_HASH: SHA-256 hash dari password admin
 *
 * Routing:
 *   GET    /github/*  → Proxy ke api.github.com (publik, tidak perlu auth)
 *   PUT    /github/*  → Proxy ke api.github.com (memerlukan X-Admin-Hash header yang valid)
 *   DELETE /github/*  → Proxy ke api.github.com (memerlukan X-Admin-Hash header yang valid)
 *   POST   /github/*  → Proxy ke api.github.com (memerlukan X-Admin-Hash header yang valid)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Hash',
  'Access-Control-Max-Age': '86400',
};

/**
 * Verifikasi apakah hash yang dikirim browser cocok dengan ADMIN_PASSWORD_HASH di secret.
 * Menggunakan timing-safe comparison untuk mencegah timing attacks.
 */
async function verifyAdminHash(providedHash, expectedHash) {
  if (!providedHash || !expectedHash) return false;
  if (providedHash.length !== expectedHash.length) return false;

  // Timing-safe string comparison menggunakan Web Crypto
  const enc = new TextEncoder();
  const a = enc.encode(providedHash.toLowerCase());
  const b = enc.encode(expectedHash.toLowerCase());

  const key = await crypto.subtle.importKey(
    'raw', enc.encode('songrepo-timing-key'),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigA = await crypto.subtle.sign('HMAC', key, a);
  const sigB = await crypto.subtle.sign('HMAC', key, b);

  const arrA = new Uint8Array(sigA);
  const arrB = new Uint8Array(sigB);
  let diff = 0;
  for (let i = 0; i < arrA.length; i++) {
    diff |= arrA[i] ^ arrB[i];
  }
  return diff === 0;
}

/**
 * Buat response JSON dengan CORS headers.
 */
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

/**
 * Buat response error dengan pesan yang jelas.
 */
function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Pastikan GITHUB_TOKEN dikonfigurasi
    if (!env.GITHUB_TOKEN) {
      return errorResponse('Worker configuration error: GITHUB_TOKEN secret not set.', 500);
    }

    // Route: POST /auth/verify → cek apakah X-Admin-Hash valid
    if (url.pathname === '/auth/verify' && method === 'POST') {
      const providedHash = request.headers.get('X-Admin-Hash');
      const expectedHash = env.ADMIN_PASSWORD_HASH;

      if (!expectedHash) {
        return errorResponse('Worker configuration error: ADMIN_PASSWORD_HASH secret not set.', 500);
      }

      const isValid = await verifyAdminHash(providedHash, expectedHash);
      if (!isValid) {
        return errorResponse('Kata sandi salah.', 403);
      }
      return jsonResponse({ ok: true });
    }

    // Route: /github/* → proxy ke api.github.com
    if (url.pathname.startsWith('/github/')) {
      // Ambil path setelah /github/
      const githubPath = url.pathname.slice('/github/'.length);
      const githubUrl = `https://api.github.com/${githubPath}${url.search}`;

      // --- WRITE OPERATIONS: Harus ada X-Admin-Hash yang valid ---
      const writeMethods = ['PUT', 'POST', 'DELETE', 'PATCH'];
      if (writeMethods.includes(method)) {
        const providedHash = request.headers.get('X-Admin-Hash');
        const expectedHash = env.ADMIN_PASSWORD_HASH;

        if (!expectedHash) {
          return errorResponse('Worker configuration error: ADMIN_PASSWORD_HASH secret not set.', 500);
        }

        const isValid = await verifyAdminHash(providedHash, expectedHash);
        if (!isValid) {
          return errorResponse('Akses ditolak: hash kata sandi admin tidak valid.', 403);
        }
      }

      // --- Buat request ke GitHub API ---
      const githubHeaders = {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'SongRepo-CloudflareWorker/1.0',
      };

      let body = undefined;
      if (['PUT', 'POST', 'PATCH'].includes(method)) {
        body = await request.text();
      } else if (method === 'DELETE') {
        // DELETE bisa punya body (diperlukan oleh GitHub API untuk file deletion)
        const bodyText = await request.text();
        if (bodyText) body = bodyText;
      }

      const githubRequest = new Request(githubUrl, {
        method,
        headers: githubHeaders,
        body: body || undefined,
      });

      let githubResponse;
      try {
        githubResponse = await fetch(githubRequest);
      } catch (e) {
        return errorResponse(`Gagal menghubungi GitHub API: ${e.message}`, 502);
      }

      // Teruskan response dari GitHub ke browser dengan CORS headers
      const responseBody = await githubResponse.text();
      return new Response(responseBody, {
        status: githubResponse.status,
        headers: {
          'Content-Type': githubResponse.headers.get('Content-Type') || 'application/json',
          ...CORS_HEADERS,
        },
      });
    }

    // Route tidak dikenali → info endpoint
    return new Response(JSON.stringify({
      message: 'SongRepo Worker aktif.',
      routes: ['GET /github/*', 'PUT /github/*', 'DELETE /github/*']
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  },
};
