/* ============================= STATE ============================= */
const state = {
  songs: [],
  activeTab: 'lagu',
  search: '',
  showChords: false,
  showNotes: false,
  showCaps: false,
  cart: [],
  editing: { songId: null, cartId: null, working: [] },
  editingManualSong: { id: null, cloudFilename: null }
};
let dragSrcIndex = null;
let selectedEventNameVal = 'Ibadah Minggu Pagi';
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/* ============================= UTIL ============================= */
function uid() { return Math.random().toString(36).slice(2, 10); }

function setupPointerDrag(container, onReorder) {
  let draggingRow = null;
  let activeHandle = null;

  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.handle, [style*="cursor:grab"], [style*="cursor: grab"]');
    if (!handle || !handle.textContent.includes('⠿⠿')) return;

    const row = handle.closest('.sec-row, .cart-item');
    if (!row) return;

    e.preventDefault();
    draggingRow = row;
    activeHandle = handle;
    row.classList.add('dragging');
    row.style.zIndex = '1000';

    handle.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent) => {
      if (!draggingRow) return;

      const x = moveEvent.clientX;
      const y = moveEvent.clientY;

      draggingRow.style.pointerEvents = 'none';
      const elem = document.elementFromPoint(x, y);
      draggingRow.style.pointerEvents = '';

      if (!elem) return;
      const targetRow = elem.closest('.sec-row, .cart-item');
      if (targetRow && targetRow !== draggingRow && targetRow.parentNode === container) {
        const rect = targetRow.getBoundingClientRect();
        const middleY = rect.top + rect.height / 2;
        if (y < middleY) {
          container.insertBefore(draggingRow, targetRow);
        } else {
          container.insertBefore(draggingRow, targetRow.nextSibling);
        }
      }
    };

    const onPointerUp = (upEvent) => {
      if (draggingRow) {
        draggingRow.classList.remove('dragging');
        draggingRow.style.zIndex = '';
        
        try {
          activeHandle.releasePointerCapture(upEvent.pointerId);
        } catch (err) {}
        
        draggingRow = null;
        activeHandle = null;

        const newOrder = Array.from(container.children).map(child => Number(child.dataset.idx));
        onReorder(newOrder);
      }

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });
}

function cap(tag) { return tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase(); }
function isAnimasiFile(filename) { return /animasi/i.test(filename); }
function flattenLines(lines) { return lines.filter(l => l.text.trim() !== '').map(l => l.text).join(' / '); }
function linesToHtml(lines) {
  return lines.filter(l => l.text.trim() !== '').map(l => escapeHtml(l.text)).join('<br>');
}
function preprocessSectionLines(lines) {
  const result = [];
  let currentCluster = [];

  const flushCluster = () => {
    if (currentCluster.length === 0) return;

    const combinedText = currentCluster.map(l => l.text.trim()).join(' ');
    const qualifies = currentCluster.length <= 2 && combinedText.length <= 60;

    if (qualifies) {
      let mergedChord = '';
      let mergedNote = '';

      // Merge chords if either line has a chord
      if (currentCluster[0].chord || (currentCluster[1] && currentCluster[1].chord)) {
        const c1 = currentCluster[0].chord || '';
        const c2 = (currentCluster[1] && currentCluster[1].chord) || '';
        const t1 = currentCluster[0].text || '';
        if (c1) {
          const padLen = Math.max(t1.length + 1, c1.length + 1);
          mergedChord = c1.padEnd(padLen, ' ') + c2;
        } else {
          mergedChord = ' '.repeat(t1.length + 1) + c2;
        }
        mergedChord = mergedChord.trimEnd();
      }

      // Merge notes
      const n1 = currentCluster[0].note || '';
      const n2 = (currentCluster[1] && currentCluster[1].note) || '';
      if (n1 && n2) {
        mergedNote = n1 + ' / ' + n2;
      } else {
        mergedNote = n1 || n2;
      }

      result.push({
        text: combinedText,
        chord: mergedChord || null,
        note: mergedNote || null
      });
    } else {
      result.push(...currentCluster);
    }
    currentCluster = [];
  };

  for (const line of lines) {
    if (line.text.trim() === '') {
      flushCluster();
    } else {
      currentCluster.push(line);
    }
  }
  flushCluster();
  return result;
}

function sectionLinesHtml(lines, showChords, showNotes, showCaps) {
  const processed = preprocessSectionLines(lines);
  return processed.map(l => {
    const hasChord = showChords && l.chord;
    const hasNote = showNotes && l.note;
    const textToPrint = showCaps ? l.text.toUpperCase() : l.text;
    let out = '';
    if (hasChord) out += `<div class="chord-line">${escapeHtml(l.chord)}</div>`;
    out += `<div class="lyric-line${hasChord ? ' with-chord' : ''}">${escapeHtml(textToPrint)}</div>`;
    if (hasNote) out += `<div class="note-line">${escapeHtml(l.note)}</div>`;
    return out;
  }).join('');
}

function cleanTitle(raw) {
  let t = (raw || '').replace(/_/g, ' ').replace(/[()]/g, ' ');
  t = t.split(/\s+/).filter(w => w && !/^(decoded|animasi|chords?)$/i.test(w)).join(' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^-+\s*/, '').replace(/\s*-+$/, '').trim();
  return t || raw;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDateID(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
}

function getEventName() {
  return selectedEventNameVal || 'Ibadah';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============================= PARSING ============================= */
function parseSong(filename, text) {
  const rawLines = text.replace(/\r/g, '').split('\n');
  let title = filename.replace(/\.txt$/i, '');
  let startIdx = 0;
  if (rawLines[0] && /^title\s*:/i.test(rawLines[0])) {
    title = rawLines[0].replace(/^title\s*:/i, '').trim() || title;
    startIdx = 1;
  }
  title = cleanTitle(title);
  const sections = [];
  let current = null;
  let pendingChord = null;
  let pendingNote = null;
  const counts = {};
  for (let i = startIdx; i < rawLines.length; i++) {
    const line = rawLines[i];
    const chordMatch = line.match(/^\s*\[CHORD\](.*)$/i);
    if (chordMatch) {
      if (current) pendingChord = chordMatch[1].replace(/\s+$/, '');
      continue;
    }
    const noteMatch = line.match(/^\s*\[NOTES?\](.*)$/i);
    if (noteMatch) {
      const noteText = noteMatch[1].trim();
      let attached = false;
      if (current && current.lines.length > 0) {
        let idx = current.lines.length - 1;
        while (idx >= 0 && current.lines[idx].text.trim() === '') {
          idx--;
        }
        if (idx >= 0) {
          if (current.lines[idx].note) {
            current.lines[idx].note += '\n' + noteText;
          } else {
            current.lines[idx].note = noteText;
          }
          attached = true;
        }
      }
      if (!attached) {
        pendingNote = noteText;
      }
      continue;
    }
    const m = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) {
      const tag = m[1].trim().toUpperCase();
      counts[tag] = (counts[tag] || 0) + 1;
      const label = counts[tag] > 1 ? `${cap(tag)} ${counts[tag]}` : cap(tag);
      current = { tag, label, lines: [] };
      sections.push(current);
      pendingChord = null;
      pendingNote = null;
    } else if (current) {
      current.lines.push({ text: line, chord: pendingChord || null, note: pendingNote || null });
      pendingChord = null;
      pendingNote = null;
    }
  }
  sections.forEach(s => {
    while (s.lines.length && s.lines[0].text.trim() === '') s.lines.shift();
    while (s.lines.length && s.lines[s.lines.length - 1].text.trim() === '') s.lines.pop();
  });
  return { title, sections: sections.filter(s => s.lines.length > 0) };
}

function buildSongRecord(filename, text) {
  const parsed = parseSong(filename, text);
  const textLines = parsed.sections.flatMap(s => s.lines.map(l => l.text));
  const noteLines = parsed.sections.flatMap(s => s.lines.map(l => l.note || ''));
  const searchText = (parsed.title + ' ' + textLines.join(' ') + ' ' + noteLines.join(' ')).toLowerCase();
  const hasChords = parsed.sections.some(s => s.lines.some(l => l.chord));
  
  const fn = (filename || '').toLowerCase();
  const isAnimasi = fn.startsWith('animasi_') || fn.includes('animasi');
  const isManual = fn.startsWith('manual_');

  const groups = [];
  if (isAnimasi) {
    groups.push('animasi');
  } else if (isManual) {
    groups.push('manual');
  } else {
    groups.push('lagu');
  }

  if (hasChords) {
    groups.push('chord');
  }

  const id = fn ? btoa(unescape(encodeURIComponent(filename))).replace(/[^a-zA-Z0-9]/g, '') : uid();

  return {
    id,
    filename,
    title: parsed.title,
    groups,
    hasChords,
    isManual,
    sections: parsed.sections,
    searchText
  };
}

/* ============================= SCANNING ============================= */
const CACHE_KEY = 'song_repo_cache_v2';
const CACHE_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

const DB_NAME = 'SongRepoCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'cache_store';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getCache(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Gagal membaca dari IndexedDB:', e);
    return null;
  }
}

async function setCache(key, val) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(val, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Gagal menulis ke IndexedDB:', e);
  }
}

