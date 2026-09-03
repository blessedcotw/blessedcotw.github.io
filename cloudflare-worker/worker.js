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

    // Pengecekan rate limiting binding native jika terkonfigurasi
    if ((url.pathname === '/auth/verify' && method === 'POST') || 
        (url.pathname.startsWith('/github/') && ['PUT', 'POST', 'DELETE', 'PATCH'].includes(method))) {
      if (env.RATE_LIMITER) {
        const ipAddress = request.headers.get('cf-connecting-ip') || 'unknown';
        try {
          const { success } = await env.RATE_LIMITER.limit({ key: ipAddress });
          if (!success) {
            return errorResponse('Terlalu banyak permintaan (Rate Limit terlampaui). Silakan coba lagi nanti.', 429);
          }
        } catch (e) {
          console.warn('Gagal memverifikasi rate limit:', e.message);
        }
      }
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

    // Route: GET /youtube-feed → proxy ke YouTube Channel & Generate RSS/XML
    if (url.pathname === '/youtube-feed' && method === 'GET') {
      try {
        // Try direct YouTube RSS first
        const ytUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6VkYFvyt-KJ47wvfxSHt6Q';
        const res = await fetch(ytUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/xml, text/xml, */*'
          }
        });

        if (res.ok) {
          const xmlText = await res.text();
          return new Response(xmlText, {
            status: 200,
            headers: { 'Content-Type': 'application/xml; charset=utf-8', ...CORS_HEADERS }
          });
        }

        // Fallback: Scrape channel HTML page directly to construct Feed XML
        const htmlRes = await fetch('https://www.youtube.com/@GPdICOTWTemanggung/videos', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });

        const html = await htmlRes.text();

        // Extract video ID, Title, and published Date accurately
        const entries = [];
        const seen = new Set();

        const titleMatches = [...html.matchAll(/"lockupMetadataViewModel":\{"title":\{"content":"([^"]+)"\}/g)];

        const monthsMap = {
          'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
          'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
        };

        titleMatches.forEach(m => {
          const rawTitle = m[1].replace(/[\r\n]+/g, ' ').trim();
          const start = m.index;
          const prevSnippet = html.substring(Math.max(0, start - 3000), start);
          const watchMatch = [...prevSnippet.matchAll(/\/watch\?v=([A-Za-z0-9_-]{11})/g)];
          if (watchMatch.length > 0) {
            const id = watchMatch[watchMatch.length - 1][1];
            if (!seen.has(id) && rawTitle) {
              seen.add(id);

              let pubDate = null;
              const dateMatch = rawTitle.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);
              if (dateMatch) {
                const day = parseInt(dateMatch[1], 10);
                const monthStr = dateMatch[2].toLowerCase();
                const year = parseInt(dateMatch[3], 10);
                const monthIdx = monthsMap[monthStr];
                if (monthIdx !== undefined) {
                  pubDate = new Date(Date.UTC(year, monthIdx, day, 0, 0, 0));
                }
              }

              // Filter out cover songs / non-renungan videos (e.g. TANAH AIRKU Cover)
              const isRenungan = /renungan/i.test(rawTitle) || /pagi/i.test(rawTitle);
              if (isRenungan && pubDate) {
                entries.push({ id, title: rawTitle, published: pubDate.toISOString() });
              }
            }
          }
        });

        // Backup fallback
        if (entries.length === 0) {
          const videoIds = [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(m => m[1]))];
          videoIds.slice(0, 15).forEach(id => {
            entries.push({ id, title: 'Renungan Pagi GPdI COTW Temanggung', published: new Date().toISOString() });
          });
        }

        let xmlEntries = '';
        entries.slice(0, 20).forEach(v => {
          xmlEntries += `
    <entry>
      <id>yt:video:${v.id}</id>
      <yt:videoId>${v.id}</yt:videoId>
      <title>${v.title}</title>
      <published>${v.published}</published>
    </entry>`;
        });

        const customXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>GPdI COTW Temanggung</title>
  ${xmlEntries}
</feed>`;

        return new Response(customXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml; charset=utf-8', ...CORS_HEADERS }
        });

      } catch (e) {
        return errorResponse(`Gagal mengambil YouTube feed: ${e.message}`, 502);
      }
    }

    // Route tidak dikenali → info endpoint
    return new Response(JSON.stringify({
      message: 'SongRepo Worker aktif.',
      routes: ['GET /youtube-feed', 'GET /github/*', 'PUT /github/*', 'DELETE /github/*']
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  },
};
