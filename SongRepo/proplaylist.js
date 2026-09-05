/**
 * proplaylist.js - ProPresenter 7 Playlist Generator & Protobuf Encoder Module
 * ==============================================================================
 * Membangun berkas .proplaylist berstandar resmi ProPresenter 7 (ZIP Bundle + Protobuf)
 * tanpa dependensi backend.
 */

(function (global) {
  'use strict';

  // Helper UUID v4
  function generateUuid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1).toUpperCase();
    }
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }

  // Lightweight Protobuf Binary Encoder
  class ProtoWriter {
    constructor() {
      this.buffer = [];
    }

    writeVarint(fieldNumber, val) {
      let num = typeof val === 'boolean' ? (val ? 1 : 0) : Number(val);
      if (isNaN(num)) num = 0;
      this.writeTag(fieldNumber, 0);
      while (num >= 0x80) {
        this.buffer.push((num & 0x7f) | 0x80);
        num >>>= 7;
      }
      this.buffer.push(num & 0x7f);
    }

    writeTag(fieldNumber, wireType) {
      const tag = (fieldNumber << 3) | wireType;
      let num = tag;
      while (num >= 0x80) {
        this.buffer.push((num & 0x7f) | 0x80);
        num >>>= 7;
      }
      this.buffer.push(num & 0x7f);
    }

    writeRawBytes(bytes) {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer.push(bytes[i]);
      }
    }

    writeBytes(fieldNumber, bytes) {
      this.writeTag(fieldNumber, 2);
      this.writeVarintLen(bytes.length);
      this.writeRawBytes(bytes);
    }

    writeVarintLen(length) {
      let num = length;
      while (num >= 0x80) {
        this.buffer.push((num & 0x7f) | 0x80);
        num >>>= 7;
      }
      this.buffer.push(num & 0x7f);
    }

    writeString(fieldNumber, str) {
      if (!str) return;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      this.writeBytes(fieldNumber, bytes);
    }

    writeMessage(fieldNumber, protoWriter) {
      if (!protoWriter) return;
      const bytes = protoWriter.finish();
      this.writeBytes(fieldNumber, bytes);
    }

    writeFloat(fieldNumber, val) {
      const f32 = new Float32Array([val]);
      const u8 = new Uint8Array(f32.buffer);
      this.writeTag(fieldNumber, 5); // 32-bit wire type
      this.writeRawBytes(u8);
    }

    finish() {
      return new Uint8Array(this.buffer);
    }
  }

  // Format penamaan file: [namalayanan][ddmmyy].proplaylist (menghapus kata "ibadah")
  function formatProPlaylistFilename(eventName, isoDate) {
    let cleanEvent = (eventName || 'Pujian')
      .toLowerCase()
      .replace(/ibadah/gi, '')
      .replace(/[^a-z0-9]+/g, '')
      .trim();

    if (!cleanEvent) cleanEvent = 'pujian';

    let dateStr = '';
    if (isoDate && isoDate.includes('-')) {
      const parts = isoDate.split('-');
      if (parts.length === 3) {
        const y = parts[0].slice(-2);
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        dateStr = `${d}${m}${y}`;
      }
    }

    if (!dateStr) {
      const now = new Date();
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = String(now.getFullYear()).slice(-2);
      dateStr = `${d}${m}${y}`;
    }

    return `${cleanEvent}${dateStr}.proplaylist`;
  }

  // Protobuf Encoders for ProPresenter 7 entities
  function encodeUUID(uuidStr) {
    const w = new ProtoWriter();
    const cleanUuid = (uuidStr || generateUuid()).toLowerCase();
    w.writeString(1, cleanUuid);
    return w;
  }

  function encodeURL(absoluteString, relativePathStr, originalFilePath) {
    const w = new ProtoWriter();
    w.writeString(1, absoluteString || ''); // absolute_string (field 1)

    let platform = 2; // PLATFORM_WIN32 (2)
    if (originalFilePath && (originalFilePath.startsWith('/') || originalFilePath.includes('/Users/'))) {
      platform = 1; // PLATFORM_MACOS (1)
    }
    w.writeVarint(3, platform); // platform (field 3)

    if (relativePathStr) {
      const localW = new ProtoWriter();
      localW.writeVarint(1, 10); // root = ROOT_SHOW (10)
      localW.writeString(2, relativePathStr); // path (field 2)
      w.writeMessage(4, localW); // local (field 4)
    }
    return w;
  }

  function encodeColor(r = 0.2, g = 0.4, b = 0.8, a = 1.0) {
    const w = new ProtoWriter();
    w.writeFloat(1, r);
    w.writeFloat(2, g);
    w.writeFloat(3, b);
    w.writeFloat(4, a);
    return w;
  }

  function encodeHeaderItem(title) {
    const w = new ProtoWriter();
    const colorW = encodeColor(0.15, 0.45, 0.85, 1.0);
    w.writeMessage(1, colorW);
    return w;
  }

  function encodePresentationItem(filePath, songUuid, songTitle) {
    const w = new ProtoWriter();
    let presentationBaseName = (songTitle || 'Lagu').trim();

    if (filePath) {
      const rawFileName = filePath.replace(/\\/g, '/').split('/').pop();
      if (rawFileName && rawFileName.toLowerCase().endsWith('.pro')) {
        presentationBaseName = rawFileName.slice(0, -4).trim();
      }
    }

    let relPath = `Libraries/Default/${presentationBaseName}.pro`;
    let absPath = filePath || `C:\\Users\\Lukas Ardianto\\Documents\\ProPresenter\\Libraries\\Default\\${presentationBaseName}.pro`;

    if (filePath && /Libraries/i.test(filePath)) {
      const parts = filePath.split(/Libraries[\\\/]/i);
      if (parts.length > 1 && parts[1].trim()) {
        relPath = `Libraries/${parts[1].replace(/\\/g, '/').replace(/^\/+/, '')}`;
      }
    }

    // 1. document_path (field 1)
    const urlW = encodeURL(absPath, relPath, filePath);
    w.writeMessage(1, urlW);

    // 2. arrangement (field 2)
    const arrUuid = songUuid || generateUuid();
    w.writeMessage(2, encodeUUID(arrUuid));

    return w;
  }

  function encodePlaceholderItem(songTitle) {
    const w = new ProtoWriter();
    const linkedW = new ProtoWriter();
    linkedW.writeString(2, songTitle || 'Lagu Manual');
    w.writeMessage(1, linkedW);
    return w;
  }

  function encodePlaylistItem(cartItem, songRecord) {
    const w = new ProtoWriter();
    const itemUuid = (songRecord && songRecord.uuid) ? songRecord.uuid : generateUuid();
    w.writeMessage(1, encodeUUID(itemUuid));

    const filePath = (songRecord && songRecord.file_path) ? songRecord.file_path : null;
    let displayTitle = (cartItem.title || (songRecord ? songRecord.title : 'Lagu')).trim();
    if (filePath) {
      const rawFileName = filePath.replace(/\\/g, '/').split('/').pop();
      if (rawFileName && rawFileName.toLowerCase().endsWith('.pro')) {
        displayTitle = rawFileName.slice(0, -4).trim();
      }
    }

    w.writeString(2, cartItem.type === 'break' ? (cartItem.label || 'Sesi Baru') : displayTitle);

    if (cartItem.type === 'break') {
      // Header item (field 3)
      w.writeMessage(3, encodeHeaderItem(cartItem.label || 'Sesi Baru'));
    } else {
      const songArrUuid = (songRecord && (songRecord.arrangement_uuid || songRecord.uuid)) ? (songRecord.arrangement_uuid || songRecord.uuid) : itemUuid;

      // Item Presentation (field 4)
      w.writeMessage(4, encodePresentationItem(filePath, songArrUuid, displayTitle));
    }

    return w;
  }

  function encodePlaylist(playlistName, cartItems, songsMap) {
    const w = new ProtoWriter();
    w.writeMessage(1, encodeUUID(generateUuid())); // uuid
    w.writeString(2, playlistName); // name
    w.writeVarint(3, 1); // type = TYPE_PLAYLIST (1)

    // PlaylistItems (field 13)
    const itemsW = new ProtoWriter();
    cartItems.forEach(cartItem => {
      let songRecord = null;
      if (cartItem.type === 'song') {
        const titleKey = (cartItem.title || '').trim().toLowerCase();
        songRecord = songsMap.get(cartItem.songId) || songsMap.get(cartItem.id) || (titleKey ? songsMap.get(titleKey) : null);
      }
      const itemWriter = encodePlaylistItem(cartItem, songRecord);
      itemsW.writeMessage(1, itemWriter);
    });

    w.writeMessage(13, itemsW);
    return w;
  }

  function generateProPlaylistDataBytes(eventName, isoDate, cartItems, songsList) {
    const songsMap = new Map();
    if (Array.isArray(songsList)) {
      songsList.forEach(s => {
        if (s.id) songsMap.set(s.id, s);
        if (s.title) songsMap.set(s.title.trim().toLowerCase(), s);
      });
    }

    const playlistName = (eventName || 'Pujian').trim();
    const w = new ProtoWriter();

    // 1. application_info (field 1)
    const appW = new ProtoWriter();
    appW.writeVarint(1, 2); // platform = WINDOWS (2)

    const platVerW = new ProtoWriter();
    platVerW.writeVarint(1, 10);
    platVerW.writeString(3, "26200");
    appW.writeMessage(2, platVerW); // platform_version

    appW.writeVarint(3, 1); // application = PROPRESENTER (1)

    const appVerW = new ProtoWriter();
    appVerW.writeVarint(1, 7);
    appVerW.writeVarint(2, 12);
    appVerW.writeString(3, "118226960");
    appW.writeMessage(4, appVerW); // application_version

    w.writeMessage(1, appW);

    // 2. type (field 2)
    w.writeVarint(2, 1); // type = TYPE_PRESENTATION (1)

    // 3. root_node (field 3) -> Root Playlist Node (TYPE_ROOT = 4)
    const rootNodeW = new ProtoWriter();
    rootNodeW.writeMessage(1, encodeUUID(generateUuid())); // root uuid
    rootNodeW.writeVarint(3, 4); // type = TYPE_ROOT (4)

    // Sub-playlist (field 12 = playlists)
    const playlistArrayW = new ProtoWriter();
    const childPlaylistW = encodePlaylist(playlistName, cartItems, songsMap);
    playlistArrayW.writeMessage(1, childPlaylistW);

    rootNodeW.writeMessage(12, playlistArrayW);

    w.writeMessage(3, rootNodeW);

    return w.finish();
  }

  async function generateProPlaylistZipBundle(eventName, isoDate, cartItems, songsList, buildPro6XmlFn) {
    if (typeof JSZip === 'undefined') {
      throw new Error('Library JSZip belum dimuat di aplikasi.');
    }

    const dataBytes = generateProPlaylistDataBytes(eventName, isoDate, cartItems, songsList);
    const zip = new JSZip();

    // 1. File data Protobuf
    zip.file("data", dataBytes);

    // 2. Subfolder Media/ dan PDF/
    zip.folder("Media");
    zip.folder("PDF");

    // 3. Embed berkas .pro lirik untuk menjamin 100% penautan di ProPresenter 7 saat impor
    const songsMap = new Map();
    if (Array.isArray(songsList)) {
      songsList.forEach(s => {
        if (s.id) songsMap.set(s.id, s);
        if (s.title) songsMap.set(s.title.trim().toLowerCase(), s);
      });
    }

    cartItems.forEach((cartItem) => {
      if (cartItem.type === 'song') {
        const titleKey = (cartItem.title || '').trim().toLowerCase();
        const songRecord = songsMap.get(cartItem.songId) || songsMap.get(cartItem.id) || (titleKey ? songsMap.get(titleKey) : null) || cartItem;
        if (songRecord) {
          const filePath = songRecord.file_path || null;
          let safeTitle = (songRecord.title || cartItem.title || 'Lagu').trim();
          if (filePath) {
            const rawFileName = filePath.replace(/\\/g, '/').split('/').pop();
            if (rawFileName && rawFileName.toLowerCase().endsWith('.pro')) {
              safeTitle = rawFileName.slice(0, -4).trim();
            }
          }
          const proFileName = `${safeTitle}.pro`;

          let proXmlContent = "";
          if (typeof buildPro6XmlFn === 'function') {
            proXmlContent = buildPro6XmlFn(songRecord);
          } else {
            proXmlContent = `<?xml version="1.0" encoding="utf-8"?><RVPresentationDocument CCLISongTitle="${safeTitle}"></RVPresentationDocument>`;
          }

          zip.file(proFileName, proXmlContent);
        }
      }
    });

    return await zip.generateAsync({ type: 'blob' });
  }

  function detectPlaceholders(cartItems, songsList) {
    const songsMap = new Map();
    if (Array.isArray(songsList)) {
      songsList.forEach(s => {
        if (s.id) songsMap.set(s.id, s);
      });
    }

    const placeholders = [];
    cartItems.forEach(cartItem => {
      if (cartItem.type === 'song') {
        const songRecord = songsMap.get(cartItem.songId) || songsMap.get(cartItem.id);
        const isUserGenerated = !songRecord || songRecord.isManual || (songRecord.groups && songRecord.groups.includes('manual'));
        if (isUserGenerated) {
          placeholders.push({
            title: cartItem.title || (songRecord ? songRecord.title : 'Lagu Manual'),
            songId: cartItem.songId,
            cartItem: cartItem,
            songRecord: songRecord
          });
        }
      }
    });

    return placeholders;
  }

  // Export to global object
  global.ProPlaylistGenerator = {
    formatFilename: formatProPlaylistFilename,
    generateDataBytes: generateProPlaylistDataBytes,
    generateZipBundle: generateProPlaylistZipBundle,
    detectPlaceholders: detectPlaceholders
  };

})(typeof window !== 'undefined' ? window : this);