function formatDateTimeID(timestamp) {
  const date = new Date(timestamp);
  const d = date.getDate();
  const m = MONTHS_ID[date.getMonth()];
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${d} ${m} ${y} pukul ${hh}:${mm}`;
}

function showCacheInfo(timestamp) {
  const cacheInfo = document.getElementById('cacheInfo');
  const cacheTime = document.getElementById('cacheTime');
  if (cacheInfo && cacheTime) {
    cacheTime.textContent = formatDateTimeID(timestamp);
    cacheInfo.style.display = 'flex';
  }
}

async function scanLibrary() {
  // Clear old localStorage cache to free quota
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {}

  let cached = null;
  try {
    cached = await getCache('main_library');
  } catch (e) {
    console.warn('IndexedDB tidak tersedia:', e);
  }
  if (cached) {
    try {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_DURATION && Array.isArray(cached.files) && cached.files.length > 0) {
        // Parse raw texts into state.songs on the fly
        state.songs = cached.files.map(f => buildSongRecord(f.filename, f.text));

        const statusEl = document.getElementById('scanStatus');
        statusEl.textContent = `${state.songs.length} lagu dimuat (dari cache)`;
        showCacheInfo(cached.timestamp);
        renderSongList();
        renderTabCounts();
        await syncCloudSongs();
        return;
      }
    } catch (e) {
      console.warn('Gagal membaca cache, memindai ulang...', e);
    }
  }
  await forceRefreshLibrary();
}

async function forceRefreshLibrary() {
  const statusEl = document.getElementById('scanStatus');
  const cacheInfo = document.getElementById('cacheInfo');
  if (cacheInfo) cacheInfo.style.display = 'none';

  // 1. Coba unduh library-bundle.json lokal (1-request load)
  try {
    const bundleRes = await fetch('../library/library-bundle.json', { cache: 'no-store' });
    if (bundleRes.ok) {
      const parsedBundle = await bundleRes.json();
      if (parsedBundle && Array.isArray(parsedBundle.songs)) {
        state.songs = parsedBundle.songs.map(f => buildSongRecord(f.filename, f.text));
        const timestamp = Date.now();
        showCacheInfo(timestamp);
        const filesCache = parsedBundle.songs.map(f => ({ filename: f.filename, text: f.text }));
        await setCache('main_library', { timestamp, files: filesCache });

        statusEl.textContent = `${state.songs.length} lagu dimuat (bundle)`;
        renderSongList();
        renderTabCounts();
        await syncCloudSongs();
        return;
      }
    }
  } catch (e) {
    console.warn('Local library-bundle.json belum ada, menggunakan pemindaian biasa:', e);
  }

  let filenames = [];
  try {
    const res = await fetch('../library/library-manifest.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) filenames = data.filter(f => /\.txt$/i.test(f));
    }
  } catch (e) { /* ignore */ }

  if (filenames.length === 0) {
    try {
      const res = await fetch('../library/', { cache: 'no-store' });
      if (res.ok) {
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const anchors = Array.from(doc.querySelectorAll('a[href]'));
        filenames = anchors
          .map(a => decodeURIComponent(a.getAttribute('href')))
          .filter(href => /\.txt$/i.test(href) && !href.startsWith('http') && !href.includes('/'))
          .filter((v, i, arr) => arr.indexOf(v) === i);
      }
    } catch (e) { /* ignore */ }
  }

  if (filenames.length === 0) {
    statusEl.textContent = 'pemindaian otomatis tidak tersedia';
    document.getElementById('manualBox').style.display = 'block';
    return;
  }

  statusEl.textContent = `memuat 0 / ${filenames.length} lagu…`;
  const filesCache = [];
  const songs = [];
  const batchSize = 50;

  for (let i = 0; i < filenames.length; i += batchSize) {
    const batch = filenames.slice(i, i + batchSize);

    const batchPromises = batch.map(async (fname) => {
      try {
        const r = await fetch('../library/' + encodeURIComponent(fname));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        return { filename: fname, text };
      } catch (e) {
        console.warn('Gagal memuat', fname, e);
        return null;
      }
    });

    const results = await Promise.all(batchPromises);

    for (const fileObj of results) {
      if (fileObj) {
        filesCache.push(fileObj);
        songs.push(buildSongRecord(fileObj.filename, fileObj.text));
      }
    }

    statusEl.textContent = `memuat ${songs.length} / ${filenames.length} lagu…`;
  }

  state.songs = songs;
  statusEl.textContent = `${state.songs.length} lagu dimuat`;

  const timestamp = Date.now();
  showCacheInfo(timestamp);
  try {
    await setCache('main_library', { timestamp, files: filesCache });
  } catch (e) {
    console.warn('Gagal menyimpan cache ke IndexedDB', e);
  }

  renderSongList();
  renderTabCounts();
  await syncCloudSongs();
}

document.getElementById('refreshCacheBtn').addEventListener('click', async () => {
  showToast('Memperbarui data lagu...');
  await forceRefreshLibrary();
  showToast('Data lagu berhasil diperbarui.');
});

document.getElementById('manualInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  const songs = [];
  for (const file of files) {
    const text = await file.text();
    songs.push(buildSongRecord(file.name, text));
  }
  state.songs = songs;
  document.getElementById('scanStatus').textContent = `${songs.length} lagu dimuat (manual)`;
  document.getElementById('manualBox').style.display = 'none';
  renderSongList();
  renderTabCounts();
});

/* ============================= RENDER: LIBRARY (list view) ============================= */
function renderTabCounts() {
  document.getElementById('countLagu').textContent = state.songs.filter(s => s.groups.includes('lagu')).length;
  document.getElementById('countAnimasi').textContent = state.songs.filter(s => s.groups.includes('animasi')).length;
  document.getElementById('countChord').textContent = state.songs.filter(s => s.groups.includes('chord')).length;
  document.getElementById('countManual').textContent = state.songs.filter(s => s.isManual || s.groups.includes('manual')).length;
}

function renderSongList() {
  const wrap = document.getElementById('songList');
  const q = state.search.trim().toLowerCase();
  const searching = !!q;
  const list = state.songs
    .filter(s => {
      if (searching) return true;
      if (state.activeTab === 'manual') return s.isManual || s.groups.includes('manual');
      return s.groups.includes(state.activeTab);
    })
    .filter(s => !q || s.title.toLowerCase().includes(q) || s.searchText.includes(q));

  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
  <h3>Belum ada lagu</h3>
  <p>${state.songs.length === 0 ? 'Menunggu file dimuat dari folder…' : 'Tidak ada lagu yang cocok.'}</p>
</div>`;
    return;
  }

  const groupLabel = g => g === 'animasi' ? 'Animasi' : g === 'chord' ? 'Chord' : g === 'manual' ? 'user-generated' : 'Lagu';
  wrap.innerHTML = list.map(s => `
<div class="song-row" data-song-id="${s.id}" style="display: flex; align-items: center; justify-content: space-between;">
  <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; text-align: left;">
    <span class="song-title">${escapeHtml(s.title)}${s.groups.map(g => `<span class="group-tag ${g}">${groupLabel(g)}</span>`).join('')}</span>
  </div>
  <div style="display: flex; align-items: center; gap: 8px;">
    <span class="song-meta">${s.sections.length} bagian</span>
  </div>
</div>
`).join('');

  wrap.querySelectorAll('.song-row').forEach(row => {
    row.addEventListener('click', () => {
      const songId = row.dataset.songId;
      openEditor(songId, null);
    });
  });
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  state.activeTab = tab.dataset.tab;
  renderSongList();
});

const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

searchInput.addEventListener('input', (e) => {
  state.search = e.target.value;
  clearSearchBtn.style.display = state.search ? 'block' : 'none';
  renderSongList();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  state.search = '';
  clearSearchBtn.style.display = 'none';
  searchInput.focus();
  renderSongList();
});

/* ============================= EDITOR ============================= */
function openEditor(songId, cartId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;

  let working;
  if (cartId) {
    const item = state.cart.find(c => c.cartId === cartId);
    const chosenLabels = item.sections.map(s => s.label);
    const rest = song.sections.filter(s => !chosenLabels.includes(s.label));
    working = [
      ...item.sections.map(s => ({ ...s, checked: true })),
      ...rest.map(s => ({ ...s, checked: false }))
    ];
  } else {
    working = song.sections.map(s => ({ ...s, checked: true }));
  }

  state.editing = { songId, cartId, working };
  document.getElementById('editorTitle').textContent = song.title;
  const groupLabel = g => g === 'animasi' ? 'Animasi' : g === 'chord' ? 'Chord' : 'Lagu';
  document.getElementById('editorGroupLabel').textContent = song.groups.map(groupLabel).join(' · ');
  renderSectionList();
  document.getElementById('deleteSongContentBtn').style.display = song.isManual ? 'inline-block' : 'none';
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('saveEditor').textContent = cartId ? 'Simpan Perubahan' : 'Tambah ke Daftar Pujian';
}

function renderSectionList() {
  const wrap = document.getElementById('sectionList');
  const working = state.editing.working;
  wrap.innerHTML = working.map((s, idx) => `
<div class="sec-row" data-idx="${idx}">
  <span class="handle">⠿⠿</span>
  <label>
    <input type="checkbox" data-idx="${idx}" ${s.checked ? 'checked' : ''}>
    <span class="tagchip">${s.label}</span>
    <span class="preview">${escapeHtml(s.lines.filter(l => l.text.trim() !== '').map(l => l.text).join(' / '))}</span>
  </label>
</div>
`).join('');

  wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.idx);
      state.editing.working[idx].checked = e.target.checked;
    });
  });
}

document.getElementById('closeEditor').addEventListener('click', closeEditor);
document.getElementById('cancelEditor').addEventListener('click', closeEditor);
document.getElementById('overlay').addEventListener('click', (e) => {
  if (e.target.id === 'overlay') closeEditor();
});
document.getElementById('downloadPro6ModalBtn').addEventListener('click', () => {
  const songId = state.editing.songId;
  if (!songId) return;
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;

  const chosenSections = state.editing.working.filter(s => s.checked).map(({ tag, label, lines }) => ({ tag, label, lines }));
  const exportItem = {
    title: song.title,
    sections: chosenSections.length > 0 ? chosenSections : song.sections
  };
  exportSingleSongPro6(exportItem);
});
document.getElementById('editSongContentBtn').addEventListener('click', () => {
  const songId = state.editing.songId;
  if (!songId) return;
  checkAdminAuth(() => {
    closeEditor();
    openManualSongForEditing(songId);
  });
});
document.getElementById('deleteSongContentBtn').addEventListener('click', () => {
  const songId = state.editing.songId;
  if (!songId) return;
  closeEditor();
  checkAdminAuth(async () => {
    await deleteManualSong(songId);
  });
});
function closeEditor() {
  document.getElementById('overlay').classList.add('hidden');
  state.editing = { songId: null, cartId: null, working: [] };
}

document.getElementById('saveEditor').addEventListener('click', () => {
  const { songId, cartId, working } = state.editing;
  const song = state.songs.find(s => s.id === songId);
  const chosen = working.filter(s => s.checked).map(({ tag, label, lines }) => ({ tag, label, lines }));

  if (chosen.length === 0) {
    showToast('Pilih minimal satu bagian lagu.');
    return;
  }

  if (cartId) {
    const item = state.cart.find(c => c.cartId === cartId);
    item.sections = chosen;
    showToast('Perubahan disimpan.');
  } else {
    state.cart.push({
      type: 'song',
      cartId: uid(),
      songId: song.id,
      title: song.title,
      groups: song.groups,
      isManual: song.isManual || false,
      sections: chosen
    });
    showToast('Ditambahkan ke daftar pujian.');
  }
  closeEditor();
  renderCart();
  renderPreview();
});

/* ============================= CART (daftar pujian) ============================= */
document.getElementById('addBreakBtn').addEventListener('click', () => {
  state.cart.push({ type: 'break', cartId: uid(), label: '' });
  renderCart();
  renderPreview();
});

