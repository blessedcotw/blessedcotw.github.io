/**
 * SongRepo Cloud Filename Migration Script
 * ========================================
 * Jalankan script ini menggunakan Node.js di terminal:
 *   node migrate-filenames.js
 * 
 * Script ini akan memindahkan/mengubah nama file user-generated di repositori
 * GitHub Anda dari format lama (manual_xxx_decoded.txt) ke format baru (manual_judul_lagu.txt),
 * memperbarui library-manifest.json, dan menghapus cache jsDelivr CDN.
 */

const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question, defaultValue = '') {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function sha256(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
}

function sanitizeFilename(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
}

function parseTitleFromText(fname, text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let title = fname.replace(/\.txt$/i, '');
  if (lines[0] && /^title\s*:/i.test(lines[0])) {
    title = lines[0].replace(/^title\s*:/i, '').trim();
  }
  // bersihkan title dari penamaan aneh
  let t = (title || '').replace(/_/g, ' ').replace(/[()]/g, ' ');
  t = t.split(/\s+/).filter(w => w && !/^(decoded|animasi|chords?)$/i.test(w)).join(' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^-+\s*/, '').replace(/\s*-+$/, '').trim();
  return t || title;
}

async function purgeJsDelivr(repo, branch, path) {
  try {
    const url = `https://purge.jsdelivr.net/gh/${repo}@${branch}/${path}`;
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      console.log(`[CDN] Purged: ${path}`);
    } else {
      await fetch(url, { method: 'GET' });
      console.log(`[CDN] Purged (GET fallback): ${path}`);
    }
  } catch (e) {
    console.warn(`[CDN] Gagal purge ${path}:`, e.message);
  }
}

async function main() {
  console.log('=== SongRepo Cloud Filename Migration ===\n');

  const workerUrl = await ask('Masukkan URL Cloudflare Worker', 'https://songrepo-userdata.mm-cotw.workers.dev');
  const repo = await ask('Masukkan Repositori GitHub', 'blessedcotw/SongRepo_userdata');
  const branch = await ask('Masukkan Branch', 'main');
  const password = await ask('Masukkan Kata Sandi Admin (tidak ditampilkan di layar)');

  rl.close();

  if (!password) {
    console.error('Error: Kata sandi wajib diisi.');
    return;
  }

  const hash = await sha256(password);
  console.log('\nMemverifikasi kata sandi admin ke Worker...');
  
  try {
    const authRes = await fetch(`${workerUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'X-Admin-Hash': hash }
    });
    if (!authRes.ok) {
      throw new Error(`Autentikasi gagal (HTTP ${authRes.status}). Pastikan kata sandi benar.`);
    }
    console.log('Autentikasi sukses!');
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return;
  }

  console.log('\nMendapatkan library-manifest.json terbaru dari GitHub...');
  let manifestSha = null;
  let manifestList = [];
  try {
    const res = await fetch(`${workerUrl}/github/repos/${repo}/contents/library/library-manifest.json?ref=${branch}`);
    if (!res.ok) {
      throw new Error(`Manifest tidak ditemukan atau repositori belum diinisialisasi (HTTP ${res.status})`);
    }
    const data = await res.json();
    manifestSha = data.sha;
    const rawText = Buffer.from(data.content, 'base64').toString('utf8');
    manifestList = JSON.parse(rawText);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return;
  }

  console.log(`Menemukan ${manifestList.length} file di manifest.`);
  const oldFiles = manifestList.filter(f => f.includes('_decoded') || !f.startsWith('manual_'));

  if (oldFiles.length === 0) {
    console.log('\nSemua file cloud sudah menggunakan format penamaan baru. Tidak perlu migrasi.');
    return;
  }

  console.log(`Menemukan ${oldFiles.length} file yang perlu dimigrasikan.`);
  const newManifestList = [...manifestList];

  for (const fname of oldFiles) {
    console.log(`\nProcessing: ${fname}...`);
    try {
      // 1. Ambil file lama
      const fileRes = await fetch(`${workerUrl}/github/repos/${repo}/contents/library/${fname}?ref=${branch}`);
      if (!fileRes.ok) {
        console.warn(`[Skip] Gagal memuat ${fname} (HTTP ${fileRes.status})`);
        continue;
      }
      const fileData = await fileRes.json();
      const oldSha = fileData.sha;
      const text = Buffer.from(fileData.content, 'base64').toString('utf8');

      // 2. Tentukan nama baru
      const songTitle = parseTitleFromText(fname, text);
      const sanitized = sanitizeFilename(songTitle);
      const newFilename = `manual_${sanitized}.txt`;

      if (newFilename === fname) {
        console.log(`[Skip] Nama file sudah sesuai: ${fname}`);
        continue;
      }

      console.log(`Judul Lagu: "${songTitle}" -> File Baru: ${newFilename}`);

      // 3. Cek jika target file baru sudah ada
      let newFileSha = null;
      try {
        const checkRes = await fetch(`${workerUrl}/github/repos/${repo}/contents/library/${newFilename}?ref=${branch}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          newFileSha = checkData.sha;
          console.log(`[Info] File ${newFilename} sudah ada di cloud, akan di-overwrite.`);
        }
      } catch (e) {}

      // 4. Tulis file baru ke GitHub
      console.log(`[Upload] Mengunggah ${newFilename}...`);
      const uploadRes = await fetch(`${workerUrl}/github/repos/${repo}/contents/library/${newFilename}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Hash': hash
        },
        body: JSON.stringify({
          message: `Migrate: ${fname} -> ${newFilename}`,
          content: Buffer.from(text).toString('base64'),
          sha: newFileSha || undefined,
          branch
        })
      });

      if (!uploadRes.ok) {
        throw new Error(`Gagal mengunggah file baru ${newFilename} (HTTP ${uploadRes.status})`);
      }

      // 5. Hapus file lama dari GitHub
      console.log(`[Delete] Menghapus file lama ${fname}...`);
      const deleteRes = await fetch(`${workerUrl}/github/repos/${repo}/contents/library/${fname}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Hash': hash
        },
        body: JSON.stringify({
          message: `Delete migrated file: ${fname}`,
          sha: oldSha,
          branch
        })
      });

      if (!deleteRes.ok) {
        console.warn(`[Warning] Gagal menghapus file lama ${fname} di cloud, tapi file baru berhasil dibuat.`);
      }

      // 6. Update list manifest di memory
      const idx = newManifestList.indexOf(fname);
      if (idx !== -1) {
        newManifestList[idx] = newFilename;
      } else {
        newManifestList.push(newFilename);
      }

      // 7. Purge cache jsDelivr CDN
      await purgeJsDelivr(repo, branch, `library/${fname}`);
      await purgeJsDelivr(repo, branch, `library/${newFilename}`);

    } catch (err) {
      console.error(`[Error] Gagal memigrasikan ${fname}:`, err.message);
    }
  }

  // 8. Tulis kembali manifest baru ke GitHub
  console.log('\n[Manifest] Memperbarui library-manifest.json di GitHub...');
  try {
    // Pastikan manifest tidak duplikat
    const uniqueManifest = [...new Set(newManifestList)];
    const updateRes = await fetch(`${workerUrl}/github/repos/${repo}/contents/library/library-manifest.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Hash': hash
      },
      body: JSON.stringify({
        message: 'Update manifest after filename migration',
        content: Buffer.from(JSON.stringify(uniqueManifest, null, 2)).toString('base64'),
        sha: manifestSha,
        branch
      })
    });

    if (!updateRes.ok) {
      throw new Error(`Gagal memperbarui manifest di cloud (HTTP ${updateRes.status})`);
    }

    console.log('[Manifest] Manifest berhasil diperbarui.');
    await purgeJsDelivr(repo, branch, 'library/library-manifest.json');
    console.log('\n=== MIGRASI BERHASIL SELESAI ===');
  } catch (e) {
    console.error(`[Manifest Error] Gagal menyimpan manifest terbaru: ${e.message}`);
  }
}

main().catch(console.error);