function renderCart() {
  const wrap = document.getElementById('cartList');
  const exportBtn = document.getElementById('exportBtn');
  const exportWordBtn = document.getElementById('exportWordBtn');

  if (state.cart.length === 0) {
    wrap.innerHTML = `<div class="cart-empty">Belum ada lagu dipilih.<br>Klik sebuah lagu di sebelah kiri untuk mulai menyusun.</div>`;
    exportBtn.disabled = true;
    if (exportWordBtn) exportWordBtn.disabled = true;
    const exportPro6Btn = document.getElementById('exportPro6Btn');
    if (exportPro6Btn) exportPro6Btn.disabled = true;
    return;
  }
  const hasSongs = state.cart.some(i => i.type === 'song');
  exportBtn.disabled = !hasSongs;
  if (exportWordBtn) exportWordBtn.disabled = !hasSongs;
  const exportPro6Btn = document.getElementById('exportPro6Btn');
  if (exportPro6Btn) exportPro6Btn.disabled = !hasSongs;

  let songNum = 0;
  wrap.innerHTML = state.cart.map((item, idx) => {
    if (item.type === 'break') {
      return `
    <div class="cart-item break-item" data-idx="${idx}">
      <span class="icon-btn" style="cursor:grab;">⠿⠿</span>
      <input type="text" value="${escapeHtml(item.label)}" data-break-idx="${idx}" placeholder="Sesi Baru">
      <button class="icon-btn danger" data-action="remove" data-idx="${idx}" title="Hapus">✕</button>
    </div>`;
    }
    songNum++;
    return `
  <div class="cart-item" data-idx="${idx}">
    <div class="ci-top">
      <div style="display:flex; align-items:flex-start; gap:8px;">
        <span class="icon-btn" style="cursor:grab; margin-top:-1px;">⠿⠿</span>
        <h4><span class="num">${songNum}.</span>${escapeHtml(item.title)}</h4>
      </div>
      <div class="ci-actions">
        <button class="icon-btn" data-action="edit" data-idx="${idx}" title="Atur ulang bagian">✎</button>
        <button class="icon-btn danger" data-action="remove" data-idx="${idx}" title="Hapus">✕</button>
      </div>
    </div>
    <div class="chips" style="margin-left:26px;">${item.sections.map(s => `<span class="chip">${s.label}</span>`).join('')}</div>
  </div>`;
  }).join('');

  wrap.querySelectorAll('input[data-break-idx]').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.breakIdx);
      state.cart[idx].label = e.target.value;
      renderPreview();
    });
  });
  wrap.querySelectorAll('[data-action=edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = state.cart[Number(btn.dataset.idx)];
      openEditor(item.songId, item.cartId);
    });
  });
  wrap.querySelectorAll('[data-action=remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.cart.splice(Number(btn.dataset.idx), 1);
      renderCart();
      renderPreview();
    });
  });
}

const eventDropdown = document.getElementById('eventNameDropdown');
const dropdownTrigger = document.getElementById('dropdownTrigger');
const dropdownMenu = document.getElementById('dropdownMenu');
const selectedEventLabel = document.getElementById('selectedEventName');
const eventCustomInput = document.getElementById('eventNameCustom');

dropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = eventDropdown.classList.contains('open');
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (!isOpen) {
    eventDropdown.classList.add('open');
    dropdownMenu.classList.remove('hidden');
  }
});

document.addEventListener('click', (e) => {
  if (!eventDropdown.contains(e.target)) {
    eventDropdown.classList.remove('open');
    dropdownMenu.classList.add('hidden');
  }
});

dropdownMenu.querySelectorAll('.dropdown-option').forEach(opt => {
  opt.addEventListener('click', (e) => {
    const val = opt.getAttribute('data-value');
    selectedEventNameVal = val;
    selectedEventLabel.textContent = val;
    eventCustomInput.value = '';
    eventDropdown.classList.remove('open');
    dropdownMenu.classList.add('hidden');
    renderPreview();
  });
});

eventCustomInput.addEventListener('click', (e) => {
  e.stopPropagation();
});

eventCustomInput.addEventListener('input', (e) => {
  const val = e.target.value.trim();
  selectedEventNameVal = val || 'Ibadah';
  selectedEventLabel.textContent = val || 'Lainnya (Isi sendiri)...';
  renderPreview();
});

document.getElementById('eventDate').addEventListener('input', renderPreview);
document.getElementById('chordToggle').addEventListener('change', (e) => {
  state.showChords = e.target.checked;
  renderPreview();
});
document.getElementById('notesToggle').addEventListener('change', (e) => {
  state.showNotes = e.target.checked;
  renderPreview();
});
document.getElementById('capsToggle').addEventListener('change', (e) => {
  state.showCaps = e.target.checked;
  renderPreview();
});

/* ============================= PREVIEW ============================= */
function renderPreview() {
  const sheet = document.getElementById('previewSheet');
  const eventName = getEventName();
  const eventDate = formatDateID(document.getElementById('eventDate').value);

  if (state.showChords) {
    sheet.classList.add('show-chords');
  } else {
    sheet.classList.remove('show-chords');
  }

  let html = `<div class="ph-title">Daftar Pujian ${escapeHtml(eventName)}</div>`;
  html += `<div class="ph-date">${escapeHtml(eventDate)}</div>`;

  if (state.cart.length === 0) {
    html += `<div class="cart-empty">Pratinjau akan muncul di sini setelah kamu menambahkan lagu.</div>`;
  } else {
    let songNum = 0;
    state.cart.forEach(item => {
      if (item.type === 'break') {
        html += `<div class="preview-break">${escapeHtml(item.label || 'Sesi Baru')}</div>`;
        return;
      }
      songNum++;
      html += `<div class="preview-song"><h4>${songNum}. ${escapeHtml(item.title.toUpperCase())}</h4>`;
      item.sections.forEach(sec => {
        html += `<div class="preview-sec"><div class="lbl">${escapeHtml(sec.label)}</div><div class="txt">${sectionLinesHtml(sec.lines, state.showChords, state.showNotes, state.showCaps)}</div></div>`;
      });
      html += `</div>`;
    });
  }
  sheet.innerHTML = html;
}

/* ============================= EXPORT PDF (2 kolom, A4, 11pt) ============================= */
let robotoMonoBase64 = null;

async function ensureRobotoMonoFont(doc) {
  if (!robotoMonoBase64) {
    const url = 'https://cdn.jsdelivr.net/gh/googlefonts/RobotoMono@main/fonts/ttf/RobotoMono-Regular.ttf';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      robotoMonoBase64 = window.btoa(binary);
    } catch (e) {
      console.error('Gagal memuat font Roboto Mono dari CDN, menggunakan courier sebagai fallback.', e);
      return false;
    }
  }
  try {
    doc.addFileToVFS('RobotoMono-Regular.ttf', robotoMonoBase64);
    doc.addFont('RobotoMono-Regular.ttf', 'RobotoMono', 'normal');
    return true;
  } catch (e) {
    console.error('Gagal menambahkan font Roboto Mono ke jsPDF.', e);
    return false;
  }
}

document.getElementById('exportBtn').addEventListener('click', async () => {
  if (!state.cart.some(i => i.type === 'song')) return;

  const exportBtn = document.getElementById('exportBtn');
  const originalText = exportBtn.textContent;
  exportBtn.disabled = true;
  exportBtn.textContent = 'Memproses PDF...';

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const gutter = 22;
    const colWidth = (pageWidth - margin * 2 - gutter) / 2;
    const bodySize = 11;

    // Load custom font
    const hasRobotoMono = await ensureRobotoMonoFont(doc);
    const monoFont = hasRobotoMono ? 'RobotoMono' : 'courier';

    let col = 0;
    let y = margin;
    let contentTop = margin;

    function colX() { return margin + col * (colWidth + gutter); }
    function ensureSpace(needed) {
      if (y + needed > pageHeight - margin) {
        if (col === 0) { col = 1; y = contentTop; }
        else { doc.addPage(); col = 0; y = margin; contentTop = margin; }
      }
    }
    function printWrapped(text, size, font = 'times', style = 'normal', extraGapAfter = 4) {
      doc.setFont(font, style);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text || ' ', colWidth);
      lines.forEach(l => {
        ensureSpace(size + 3);
        doc.text(l, colX(), y);
        y += size + 3;
      });
      y += extraGapAfter;
    }

    const eventName = getEventName();
    const eventDateVal = document.getElementById('eventDate').value;
    const eventDate = eventDateVal ? formatDateID(eventDateVal) : '';

    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    doc.text(`Daftar Pujian ${eventName}`, pageWidth / 2, y, { align: 'center' });
    y += 20;
    if (eventDate) {
      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      doc.text(eventDate, pageWidth / 2, y, { align: 'center' });
      y += 18;
    }
    y += 10;
    contentTop = y;

    let songNum = 0;
    state.cart.forEach(item => {
      if (item.type === 'break') {
        ensureSpace(30);
        doc.setDrawColor(37, 71, 168);
        doc.setLineWidth(1);
        doc.line(colX(), y, colX() + colWidth, y);
        
        doc.setFont('times', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(37, 71, 168);
        const breakText = (item.label || 'Sesi Baru').toUpperCase();
        doc.text(breakText, colX(), y + 13);
        doc.setTextColor(0, 0, 0);
        
        doc.line(colX(), y + 20, colX() + colWidth, y + 20);
        y += 30;
        return;
      }
      songNum++;
      ensureSpace(bodySize + 8);
      const titleText = `${songNum}. ${item.title.toUpperCase()}`;
      printWrapped(titleText, 13, 'times', 'bold', 4);

      item.sections.forEach(sec => {
        ensureSpace(bodySize + 4);
        const useMono = state.showChords;
        const lyricFont = useMono ? monoFont : 'times';
        doc.setTextColor(37, 71, 168);
        printWrapped(sec.label, 10, 'times', 'bolditalic', 2);
        doc.setTextColor(0, 0, 0);

        const secLines = preprocessSectionLines(sec.lines);
        secLines.forEach((l, i) => {
          const isLast = i === secLines.length - 1;
          const hasChord = state.showChords && l.chord;
          const hasNote = state.showNotes && l.note;

          if (state.showChords && l.chord) {
            doc.setTextColor(37, 71, 168);
            printWrapped(l.chord, bodySize, monoFont, 'normal', 0);
            doc.setTextColor(0, 0, 0);
          }

          const lyricText = state.showCaps ? l.text.toUpperCase() : l.text;
          printWrapped(lyricText, bodySize, lyricFont, 'normal', (!hasNote && isLast) ? 6 : 0);

          if (hasNote) {
            doc.setTextColor(110, 124, 92); // Sage green for translation notes
            const noteFont = useMono ? monoFont : 'times';
            const noteStyle = useMono ? 'normal' : 'italic';
            printWrapped(l.note, bodySize - 1, noteFont, noteStyle, isLast ? 6 : 2);
            doc.setTextColor(0, 0, 0); // Reset to black
          }
        });
      });
      y += 8;
    });

    let pdfName = `Daftar Pujian_${eventName}`;
    if (eventDate) {
      pdfName += `_${eventDate}`;
    }
    const safePdfName = pdfName.replace(/[\/\\:*?"<>|]/g, '-') + '.pdf';
    doc.save(safePdfName);
  } catch (err) {
    console.error('Gagal mengekspor PDF:', err);
    showToast('Gagal membuat file PDF.');
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = originalText;
  }
});

document.getElementById('exportWordBtn').addEventListener('click', async () => {
  if (!state.cart.some(i => i.type === 'song')) return;

  const exportWordBtn = document.getElementById('exportWordBtn');
  const originalText = exportWordBtn.textContent;
  exportWordBtn.disabled = true;
  exportWordBtn.textContent = 'Memproses Word...';

  try {
    const eventName = getEventName();
    const eventDateVal = document.getElementById('eventDate').value;
    const eventDate = eventDateVal ? formatDateID(eventDateVal) : '';

    let contentHtml = '';

    let songNum = 0;
    state.cart.forEach(item => {
      if (item.type === 'break') {
        const breakText = (item.label || 'Sesi Baru').toUpperCase();
        contentHtml += `
          <div style="margin: 12pt 0 8pt 0; border-top: 1px dashed #2547a8; border-bottom: 1px dashed #2547a8; padding: 5pt 0; text-align: left; page-break-inside: avoid; break-inside: avoid-column;">
            <span style="font-family: 'Times New Roman', Times, serif; font-size: 10pt; font-weight: bold; color: #2547a8; letter-spacing: 0.05em;">
              ${escapeHtml(breakText)}
            </span>
          </div>
        `;
        return;
      }

      songNum++;
      const titleText = `${songNum}. ${item.title.toUpperCase()}`;
      
      contentHtml += `<div style="margin-top: 12pt; margin-bottom: 10pt; page-break-inside: avoid; break-inside: avoid-column;">`;
      contentHtml += `<h3 style="font-family: 'Times New Roman', Times, serif; font-size: 13pt; font-weight: bold; margin: 0 0 6pt 0; text-transform: uppercase;">${escapeHtml(titleText)}</h3>`;

      item.sections.forEach(sec => {
        contentHtml += `<div style="margin-bottom: 8pt; page-break-inside: avoid; break-inside: avoid-column;">`;
        contentHtml += `<div style="font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; font-weight: bold; font-style: italic; color: #2547a8; text-transform: uppercase; margin-bottom: 2pt;">${escapeHtml(sec.label)}</div>`;

        const secLines = preprocessSectionLines(sec.lines);
        secLines.forEach((l, i) => {
          const hasChord = state.showChords && l.chord;
          const hasNote = state.showNotes && l.note;

          if (hasChord) {
            contentHtml += `<div style="font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #2547a8; white-space: pre; margin: 0; line-height: 1.1;">${escapeHtml(l.chord)}</div>`;
          }

          const textFontFamily = state.showChords ? "'Courier New', Courier, monospace" : "'Times New Roman', Times, serif";
          const textFontSize = state.showChords ? "10pt" : "11pt";
          const lyricText = state.showCaps ? l.text.toUpperCase() : l.text;

          contentHtml += `<div style="font-family: ${textFontFamily}; font-size: ${textFontSize}; color: #241f18; margin: 0; line-height: 1.2;">${escapeHtml(lyricText)}</div>`;

          if (hasNote) {
            const noteFontFamily = state.showChords ? "'Courier New', Courier, monospace" : "'Times New Roman', Times, serif";
            const noteFontSize = state.showChords ? "9.5pt" : "10pt";
            const noteStyle = state.showChords ? "normal" : "italic";
            contentHtml += `<div style="font-family: ${noteFontFamily}; font-size: ${noteFontSize}; font-style: ${noteStyle}; color: #6e7c5c; margin: 2pt 0 0 0; line-height: 1.2;">${escapeHtml(l.note)}</div>`;
          }
        });
        contentHtml += `</div>`;
      });
      contentHtml += `</div>`;
    });

    // Wrap in full HTML document structure for Word
    const docHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(eventName)}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page HeaderSection {
            size: 21.0cm 29.7cm;
            margin: 1.5cm 1.5cm 0.5cm 1.5cm;
            mso-columns: 1;
          }
          div.HeaderSection {
            page: HeaderSection;
          }
          @page Section1 {
            size: 21.0cm 29.7cm; /* A4 */
            margin: 1.0cm 1.5cm 1.5cm 1.5cm;
            mso-header-margin: 36.0pt;
            mso-footer-margin: 36.0pt;
            mso-columns: 2;
            mso-column-space: 18.0pt;
          }
          div.Section1 {
            page: Section1;
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            line-height: 1.25;
          }
        </style>
      </head>
      <body>
        <div class="HeaderSection">
          <h1 style="text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 18pt; margin-bottom: 2pt;">Daftar Pujian ${escapeHtml(eventName)}</h1>
          ${eventDate ? `<h2 style="text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: normal; font-style: italic; margin-top: 0; margin-bottom: 12pt; color: #555555;">${escapeHtml(eventDate)}</h2>` : '<div style="margin-bottom: 12pt;"></div>'}
        </div>
        
        <br clear="all" style="mso-break-type:section-break" />
        
        <div class="Section1">
          ${contentHtml}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + docHtml], { type: 'application/msword;charset=utf-8' });
    
    let wordName = `Daftar Pujian_${eventName}`;
    if (eventDate) {
      wordName += `_${eventDate}`;
    }
    const safeWordName = wordName.replace(/[\/\\:*?"<>|]/g, '-') + '.doc';

    // Downloader
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = safeWordName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    showToast('File Word berhasil diunduh.');
  } catch (err) {
    console.error('Gagal mengekspor Word:', err);
    showToast('Gagal membuat file Word.');
  } finally {
    exportWordBtn.disabled = false;
    exportWordBtn.textContent = originalText;
  }
});

/* ============================= EXPORT PROPRESENTER 6 (.pro6) ============================= */
// Helper function: generate UUID v4 untuk ProPresenter 6 node
function generatePro6Uuid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1).toUpperCase();
  }
  return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4() + s4() + s4()}`;
}

// Helper function: encode string ke base64 (mendukung karakter unicode UTF-8)
function utf8ToBase64(str) {
  if (typeof Base64 !== 'undefined' && Base64.encode) {
    return Base64.encode(str);
  }
  return window.btoa(unescape(encodeURIComponent(str)));
}

// Helper function: escape XML special characters
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Pemetaan warna badge group default khas ProPresenter 6
function getPro6GroupColor(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('verse') || l.includes('bait')) return '0 0.4 0.8 1'; // Biru
  if (l.includes('chorus') || l.includes('reff')) return '0.8 0.2 0.2 1'; // Merah
  if (l.includes('bridge')) return '0.7 0.3 0.8 1'; // Ungu
  if (l.includes('pre')) return '0.9 0.5 0 1'; // Oranye
  if (l.includes('tag') || l.includes('ending') || l.includes('outro')) return '0.3 0.7 0.3 1'; // Hijau
  if (l.includes('intro') || l.includes('interlude')) return '0.5 0.5 0.5 1'; // Abu-abu
  return '0 0.4 0.8 1';
}

// Membangun payload RTF untuk slide teks ProPresenter 6 (sesuai format ChrisMBarr/ProPresenter-Parser)
function buildPro6Rtf(text, font = 'Arial', size = 60) {
  const halfPoints = size * 2;
  const cleanText = text || '';
  const rtfBody = cleanText ? cleanText.replace(/\r|\n/g, '\\\r') : '';
  return `{\\rtf1\\ansi\\ansicpg1252\\cocoartf1038\\cocoasubrtf320{\\fonttbl\\f0\\fswiss\\fcharset0 ${font};}{\\colortbl;\\red255\\green255\\blue255;}\\pard\\tx560\\tx1120\\tx1680\\tx2240\\tx2800\\tx3360\\tx3920\\tx4480\\tx5040\\tx5600\\tx6160\\tx6720\\qc\\pardirnatural\\f0\\fs${halfPoints} \\cf1 ${rtfBody}}`;
}

// Membangun FlowDocument XAML untuk Windows ProPresenter compatibility
function buildPro6WinFlow(text, font = 'Arial', size = 60) {
  if (!text || text.trim() === '') {
    return `<FlowDocument TextAlignment="Center" PagePadding="5,0,5,0" AllowDrop="True" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"></FlowDocument>`;
  }
  const paragraphs = text
    .split(/[\n\r]/g)
    .filter(l => l !== '')
    .map(l => `<Paragraph Margin="0,0,0,0" TextAlignment="Center" FontFamily="${font}" FontSize="${size}"><Run FontFamily="${font}" FontSize="${size}" Foreground="#FFFFFFFF" Block.TextAlignment="Center">${escapeXml(l)}</Run></Paragraph>`)
    .join('');
  return `<FlowDocument TextAlignment="Center" PagePadding="5,0,5,0" AllowDrop="True" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation">${paragraphs}</FlowDocument>`;
}

const PRO6_WIN_FONT_DATA = `<?xml version="1.0" encoding="utf-16"?><RVFont xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.datacontract.org/2004/07/ProPresenter.Common"><Kerning>0</Kerning><LineSpacing>0</LineSpacing><OutlineColor xmlns:d2p1="http://schemas.datacontract.org/2004/07/System.Windows.Media"><d2p1:A>255</d2p1:A><d2p1:B>0</d2p1:B><d2p1:G>0</d2p1:G><d2p1:R>0</d2p1:R><d2p1:ScA>1</d2p1:ScA><d2p1:ScB>0</d2p1:ScB><d2p1:ScG>0</d2p1:ScG><d2p1:ScR>0</d2p1:ScR></OutlineColor><OutlineWidth>0</OutlineWidth><Variants>Normal</Variants></RVFont>`;

/**
 * Membangun string XML utuh berstandar ProPresenter 6 (.pro6)
 * Mengikuti spesifikasi 100% identik dengan ChrisMBarr/ProPresenter-Parser v6-builder
 */
function buildPro6Xml(songItem) {
  const width = 1920;
  const height = 1080;
  const padding = 40;
  const fontSize = 80;
  const fontName = 'Arial';
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, '');

  // Helper untuk membangun XML satu buah RVDisplaySlide
  function createSlideXml(slideText = '', slideLabel = '') {
    const slideUuid = generatePro6Uuid();
    const textElementUuid = generatePro6Uuid();
    const rtfContent = buildPro6Rtf(slideText, fontName, fontSize);
    const winFlowContent = buildPro6WinFlow(slideText, fontName, fontSize);

    const plainTextB64 = utf8ToBase64(slideText);
    const rtfB64 = utf8ToBase64(rtfContent);
    const winFlowB64 = utf8ToBase64(winFlowContent);
    const winFontB64 = utf8ToBase64(PRO6_WIN_FONT_DATA);

    const elemW = width - (padding * 2);
    const elemH = height - (padding * 2);

    return `        <RVDisplaySlide backgroundColor="0 0 0 0" highlightColor="0 0 0 0" drawingBackgroundColor="false" enabled="true" hotKey="" label="${escapeXml(slideLabel)}" notes="" UUID="${slideUuid}" chordChartPath="">
      <array rvXMLIvarName="cues"/>
      <array rvXMLIvarName="displayElements">
        <RVTextElement displayName="Default" UUID="${textElementUuid}" typeID="0" displayDelay="0" locked="false" persistent="0" fromTemplate="false" opacity="1" source="" bezelRadius="0" rotation="0" drawingFill="false" drawingShadow="false" drawingStroke="false" fillColor="1 1 1 0" adjustsHeightToFit="false" verticalAlignment="0" revealType="0">
          <RVRect3D rvXMLIvarName="position">{${padding} ${padding} 0 ${elemW} ${elemH}}</RVRect3D>
          <shadow rvXMLIvarName="shadow">10|0 0 0 1|{4.949747468305833, -4.949747468305832}</shadow>
          <dictionary rvXMLIvarName="stroke">
            <NSColor rvXMLDictionaryKey="RVShapeElementStrokeColorKey">0 0 0 1</NSColor>
            <NSNumber rvXMLDictionaryKey="RVShapeElementStrokeWidthKey" hint="double">0</NSNumber>
          </dictionary>
          <NSString rvXMLIvarName="PlainText">${plainTextB64}</NSString>
          <NSString rvXMLIvarName="RTFData">${rtfB64}</NSString>
          <NSString rvXMLIvarName="WinFlowData">${winFlowB64}</NSString>
          <NSString rvXMLIvarName="WinFontData">${winFontB64}</NSString>
        </RVTextElement>
      </array>
    </RVDisplaySlide>`;
  }

  // 1. Buat grup "Intro" kosong di bagian paling depan lagu
  const introGroupUuid = generatePro6Uuid();
  const introSlideXml = createSlideXml('', '');
  const introGroupXml = `    <RVSlideGrouping name="Intro" uuid="${introGroupUuid}" color="0 0 0 0">
  <array rvXMLIvarName="slides">
${introSlideXml}
  </array>
</RVSlideGrouping>`;

  // 2. Buat grup-grup section (baris berurutan = 1 slide, baris kosong = pembatas slide)
  const sectionsGroupXml = songItem.sections.map(sec => {
    const groupUuid = generatePro6Uuid();
    const groupColor = getPro6GroupColor(sec.label);

    // Kelompokkan baris lirik berdasarkan baris kosong sebagai pembatas slide
    const slideTexts = [];
    let currentSlideLines = [];

    for (const l of sec.lines) {
      const textStr = state.showCaps ? l.text.toUpperCase() : l.text;
      if (textStr.trim() === '') {
        if (currentSlideLines.length > 0) {
          slideTexts.push(currentSlideLines.join('\n'));
          currentSlideLines = [];
        }
      } else {
        currentSlideLines.push(textStr);
      }
    }
    if (currentSlideLines.length > 0) {
      slideTexts.push(currentSlideLines.join('\n'));
    }

    const slidesXml = slideTexts.map((slideText) => {
      return createSlideXml(slideText, '');
    }).join('\n');

    return `    <RVSlideGrouping name="${escapeXml(sec.label)}" uuid="${groupUuid}" color="${groupColor}">
  <array rvXMLIvarName="slides">
${slidesXml}
  </array>
</RVSlideGrouping>`;
  }).join('\n');

  const allGroupsXml = introGroupXml + '\n' + sectionsGroupXml;

  return `<?xml version="1.0" encoding="utf-8"?>
<RVPresentationDocument CCLIArtistCredits="" CCLIAuthor="" CCLICopyrightYear="" CCLIDisplay="false" CCLIPublisher="" CCLISongNumber="" CCLISongTitle="${escapeXml(songItem.title)}" category="Song" notes="" lastDateUsed="${nowIso}" height="${height}" width="${width}" backgroundColor="0 0 0 1" buildNumber="6016" chordChartPath="" docType="0" drawingBackgroundColor="false" resourcesDirectory="" selectedArrangementID="" os="1" usedCount="0" versionNumber="600">
  <RVTransition rvXMLIvarName="transitionObject" transitionType="-1" transitionDirection="0" transitionDuration="1" motionEnabled="false" motionDuration="0" motionSpeed="0" groupIndex="0" orderIndex="0" slideBuildAction="0" slideBuildDelay="0"/>
  <RVTimeline rvXMLIvarName="timeline" timeOffset="0" duration="0" selectedMediaTrackIndex="0" loop="false">
    <array rvXMLIvarName="timeCues"/>
    <array rvXMLIvarName="mediaTracks"/>
  </RVTimeline>
  <array rvXMLIvarName="groups">
${allGroupsXml}
  </array>
  <array rvXMLIvarName="arrangements"/>
</RVPresentationDocument>`;
}

// Ekspor 1 lagu tunggal ke file .pro6 langsung
function exportSingleSongPro6(songItem) {
  if (!songItem || songItem.type === 'break') return;
  try {
    const xml = buildPro6Xml(songItem);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const safeName = (songItem.title || 'Lagu').replace(/[\/\\:*?"<>|]/g, '-').trim() + '.pro6';

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    showToast(`File ProPresenter 6 "${safeName}" berhasil diunduh.`);
  } catch (err) {
    console.error('Gagal export single pro6:', err);
    showToast('Gagal membuat file .pro6 lagu.');
  }
}

// Ekspor seluruh daftar lagu ke format ProPresenter 6 (Single .pro6 jika 1 lagu, ZIP bundle jika banyak)
document.getElementById('exportPro6Btn').addEventListener('click', async () => {
  const songItems = state.cart.filter(i => i.type === 'song');
  if (songItems.length === 0) return;

  const exportPro6Btn = document.getElementById('exportPro6Btn');
  const originalText = exportPro6Btn.textContent;
  exportPro6Btn.disabled = true;
  exportPro6Btn.textContent = 'Membuat Pro6...';

  try {
    const eventName = getEventName();
    const eventDate = formatDateID(document.getElementById('eventDate').value);

    // Jika hanya 1 lagu di daftar, langsung unduh file .pro6 tunggal
    if (songItems.length === 1) {
      exportSingleSongPro6(songItems[0]);
      return;
    }

    // Jika ada beberapa lagu, bundle menjadi satu file ZIP menggunakan JSZip
    if (typeof JSZip === 'undefined') {
      throw new Error('Library JSZip belum siap.');
    }

    const zip = new JSZip();
    songItems.forEach((item, sIdx) => {
      const songNumStr = String(sIdx + 1).padStart(2, '0');
      const safeTitle = (item.title || 'Lagu').replace(/[\/\\:*?"<>|]/g, '-').trim();
      const fileName = `${songNumStr}. ${safeTitle}.pro6`;
      const xmlContent = buildPro6Xml(item);
      zip.file(fileName, xmlContent);
    });

    let zipFileName = `ProPresenter6_${eventName}`;
    if (eventDate) {
      zipFileName += `_${eventDate}`;
    }
    zipFileName = zipFileName.replace(/[\/\\:*?"<>|]/g, '-') + '.zip';

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = zipFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    showToast('Bundle ProPresenter 6 (.zip) berhasil diunduh.');
  } catch (err) {
    console.error('Gagal mengekspor ProPresenter 6:', err);
    showToast('Gagal mengekspor ProPresenter 6: ' + err.message);
  } finally {
    exportPro6Btn.disabled = false;
    exportPro6Btn.textContent = originalText;
  }
});

/* ============================= MANUAL SONG MANAGEMENT ============================= */
function convertToSongFormat(rawText) {
  const lines = rawText.replace(/\r/g, '').split('\n');
  const processed = [];

  function isChordLine(str) {
    const clean = str.trim();
    if (!clean) return false;
    if (!/[A-G]/i.test(clean)) return false;
    if (!/^[A-G0-9\s#b\+\/\(\)\-majindusolrtx]+$/i.test(clean)) return false;
    const tokens = clean.split(/\s+/);
    for (const token of tokens) {
      if (token.length > 5) return false;
      if (!/^[A-G][b#]?(m|maj|min|dim|aug|sus|add|m7|maj7|min7|sus4|sus2)?\d*(\/[A-G][b#]?)?$/i.test(token)) return false;
    }
    return true;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isChordLine(line)) {
      processed.push(`[CHORD]${line}`);
    } else {
      processed.push(line);
    }
  }
  return processed.join('\n');
}

function saveManualSongToStorage(song) {
  try {
    const listStr = localStorage.getItem('song_repo_manual_songs') || '[]';
    const list = JSON.parse(listStr);
    list.push(song);
    localStorage.setItem('song_repo_manual_songs', JSON.stringify(list));
  } catch (e) {
    console.warn('Gagal menyimpan lagu manual ke localStorage', e);
  }
}

function loadManualSongsFromStorage() {
  try {
    const listStr = localStorage.getItem('song_repo_manual_songs') || '[]';
    return JSON.parse(listStr);
  } catch (e) {
    console.warn('Gagal membaca lagu manual dari localStorage', e);
    return [];
  }
}

function updateManualSongInStorage(updatedSong) {
  try {
    const listStr = localStorage.getItem('song_repo_manual_songs') || '[]';
    let list = JSON.parse(listStr);
    const idx = list.findIndex(s => s.id === updatedSong.id);
    if (idx !== -1) {
      list[idx] = updatedSong;
    } else {
      list.push(updatedSong);
    }
    localStorage.setItem('song_repo_manual_songs', JSON.stringify(list));
  } catch (e) {
    console.warn('Gagal memperbarui lagu manual di localStorage', e);
  }
}

function reconstructSectionLyrics(lines) {
  return lines.map(l => {
    let lineText = '';
    if (l.chord) {
      lineText += l.chord + '\n';
    }
    lineText += l.text;
    if (l.note) {
      lineText += `\n[NOTES]${l.note}`;
    }
    return lineText;
  }).join('\n');
}

function openManualSongForEditing(songId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;

  state.editingManualSong = {
    id: song.isManual ? song.id : null,
    cloudFilename: song.cloudFilename || null
  };

  manualSongTitle.value = song.title;
  manualSectionsContainer.innerHTML = '';

  song.sections.forEach(sec => {
    const rawLyrics = reconstructSectionLyrics(sec.lines);
    manualSectionsContainer.appendChild(createManualSectionRow(sec.label, rawLyrics));
  });

  manualSongModal.classList.remove('hidden');
  manualSongTitle.focus();

  const modalTitle = manualSongModal.querySelector('h2');
  if (song.isManual) {
    modalTitle.textContent = 'Edit Lagu (user-generated)';
  } else {
    modalTitle.textContent = 'Salin & Edit Lagu (ke user-generated)';
  }
}

async function deleteManualSong(songId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;

  const githubRepo = getGithubRepo();
  if (!githubRepo) {
    alert('GitHub Repository belum dikonfigurasi.');
    return;
  }

  if (!confirm('Apakah Anda yakin ingin menghapus lagu ini secara permanen dari Cloud?')) return;

  showToast('Menghapus lagu dari GitHub Cloud...');
  try {
    await deleteSongFromGithub(song.cloudFilename);

    // Remove from memory
    state.songs = state.songs.filter(s => s.id !== songId);
    // Remove from cart if active
    state.cart = state.cart.filter(item => item.id !== songId && item.songId !== songId);

    // Refresh UI
    renderSongList();
    renderTabCounts();
    renderCart();
    renderPreview();
    showToast('Lagu berhasil dihapus.');
  } catch (e) {
    console.error(e);
    if (e.message && e.message.includes('403')) {
      handleWorkerAuthError();
    } else {
      alert('Gagal menghapus dari GitHub Cloud: ' + e.message + '\n\nAksi dibatalkan.');
    }
  }
}

// Modal Control & Dynamic Sections
const openManualSongBtn = document.getElementById('openManualSongBtn');
const manualSongModal = document.getElementById('manualSongModal');
const closeManualSongModal = document.getElementById('closeManualSongModal');
const cancelManualSong = document.getElementById('cancelManualSong');
const saveManualSong = document.getElementById('saveManualSong');
const manualSongTitle = document.getElementById('manualSongTitle');
const manualSectionsContainer = document.getElementById('manualSectionsContainer');
const addManualSectionBtn = document.getElementById('addManualSectionBtn');

// Create a new empty section row
function createManualSectionRow(labelVal = '', lyricsVal = '') {
  const row = document.createElement('div');
  row.className = 'manual-section-row';
  row.style.cssText = 'border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius); background: #131d31; display: flex; flex-direction: column; gap: 8px; position: relative;';

  row.innerHTML = `
    <button class="btn-remove-section" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; padding: 4px;">✕</button>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <label style="font-size: 11px; font-weight: 600; color: var(--text-muted);">Section</label>
      <input type="text" class="manual-section-label" placeholder="Contoh: Bait 1, Reff, Bridge..." value="${labelVal}"
        style="width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: var(--radius); font-family: 'Inter', sans-serif; font-size: 13px; background: var(--bg-card); outline: none; color: #ffffff;">
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <label style="font-size: 11px; font-weight: 600; color: var(--text-muted);">Lirik</label>
      <textarea class="manual-section-lyrics" placeholder="Ketik lirik atau chord..."
        style="width: 100%; min-height: 80px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: var(--radius); font-family: 'Roboto Mono', monospace; font-size: 12px; background: var(--bg-card); outline: none; resize: vertical; line-height: 1.4; color: #ffffff;">${lyricsVal}</textarea>
    </div>
  `;

  // Handle delete section click
  row.querySelector('.btn-remove-section').addEventListener('click', () => {
    const rowsCount = manualSectionsContainer.querySelectorAll('.manual-section-row').length;
    if (rowsCount <= 1) {
      alert('Lagu harus memiliki minimal satu section.');
      return;
    }
    row.remove();
  });

  return row;
}

openManualSongBtn.addEventListener('click', () => {
  checkAdminAuth(() => {
    state.editingManualSong = { id: null, cloudFilename: null };
    manualSongTitle.value = '';
    manualSectionsContainer.innerHTML = '';
    manualSectionsContainer.appendChild(createManualSectionRow());
    manualSongModal.classList.remove('hidden');
    manualSongTitle.focus();
    manualSongModal.querySelector('h2').textContent = 'Tambah Lagu Baru';
  });
});

addManualSectionBtn.addEventListener('click', () => {
  manualSectionsContainer.appendChild(createManualSectionRow());
  // Scroll container to bottom
  const body = manualSongModal.querySelector('.ebody');
  body.scrollTop = body.scrollHeight;
});

function closeManualModal() {
  manualSongModal.classList.add('hidden');
}

closeManualSongModal.addEventListener('click', closeManualModal);
cancelManualSong.addEventListener('click', closeManualModal);

saveManualSong.addEventListener('click', () => {
  checkAdminAuth(async () => {
    const title = manualSongTitle.value.trim();
    if (!title) {
      alert('Judul lagu tidak boleh kosong.');
      return;
    }

    const rows = manualSectionsContainer.querySelectorAll('.manual-section-row');
    if (rows.length === 0) {
      alert('Lagu harus memiliki minimal satu section.');
      return;
    }

    const parsedSections = [];
    const tagCounts = {};
    let hasChords = false;
    const rawTextParts = [];

    for (let i = 0; i < rows.length; i++) {
      const label = rows[i].querySelector('.manual-section-label').value.trim();
      const lyrics = rows[i].querySelector('.manual-section-lyrics').value.trim();

      if (!label) {
        alert(`Nama section ke-${i + 1} tidak boleh kosong.`);
        return;
      }
      if (!lyrics) {
        alert(`Lirik section "${label}" tidak boleh kosong.`);
        return;
      }

      rawTextParts.push(`[${label}]`);
      rawTextParts.push(lyrics);
      rawTextParts.push('');

      const processedText = convertToSongFormat(lyrics);
      const rawLines = processedText.replace(/\r/g, '').split('\n');
      const lines = [];
      let pendingChord = null;
      let pendingNote = null;

      for (const line of rawLines) {
        const chordMatch = line.match(/^\s*\[CHORD\](.*)$/i);
        if (chordMatch) {
          pendingChord = chordMatch[1].replace(/\s+$/, '');
          continue;
        }
        const noteMatch = line.match(/^\s*\[NOTES?\](.*)$/i);
        if (noteMatch) {
          pendingNote = noteMatch[1].trim();
          continue;
        }
        lines.push({ text: line, chord: pendingChord || null, note: pendingNote || null });
        if (pendingChord) hasChords = true;
        pendingChord = null;
        pendingNote = null;
      }

      const tag = label.toUpperCase();
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      const finalLabel = tagCounts[tag] > 1 ? `${cap(label)} ${tagCounts[tag]}` : cap(label);

      parsedSections.push({
        tag: tag,
        label: finalLabel,
        lines: lines
      });
    }

    // Construct song object
    const isEditing = state.editingManualSong && state.editingManualSong.id;
    const songId = isEditing ? state.editingManualSong.id : uid();

    const songRecord = {
      id: songId,
      title: title,
      groups: ['manual'],
      sections: parsedSections,
      isManual: true,
      searchText: (title + ' ' + parsedSections.flatMap(s => s.lines.map(l => l.text)).join(' ')).toLowerCase()
    };
    if (hasChords) {
      songRecord.groups.push('chord');
    }

    const githubRepo = getGithubRepo();
    if (!githubRepo) {
      alert('GitHub Repository belum dikonfigurasi. Silakan atur di Pengaturan Cloud Sync.');
      return;
    }

    showToast(isEditing ? 'Memperbarui lagu di GitHub Cloud...' : 'Mengunggah lagu ke GitHub Cloud...');
    saveManualSong.disabled = true;
    saveManualSong.textContent = 'Menyimpan...';

    try {
      const fullRawText = `title: ${title}\n\n` + rawTextParts.join('\n');
      const cloudFilename = await uploadSongToGithub(songRecord, fullRawText, state.editingManualSong.cloudFilename);
      songRecord.cloudFilename = cloudFilename;

      // Update local state memory
      if (isEditing) {
        const idx = state.songs.findIndex(s => s.id === songId);
        if (idx !== -1) {
          state.songs[idx] = songRecord;
        }
        // Also update existing item in cart if active
        state.cart.forEach(item => {
          if (item.songId === songId) {
            item.title = title;
            item.groups = songRecord.groups;
            item.sections = parsedSections.map(s => ({ ...s }));
          }
        });
      } else {
        state.songs.push(songRecord);

        // Add directly to cart (playlist)
        const cartItem = {
          cartId: uid(),
          songId: songId,
          title: title,
          type: 'song',
          groups: songRecord.groups,
          isManual: true,
          sections: parsedSections.map(s => ({ ...s }))
        };
        state.cart.push(cartItem);
      }

      // Refresh everything
      renderSongList();
      renderTabCounts();
      renderCart();
      renderPreview();
      closeManualModal();
      showToast(isEditing ? 'Lagu berhasil diperbarui di GitHub Cloud.' : 'Lagu berhasil disimpan ke GitHub Cloud.');
    } catch (e) {
      console.error(e);
      if (e.message && e.message.includes('403')) {
        handleWorkerAuthError();
      } else {
        alert('Gagal menyinkronkan ke GitHub Cloud: ' + e.message + '\n\nAksi dibatalkan.');
      }
    } finally {
      saveManualSong.disabled = false;
      saveManualSong.textContent = 'Simpan Lagu';
    }
  });
});

/* ============================= GITHUB CLOUD SINKRONISASI ============================= */
const DEFAULT_GITHUB_REPO = 'blessedcotw/SongRepo_userdata';
const DEFAULT_GITHUB_BRANCH = 'main';
const WORKER_BASE_URL = 'https://songrepo-userdata.mm-cotw.workers.dev';

// Hash password admin yang di-cache selama sesi (tidak pernah menyimpan password asli)
// Verifikasi kebenaran hash dilakukan oleh Cloudflare Worker, bukan di sini
let adminHashCache = null;

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function handleWorkerAuthError() {
  sessionStorage.removeItem('song_repo_is_admin');
  adminHashCache = null;
  showToast('Sesi admin berakhir atau password salah. Silakan coba lagi.');
}

/**
 * Tampilkan modal password, verifikasi ke worker, dan kembalikan true/false.
 * Modal tetap terbuka selama verifikasi — error tampil inline dengan animasi shake.
 * User bisa retry tanpa menutup/membuka ulang modal.
 */
function promptAndVerifyAdmin(messageText) {
  return new Promise((resolve) => {
    const modal = document.getElementById('passwordModal');
    const card  = document.getElementById('passwordModalCard');
    const promptText = document.getElementById('passwordPromptText');
    const input  = document.getElementById('adminPasswordInput');
    const errEl  = document.getElementById('passwordError');
    const confirmBtn = document.getElementById('confirmPasswordBtn');
    const cancelBtn  = document.getElementById('cancelPasswordBtn');
    const iconEl = document.getElementById('passwordModalIcon');

    // Reset state
    promptText.textContent = messageText;
    input.value = '';
    input.classList.remove('error');
    errEl.style.opacity = '0';
    errEl.textContent = '';
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Konfirmasi';
    iconEl.textContent = '🔒';
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);

    function showError(msg) {
      errEl.textContent = msg;
      errEl.style.opacity = '1';
      input.classList.add('error');
      card.classList.remove('pwd-shake');
      void card.offsetWidth; // reflow untuk restart animasi
      card.classList.add('pwd-shake');
      iconEl.textContent = '❌';
      input.select();
    }

    function clearError() {
      errEl.style.opacity = '0';
      input.classList.remove('error');
      iconEl.textContent = '🔒';
    }

    function setLoading(loading) {
      confirmBtn.disabled = loading;
      confirmBtn.textContent = loading ? 'Memverifikasi...' : 'Konfirmasi';
      input.disabled = loading;
    }

    function cleanup() {
      modal.classList.add('hidden');
      input.disabled = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Konfirmasi';
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      input.removeEventListener('keydown', handleKeydown);
      input.removeEventListener('input', clearError);
    }

    async function handleConfirm() {
      const pwd = input.value;
      if (!pwd) {
        showError('Masukkan kata sandi terlebih dahulu.');
        return;
      }
      setLoading(true);
      const hash = await hashPassword(pwd);
      try {
        const res = await fetch(`${WORKER_BASE_URL}/auth/verify`, {
          method: 'POST',
          headers: { 'X-Admin-Hash': hash }
        });
        if (res.ok) {
          adminHashCache = hash;
          sessionStorage.setItem('song_repo_is_admin', 'true');
          localStorage.setItem('song_repo_admin_hash', hash);
          iconEl.textContent = '✅';
          cleanup();
          resolve(true);
        } else if (res.status === 403) {
          setLoading(false);
          showError('Kata sandi salah. Coba lagi.');
        } else {
          setLoading(false);
          showError('Gagal terhubung ke server (status ' + res.status + ').');
        }
      } catch (e) {
        setLoading(false);
        showError('Tidak dapat terhubung ke server. Periksa koneksi internet.');
      }
    }

    function handleCancel() {
      cleanup();
      resolve(false);
    }

    function handleKeydown(e) {
      if (e.key === 'Enter' && !confirmBtn.disabled) handleConfirm();
      else if (e.key === 'Escape') handleCancel();
    }

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    input.addEventListener('keydown', handleKeydown);
    input.addEventListener('input', clearError);
  });
}

async function checkAdminAuth(callback) {
  // Jika hash sudah di-cache di sesi ini, langsung lanjut
  if (sessionStorage.getItem('song_repo_is_admin') === 'true' && adminHashCache) {
    callback();
    return;
  }
  const ok = await promptAndVerifyAdmin('Masukkan kata sandi Admin untuk melanjutkan:');
  if (ok) callback();
}

function getGithubRepo() {
  return localStorage.getItem('song_repo_github_repo') || DEFAULT_GITHUB_REPO;
}
function getAdminHash() {
  if (adminHashCache) return adminHashCache;
  const stored = localStorage.getItem('song_repo_admin_hash') || sessionStorage.getItem('song_repo_admin_hash');
  if (stored) {
    adminHashCache = stored;
    return stored;
  }
  return null;
}
function getGithubBranch() {
  return localStorage.getItem('song_repo_github_branch') || DEFAULT_GITHUB_BRANCH;
}

async function uploadSongToGithub(songRecord, processedText, existingFilename = null) {
  const adminHash = getAdminHash();
  const repo = getGithubRepo();
  const branch = getGithubBranch();
  if (!adminHash || !repo) return null;

  // Header untuk worker: X-Admin-Hash membuktikan kamu adalah admin
  // Token GitHub TIDAK ada di sini — disimpan di Cloudflare Worker
  const writeHeaders = {
    'Content-Type': 'application/json',
    'X-Admin-Hash': adminHash
  };
  // Header untuk GET request (tidak perlu auth)
  const readHeaders = { 'Content-Type': 'application/json' };

  const sanitizedTitle = songRecord.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
  const filename = existingFilename || `manual_${sanitizedTitle}.txt`;
  const songPath = `library/${filename}`;
  const songContentB64 = btoa(unescape(encodeURIComponent(processedText)));

  let fileSha = null;
  if (existingFilename) {
    try {
      const fileRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/${songPath}?ref=${branch}`, { headers: readHeaders });
      if (fileRes.ok) {
        const fileData = await fileRes.json();
        fileSha = fileData.sha;
      }
    } catch (e) {
      console.warn('Gagal mendapatkan SHA file yang ada:', e);
    }
  }

  const uploadSongRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/${songPath}`, {
    method: 'PUT',
    headers: writeHeaders,
    body: JSON.stringify({
      message: existingFilename ? `Update manual song: ${songRecord.title}` : `Add manual song: ${songRecord.title}`,
      content: songContentB64,
      sha: fileSha || undefined,
      branch
    })
  });

  if (!uploadSongRes.ok) {
    if (uploadSongRes.status === 403) {
      throw new Error('Kata sandi admin salah. Akses ditolak oleh server.');
    }
    throw new Error(`Gagal mengunggah file lagu: ${uploadSongRes.statusText}`);
  }

  if (!existingFilename) {
    let manifestSha = null;
    let manifestList = [];
    try {
      const manifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/library-manifest.json?ref=${branch}`, { headers: readHeaders });
      if (manifestRes.ok) {
        const manifestData = await manifestRes.json();
        manifestSha = manifestData.sha;
        const rawText = atob(manifestData.content);
        manifestList = JSON.parse(rawText);
      }
    } catch (e) {
      console.log('Manifest belum ada, akan membuat baru.');
    }

    if (!manifestList.includes(filename)) {
      manifestList.push(filename);
    }

    const manifestContentB64 = btoa(JSON.stringify(manifestList, null, 2));
    const updateManifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/library-manifest.json`, {
      method: 'PUT',
      headers: writeHeaders,
      body: JSON.stringify({
        message: `Update manifest for: ${songRecord.title}`,
        content: manifestContentB64,
        sha: manifestSha || undefined,
        branch
      })
    });

    if (!updateManifestRes.ok) {
      if (updateManifestRes.status === 403) {
        throw new Error('Kata sandi admin salah. Akses ditolak oleh server.');
      }
      throw new Error(`Gagal memperbarui manifest: ${updateManifestRes.statusText}`);
    }
  }

  return filename;
}

async function deleteSongFromGithub(filename) {
  const adminHash = getAdminHash();
  const repo = getGithubRepo();
  const branch = getGithubBranch();
  if (!adminHash || !repo) return;

  const writeHeaders = {
    'Content-Type': 'application/json',
    'X-Admin-Hash': adminHash
  };
  const readHeaders = { 'Content-Type': 'application/json' };

  let fileSha = null;
  try {
    const fileRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/${filename}?ref=${branch}`, { headers: readHeaders });
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      fileSha = fileData.sha;
    }
  } catch (e) {
    console.warn('Gagal mendapatkan SHA file:', e);
  }

  if (fileSha) {
    const deleteRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/${filename}`, {
      method: 'DELETE',
      headers: writeHeaders,
      body: JSON.stringify({
        message: `Delete manual song: ${filename}`,
        sha: fileSha,
        branch
      })
    });
    if (!deleteRes.ok) {
      if (deleteRes.status === 403) {
        throw new Error('Kata sandi admin salah. Akses ditolak oleh server.');
      }
      throw new Error(`Gagal menghapus file dari GitHub (status: ${deleteRes.status})`);
    }
  } else {
    console.log(`File ${filename} tidak ditemukan di GitHub, lanjut membersihkan manifest.`);
  }

  const manifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/library-manifest.json?ref=${branch}`, { headers: readHeaders });
  if (!manifestRes.ok) {
    throw new Error(`Gagal mengambil manifest dari GitHub (status: ${manifestRes.status})`);
  }

  const manifestData = await manifestRes.json();
  const rawText = atob(manifestData.content);
  let manifestList = JSON.parse(rawText);
  manifestList = manifestList.filter(f => f !== filename);

  const updateManifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/library-manifest.json`, {
    method: 'PUT',
    headers: writeHeaders,
    body: JSON.stringify({
      message: `Remove from manifest: ${filename}`,
      content: btoa(JSON.stringify(manifestList, null, 2)),
      sha: manifestData.sha,
      branch
    })
  });

  if (!updateManifestRes.ok) {
    if (updateManifestRes.status === 403) {
      throw new Error('Kata sandi admin salah. Akses ditolak oleh server.');
    }
    throw new Error(`Gagal memperbarui manifest di GitHub (status: ${updateManifestRes.status})`);
  }
}

async function purgeJsDelivrCache(repo, branch, path) {
  try {
    const url = `https://purge.jsdelivr.net/gh/${repo}@${branch}/${path}`;
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      console.log(`jsDelivr cache purged for ${path}:`, data);
    } else {
      // If POST fails, try GET as fallback
      await fetch(url, { method: 'GET' });
    }
  } catch (e) {
    console.warn(`Error purging jsDelivr cache untuk ${path}:`, e);
  }
}

async function loadCloudSongs() {
  const repo = getGithubRepo();
  const branch = getGithubBranch();
  if (!repo) return [];

  const readHeaders = { 'Content-Type': 'application/json' };

  // 1. Coba unduh 1 file bundle tunggal (library-bundle.json) untuk 1-request super fast load
  try {
    const bundleRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/library-bundle.json?ref=${branch}`, { headers: readHeaders });
    if (bundleRes.ok) {
      const bundleData = await bundleRes.json();
      const rawText = decodeURIComponent(escape(atob(bundleData.content.replace(/\s/g, ''))));
      const parsedBundle = JSON.parse(rawText);

      if (parsedBundle && Array.isArray(parsedBundle.songs)) {
        const cloudCache = {
          timestamp: Date.now(),
          files: {}
        };

        const results = parsedBundle.songs.map(item => {
          cloudCache.files[item.filename] = item.text;
          const song = buildSongRecord(item.filename, item.text);
          song.cloudFilename = item.filename;
          return song;
        });

        await setCache('cloud_files_cache', cloudCache);
        return results;
      }
    }
  } catch (e) {
    console.warn('Bundle cloud belum ada atau gagal dimuat, menggunakan fallback:', e);
  }

  // 2. Fallback jika library-bundle.json belum dibuat di repository
  try {
    const manifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/library-manifest.json?ref=${branch}`, { headers: readHeaders });
    if (!manifestRes.ok) {
      if (manifestRes.status === 404) {
        return [];
      }
      throw new Error(`Gagal memuat manifest dari Worker (status: ${manifestRes.status})`);
    }
    const manifestData = await manifestRes.json();
    const rawText = atob(manifestData.content);
    const filenames = JSON.parse(rawText);

    if (!Array.isArray(filenames) || filenames.length === 0) return [];

    // Baca cache cloud dari IndexedDB
    let cloudCache = await getCache('cloud_files_cache') || { timestamp: 0, files: {} };
    if (!cloudCache.files) cloudCache.files = {};

    const results = [];
    const missingFilenames = [];

    // 1. Cek file mana yang sudah ada di IndexedDB lokal & bersihkan file yang sudah dihapus di cloud
    Object.keys(cloudCache.files).forEach(fn => {
      if (!filenames.includes(fn)) {
        delete cloudCache.files[fn];
      }
    });

    for (const fname of filenames) {
      if (cloudCache.files[fname]) {
        const song = buildSongRecord(fname, cloudCache.files[fname]);
        song.cloudFilename = fname;
        results.push(song);
      } else {
        missingFilenames.push(fname);
      }
    }

    // 2. Jika ada file baru yang belum ada di IndexedDB, unduh secara paralel via Worker
    if (missingFilenames.length > 0) {
      const batchPromises = missingFilenames.map(async (fname) => {
        try {
          const fileRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/library/${fname}?ref=${branch}`, { headers: readHeaders });
          if (!fileRes.ok) throw new Error(`Status: ${fileRes.status}`);
          const fileData = await fileRes.json();
          const text = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
          
          cloudCache.files[fname] = text;
          const song = buildSongRecord(fname, text);
          song.cloudFilename = fname;
          return song;
        } catch (e) {
          console.warn('Gagal memuat lagu cloud:', fname, e);
          return null;
        }
      });

      const fetchedSongs = await Promise.all(batchPromises);
      for (const song of fetchedSongs) {
        if (song) results.push(song);
      }

      // Simpan pembaruan cache cloud ke IndexedDB
      cloudCache.timestamp = Date.now();
      await setCache('cloud_files_cache', cloudCache);
    }

    return results;
  } catch (e) {
    console.warn('Gagal memuat data dari GitHub Cloud via Worker:', e);
    return [];
  }
}

async function syncCloudSongs() {
  const repo = getGithubRepo();
  if (!repo) return;

  const statusEl = document.getElementById('scanStatus');
  const oldText = statusEl.textContent;
  statusEl.textContent = 'Menghubungkan ke GitHub Cloud...';

  try {
    const cloudSongs = await loadCloudSongs();
    if (cloudSongs.length > 0) {
      const existingTitles = new Map();
      state.songs.forEach((s, idx) => existingTitles.set(s.title.toLowerCase().trim(), idx));

      cloudSongs.forEach(s => {
        const key = s.title.toLowerCase().trim();
        if (existingTitles.has(key)) {
          const idx = existingTitles.get(key);
          state.songs[idx] = s;
        } else {
          state.songs.push(s);
        }
      });
      renderSongList();
      renderTabCounts();
    }
    statusEl.textContent = `${state.songs.length} lagu dimuat (Cloud terhubung)`;
  } catch (e) {
    console.warn('Gagal menyinkronkan cloud:', e);
    statusEl.textContent = oldText;
  }
}

/* ============================= INIT ============================= */
setupPointerDrag(document.getElementById('sectionList'), (newOrder) => {
  state.editing.working = newOrder.map(idx => state.editing.working[idx]);
  renderSectionList();
});
setupPointerDrag(document.getElementById('cartList'), (newOrder) => {
  state.cart = newOrder.map(idx => state.cart[idx]);
  renderCart();
  renderPreview();
});

scanLibrary();
renderCart();
renderPreview();

/* ============================= SONGLIST CLOUD MANAGEMENT ============================= */
async function ensureAdminHash() {
  let hash = getAdminHash();
  if (!hash) {
    const ok = await promptAndVerifyAdmin('Masukkan kata sandi Admin (diperlukan 1x untuk otorisasi simpan/hapus Cloud):');
    if (!ok) throw new Error('Otentikasi admin dibatalkan.');
    hash = getAdminHash();
  }
  return hash;
}

async function uploadSonglistToGithub(songlistData) {
  const adminHash = await ensureAdminHash();
  const repo = getGithubRepo();
  const branch = getGithubBranch();
  if (!repo) return null;

  const writeHeaders = {
    'Content-Type': 'application/json',
    'X-Admin-Hash': adminHash
  };
  const readHeaders = { 'Content-Type': 'application/json' };

  const sanitizedEvent = (songlistData.eventName || 'ibadah')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
  const dateStr = songlistData.eventDate || new Date().toISOString().slice(0, 10);
  const filename = `songlist_${dateStr}_${sanitizedEvent}_${songlistData.id.slice(0, 6)}.json`;
  const filePath = `songlists/${filename}`;
  const jsonContent = JSON.stringify(songlistData, null, 2);
  const b64Content = utf8ToBase64(jsonContent);

  let fileSha = null;
  try {
    const fileRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/${filePath}?ref=${branch}`, { headers: readHeaders });
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      fileSha = fileData.sha;
    }
  } catch (e) {}

  const uploadRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: writeHeaders,
    body: JSON.stringify({
      message: `Save songlist: ${songlistData.eventName} (${dateStr}) by ${songlistData.author || 'Anonim'}`,
      content: b64Content,
      sha: fileSha || undefined,
      branch
    })
  });

  if (!uploadRes.ok) {
    if (uploadRes.status === 403) {
      throw new Error('Kata sandi admin tidak valid. Akses ditolak oleh server.');
    }
    throw new Error(`Gagal menyimpan file songlist: ${uploadRes.statusText}`);
  }

  // Update songlists-manifest.json
  let manifestSha = null;
  let manifestList = [];
  try {
    const manifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/songlists/songlists-manifest.json?ref=${branch}`, { headers: readHeaders });
    if (manifestRes.ok) {
      const manifestData = await manifestRes.json();
      manifestSha = manifestData.sha;
      const rawText = decodeURIComponent(escape(atob(manifestData.content.replace(/\s/g, ''))));
      manifestList = JSON.parse(rawText);
    }
  } catch (e) {}

  if (!manifestList.includes(filename)) {
    manifestList.push(filename);
  }

  const manifestB64 = utf8ToBase64(JSON.stringify(manifestList, null, 2));
  const updateManifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/songlists/songlists-manifest.json`, {
    method: 'PUT',
    headers: writeHeaders,
    body: JSON.stringify({
      message: `Update songlists manifest for: ${songlistData.eventName}`,
      content: manifestB64,
      sha: manifestSha || undefined,
      branch
    })
  });

  if (!updateManifestRes.ok) {
    if (updateManifestRes.status === 403) {
      throw new Error('Kata sandi admin tidak valid. Akses ditolak oleh server.');
    }
    throw new Error(`Gagal memperbarui manifest songlist: ${updateManifestRes.statusText}`);
  }

  return filename;
}

async function loadCloudSonglists() {
  const repo = getGithubRepo();
  const branch = getGithubBranch();
  if (!repo) return [];

  const readHeaders = { 'Content-Type': 'application/json' };

  try {
    const manifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/songlists/songlists-manifest.json?ref=${branch}`, { headers: readHeaders });
    if (!manifestRes.ok) {
      return [];
    }
    const manifestData = await manifestRes.json();
    const rawText = decodeURIComponent(escape(atob(manifestData.content.replace(/\s/g, ''))));
    const filenames = JSON.parse(rawText);

    if (!Array.isArray(filenames) || filenames.length === 0) return [];

    const songlists = [];
    for (const fname of filenames) {
      try {
        const fileRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/songlists/${fname}?ref=${branch}`, { headers: readHeaders });
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          const jsonText = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
          const data = JSON.parse(jsonText);
          data.cloudFilename = fname;
          songlists.push(data);
        }
      } catch (e) {
        console.warn('Gagal memuat songlist:', fname, e);
      }
    }

    // Sort by date / updatedAt descending
    songlists.sort((a, b) => new Date(b.updatedAt || b.eventDate) - new Date(a.updatedAt || a.eventDate));
    return songlists;
  } catch (e) {
    console.warn('Gagal memuat songlists dari Cloud:', e);
    return [];
  }
}

async function deleteSonglistFromGithub(filename) {
  const adminHash = await ensureAdminHash();
  const repo = getGithubRepo();
  const branch = getGithubBranch();
  if (!repo) return;

  const writeHeaders = {
    'Content-Type': 'application/json',
    'X-Admin-Hash': adminHash
  };
  const readHeaders = { 'Content-Type': 'application/json' };

  let fileSha = null;
  try {
    const fileRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/songlists/${filename}?ref=${branch}`, { headers: readHeaders });
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      fileSha = fileData.sha;
    }
  } catch (e) {}

  if (fileSha) {
    await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/songlists/${filename}`, {
      method: 'DELETE',
      headers: writeHeaders,
      body: JSON.stringify({
        message: `Delete songlist: ${filename}`,
        sha: fileSha,
        branch
      })
    });
  }

  // Remove from manifest
  try {
    const manifestRes = await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/songlists/songlists-manifest.json?ref=${branch}`, { headers: readHeaders });
    if (manifestRes.ok) {
      const manifestData = await manifestRes.json();
      const rawText = decodeURIComponent(escape(atob(manifestData.content.replace(/\s/g, ''))));
      let manifestList = JSON.parse(rawText);
      manifestList = manifestList.filter(f => f !== filename);

      await fetch(`${WORKER_BASE_URL}/github/repos/${repo}/contents/songlists/songlists-manifest.json`, {
        method: 'PUT',
        headers: writeHeaders,
        body: JSON.stringify({
          message: `Remove from manifest: ${filename}`,
          content: utf8ToBase64(JSON.stringify(manifestList, null, 2)),
          sha: manifestData.sha,
          branch
        })
      });
    }
  } catch (e) {}
}

// UI Event Listeners for Songlist Cloud Sync
document.getElementById('saveSonglistBtn').addEventListener('click', async () => {
  if (state.cart.length === 0) {
    showToast('Daftar pujian masih kosong.');
    return;
  }

  const lastAuthor = localStorage.getItem('song_repo_last_author') || '';
  const authorInput = prompt('Masukkan nama Anda sebagai pembuat daftar pujian (Author):', lastAuthor);
  if (authorInput === null) return;
  const authorName = authorInput.trim() || 'Anonim';
  localStorage.setItem('song_repo_last_author', authorName);

  const saveBtn = document.getElementById('saveSonglistBtn');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';

  try {
    const eventName = getEventName();
    const eventDateVal = document.getElementById('eventDate').value;
    const songlistData = {
      id: uid(),
      eventName: eventName,
      eventDate: eventDateVal,
      author: authorName,
      updatedAt: new Date().toISOString(),
      cart: state.cart
    };

    await uploadSonglistToGithub(songlistData);
    showToast(`Songlist "${eventName}" (${authorName}) berhasil disimpan ke Cloud.`);
  } catch (e) {
    console.error(e);
    showToast('Gagal menyimpan songlist: ' + e.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
});

const songlistModal = document.getElementById('songlistModal');
const closeSonglistModal = document.getElementById('closeSonglistModal');
const cancelSonglistModal = document.getElementById('cancelSonglistModal');
const savedSonglistsContainer = document.getElementById('savedSonglistsContainer');

function closeSonglistModalFunc() {
  songlistModal.classList.add('hidden');
}

closeSonglistModal.addEventListener('click', closeSonglistModalFunc);
cancelSonglistModal.addEventListener('click', closeSonglistModalFunc);
songlistModal.addEventListener('click', (e) => {
  if (e.target.id === 'songlistModal') closeSonglistModalFunc();
});

document.getElementById('openSonglistModalBtn').addEventListener('click', async () => {
  savedSonglistsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Memuat songlist tersimpan dari Cloud...</div>';
  songlistModal.classList.remove('hidden');

  try {
    const list = await loadCloudSonglists();
    if (list.length === 0) {
      savedSonglistsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Belum ada songlist tersimpan di Cloud.</div>';
      return;
    }

    savedSonglistsContainer.innerHTML = list.map((sl, idx) => {
      const songCount = sl.cart ? sl.cart.filter(c => c.type === 'song').length : 0;
      const dateText = sl.eventDate ? formatDateID(sl.eventDate) : 'Tanpa Tanggal';
      const authorText = sl.author ? ` · ✍️ oleh ${escapeHtml(sl.author)}` : '';
      return `
        <div class="songlist-row">
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; text-align: left;">
            <span class="songlist-title">${escapeHtml(sl.eventName || 'Ibadah')}</span>
            <span class="songlist-meta">📅 ${escapeHtml(dateText)} · 🎵 ${songCount} lagu${authorText}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn" data-action="load-songlist" data-idx="${idx}" style="background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #ffffff; padding: 6px 14px; font-size: 12px; border: none;">Muat</button>
            <button class="btn ghost danger" data-action="delete-songlist" data-idx="${idx}" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); padding: 6px 10px; font-size: 12px;" title="Hapus">✕</button>
          </div>
        </div>
      `;
    }).join('');

    savedSonglistsContainer.querySelectorAll('[data-action=load-songlist]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sl = list[Number(btn.dataset.idx)];
        if (!sl) return;

        state.cart = sl.cart || [];
        if (sl.eventName) {
          selectedEventNameVal = sl.eventName;
          const labelEl = document.getElementById('selectedEventName');
          if (labelEl) labelEl.textContent = sl.eventName;
        }
        if (sl.eventDate) {
          const dateEl = document.getElementById('eventDate');
          if (dateEl) dateEl.value = sl.eventDate;
        }

        renderCart();
        renderPreview();
        closeSonglistModalFunc();
        const authorMsg = sl.author ? ` (oleh ${sl.author})` : '';
        showToast(`Songlist "${sl.eventName}"${authorMsg} berhasil dimuat.`);
      });
    });

    savedSonglistsContainer.querySelectorAll('[data-action=delete-songlist]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sl = list[Number(btn.dataset.idx)];
        if (!sl) return;
        if (!confirm(`Hapus songlist "${sl.eventName}" (${sl.author || 'Anonim'}) secara permanen?`)) return;
        showToast('Menghapus songlist...');
        try {
          await deleteSonglistFromGithub(sl.cloudFilename);
          btn.closest('.songlist-row').remove();
          showToast('Songlist berhasil dihapus dari Cloud.');
        } catch (e) {
          console.error(e);
          showToast('Gagal menghapus songlist: ' + e.message);
        }
      });
    });
  } catch (e) {
    console.error(e);
    savedSonglistsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 20px;">Gagal memuat songlist dari Cloud.</div>';
  }
});
