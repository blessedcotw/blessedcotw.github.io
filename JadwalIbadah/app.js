/**
 * Jadwal Ibadah — GPdI COTW Temanggung
 * Instagram Story / Status WhatsApp (1080 x 1920) PNG Generator
 * Supports: Ibadah Raya (Minggu) & Pendalaman Alkitab (Rabu)
 */

// Cloud Storage Configuration
const SUPABASE_URL = 'https://iyrsxvmsghdsdgvxzpwk.supabase.co';
const ANON_KEY = 'sb_publishable_Hbf4i4xssAYV52uTGF80FA_tcIF4MIS';
const BUCKET_NAME = 'background';
const ACTIVE_BG_NAME = 'active_background.jpg';
const BACKUP_PREFIX = 'backups/';
const MAX_BACKUPS = 5;

// Indonesian Day & Month Names
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// Application State
const state = {
  mode: 'raya', // 'raya' (Ibadah Raya Minggu) or 'pa' (Pendalaman Alkitab Rabu)
  dateObj: new Date(),
  dateFormatted: '',
  services: [
    {
      id: 1,
      name: 'MINGGU PAGI',
      time: 'PK. 06.00 WIB',
      theme: '',
      fallbackTheme: 'TEMA IBADAH RAYA MINGGU PAGI',
      live: true
    },
    {
      id: 2,
      name: 'MINGGU SIANG',
      time: 'PK. 10.00 WIB',
      theme: '',
      fallbackTheme: 'TEMA IBADAH RAYA MINGGU SIANG',
      live: false
    },
    {
      id: 3,
      name: 'MINGGU SORE',
      time: 'PK. 18.00 WIB',
      theme: '',
      fallbackTheme: 'TEMA IBADAH RAYA MINGGU SORE',
      live: true
    }
  ],
  paService: {
    name: 'RABU',
    time: 'PUKUL 18.00',
    theme: '',
    fallbackTheme: 'TEMA IBADAH PENDALAMAN ALKITAB',
    live: true
  },
  igHandle: '@gpdicotw_temanggung',
  ytChannel: 'GPdI COTW Temanggung',
  dimOverlay: 0.35,
  activeBgUrl: '',
  activeBgImage: null,
  activeBgFileName: 'active_background.jpg',
  logoImage: null,
  liveImage: null,
  dividerImage: null,
  isUploading: false
};

// DOM Elements
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const downloadBtn = document.getElementById('downloadBtn');
const dateDisplayText = document.getElementById('dateDisplayText');
const nativeDateInput = document.getElementById('nativeDateInput');
const triggerDateBtn = document.getElementById('triggerDateBtn');
const btnNextSunday = document.getElementById('btnNextSunday');
const quickJumpBtnText = document.getElementById('quickJumpBtnText');

// Mode Tab Elements
const modeRayaBtn = document.getElementById('modeRayaBtn');
const modePABtn = document.getElementById('modePABtn');
const cardServicesRaya = document.getElementById('cardServicesRaya');
const cardServicesPA = document.getElementById('cardServicesPA');

// Raya Inputs
const themeInput1 = document.getElementById('themeInput1');
const themeInput2 = document.getElementById('themeInput2');
const themeInput3 = document.getElementById('themeInput3');
const streamToggle1 = document.getElementById('streamToggle1');
const streamToggle2 = document.getElementById('streamToggle2');
const streamToggle3 = document.getElementById('streamToggle3');

// PA Inputs
const themeInputPA = document.getElementById('themeInputPA');
const streamTogglePA = document.getElementById('streamTogglePA');
const streamUrlInputPA = document.getElementById('streamUrlInputPA');
const copyStreamUrlBtnPA = document.getElementById('copyStreamUrlBtnPA');

// Background Controls
const activeBgThumb = document.getElementById('activeBgThumb');
const activeBgName = document.getElementById('activeBgName');
const uploadBgBtn = document.getElementById('uploadBgBtn');
const bgFileInput = document.getElementById('bgFileInput');
const refreshStorageBtn = document.getElementById('refreshStorageBtn');
const uploadStatusBanner = document.getElementById('uploadStatusBanner');
const uploadStatusText = document.getElementById('uploadStatusText');
const dimOverlayInput = document.getElementById('dimOverlayInput');
const dimVal = document.getElementById('dimVal');
const canvasLoadingOverlay = document.getElementById('canvasLoadingOverlay');

/**
 * Helper: Format Date to uppercase Indonesian natural string
 * If mode === 'pa', append "PUKUL 18.00"
 */
function formatIndonesianDate(date, mode = 'raya') {
  if (!date || isNaN(date.getTime())) return '';
  const dayName = DAYS_ID[date.getDay()].toUpperCase();
  const dateNum = date.getDate();
  const monthName = MONTHS_ID[date.getMonth()].toUpperCase();
  const yearNum = date.getFullYear();

  if (mode === 'pa') {
    return `${dayName}, ${dateNum} ${monthName} ${yearNum} PUKUL 18.00`;
  }
  return `${dayName}, ${dateNum} ${monthName} ${yearNum}`;
}

/**
 * Helper: Find nearest upcoming Sunday
 */
function getNearestSunday(fromDate = new Date()) {
  const d = new Date(fromDate);
  const day = d.getDay();
  if (day === 0) return d;
  const daysUntilSunday = 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  return d;
}

/**
 * Helper: Find nearest upcoming Wednesday
 */
function getNearestWednesday(fromDate = new Date()) {
  const d = new Date(fromDate);
  const day = d.getDay();
  if (day === 3) return d;
  const daysUntilWed = (3 - day + 7) % 7;
  d.setDate(d.getDate() + (daysUntilWed === 0 ? 7 : daysUntilWed));
  return d;
}

/**
 * Preload Local Images (COTW Logo, Live Badge webp, and Divider)
 */
function preloadLocalAssets() {
  const p1 = new Promise((resolve) => {
    const img = new Image();
    img.src = 'cotw_logo.png';
    img.onload = () => {
      state.logoImage = img;
      resolve();
    };
    img.onerror = resolve;
  });

  const p2 = new Promise((resolve) => {
    const img = new Image();
    img.src = 'live.webp';
    img.onload = () => {
      state.liveImage = img;
      resolve();
    };
    img.onerror = () => {
      console.warn('live.webp load warning');
      resolve();
    };
  });

  const p3 = new Promise((resolve) => {
    const img = new Image();
    img.src = 'divider.png';
    img.onload = () => {
      state.dividerImage = img;
      resolve();
    };
    img.onerror = resolve;
  });

  return Promise.all([p1, p2, p3]);
}

/**
 * Fetch and Load Active Background from Cloud Storage
 */
async function loadActiveBackground() {
  showCanvasLoading(true);
  try {
    const cacheBuster = Date.now();
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${ACTIVE_BG_NAME}?t=${cacheBuster}`;

    const checkRes = await fetch(publicUrl, { method: 'HEAD' });
    if (!checkRes.ok) {
      throw new Error(`Background belum tersedia (${checkRes.status})`);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = publicUrl;
    });

    state.activeBgImage = img;
    state.activeBgUrl = publicUrl;
    state.activeBgFileName = ACTIVE_BG_NAME;

    if (activeBgThumb) activeBgThumb.src = publicUrl;
    if (activeBgName) {
      activeBgName.textContent = 'active_background.jpg';
      activeBgName.title = publicUrl;
    }

    drawCanvas();
  } catch (err) {
    console.warn('Load active background warning:', err);
    if (activeBgName) activeBgName.textContent = 'Menggunakan Latar Fallback';
    drawCanvas();
  } finally {
    showCanvasLoading(false);
  }
}

/**
 * Handle Upload New Background with Internal Backup and Rotation
 */
async function handleUploadBackground(file) {
  if (!file) return;

  const isImage = file.type ? file.type.startsWith('image/') : /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isImage) {
    alert('Mohon pilih file gambar yang valid (JPG, PNG, WebP).');
    return;
  }

  state.isUploading = true;
  showStatusBanner('Membackup latar lama ke penyimpanan...', 'syncing');

  try {
    // 1. Move active background to backups folder
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const backupDest = `${BACKUP_PREFIX}bg_${timestamp}.jpg`;

    try {
      await fetch(`${SUPABASE_URL}/storage/v1/object/move`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bucketId: BUCKET_NAME,
          sourceKey: ACTIVE_BG_NAME,
          destinationKey: backupDest
        })
      });
    } catch (e) {
      console.warn('Move existing background warning:', e);
    }

    // 2. Upload new file as active_background.jpg
    showStatusBanner('Mengunggah latar baru...', 'syncing');

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${ACTIVE_BG_NAME}`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': file.type || 'image/jpeg',
        'x-upsert': 'true'
      },
      body: file
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Upload gagal: ${errText}`);
    }

    // 3. Prune Old Backups (keep maximum 5 silently)
    try {
      const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET_NAME}`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prefix: BACKUP_PREFIX,
          limit: 50,
          sortBy: { column: 'created_at', order: 'desc' }
        })
      });

      if (listRes.ok) {
        const allBackups = await listRes.json();
        const validBackups = (allBackups || []).filter(item => item.name && item.name.match(/\.(jpe?g|png|webp)$/i));

        if (validBackups.length > MAX_BACKUPS) {
          const filesToDelete = validBackups.slice(MAX_BACKUPS).map(item => `${BACKUP_PREFIX}${item.name}`);
          if (filesToDelete.length > 0) {
            await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}`, {
              method: 'DELETE',
              headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ prefixes: filesToDelete })
            });
          }
        }
      }
    } catch (e) {
      console.warn('Backup rotation note:', e);
    }

    showStatusBanner('Latar baru berhasil diunggah & tersimpan!', 'success');
    await loadActiveBackground();
    setTimeout(hideStatusBanner, 3000);
  } catch (err) {
    console.error('Upload background failed:', err);
    showStatusBanner(`Gagal mengunggah: ${err.message}`, 'error');
  } finally {
    state.isUploading = false;
    if (bgFileInput) bgFileInput.value = '';
  }
}

// Banner helpers
function showStatusBanner(msg, type = 'syncing') {
  uploadStatusBanner.classList.remove('hidden', 'success', 'error');
  if (type === 'success') uploadStatusBanner.classList.add('success');
  if (type === 'error') uploadStatusBanner.classList.add('error');
  uploadStatusText.textContent = msg;
}

function hideStatusBanner() {
  uploadStatusBanner.classList.add('hidden');
}

function showCanvasLoading(show) {
  if (canvasLoadingOverlay) {
    canvasLoadingOverlay.classList.toggle('hidden', !show);
  }
}

/**
 * Text Wrapping Helper for Canvas
 */
function wrapText(context, text, maxWidth) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = context.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

/**
 * Helper: Automatically calculate fitted font size and wrapped lines
 * for Theme text so it scales up or down depending on container space
 */
function fitThemeText(context, text, maxW, maxH, initialFontSize = 44, minFontSize = 22) {
  let fontSize = initialFontSize;
  let bestFit = null;

  while (fontSize >= minFontSize) {
    context.font = `800 ${fontSize}px "Playfair Display", "Cinzel", Georgia, serif`;
    const lineHeight = Math.round(fontSize * 1.25);
    const lines = wrapText(context, text, maxW);
    const textHeight = lines.length * lineHeight;

    const allLinesFit = lines.every(line => context.measureText(line).width <= maxW);

    if (allLinesFit && textHeight <= maxH) {
      bestFit = { fontSize, lines, lineHeight, textHeight };
      break;
    }
    fontSize -= 2;
  }

  if (!bestFit) {
    context.font = `800 ${minFontSize}px "Playfair Display", "Cinzel", Georgia, serif`;
    const lineHeight = Math.round(minFontSize * 1.25);
    const lines = wrapText(context, text, maxW);
    bestFit = { fontSize: minFontSize, lines, lineHeight, textHeight: lines.length * lineHeight };
  }

  return bestFit;
}

/**
 * Draw Canvas Layout (1080 x 1920)
 */
function drawCanvas() {
  const width = canvas.width;   // 1080
  const height = canvas.height; // 1920

  // 1. Draw Solid Base
  ctx.fillStyle = '#0a0503';
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Active Background Image (Cover-Fit)
  if (state.activeBgImage) {
    const img = state.activeBgImage;
    const imgRatio = img.width / img.height;
    const canvasRatio = width / height;

    let drawW, drawH, drawX, drawY;

    if (imgRatio > canvasRatio) {
      drawH = height;
      drawW = height * imgRatio;
      drawX = (width - drawW) / 2;
      drawY = 0;
    } else {
      drawW = width;
      drawH = width / imgRatio;
      drawX = 0;
      drawY = (height - drawH) / 2;
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }

  // 3. Draw Dark Dim & Contrast Overlays
  if (state.dimOverlay > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${state.dimOverlay})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Smooth vertical contrast gradients
  const topGrad = ctx.createLinearGradient(0, 0, 0, 480);
  topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, 480);

  const btmGrad = ctx.createLinearGradient(0, height - 420, 0, height);
  btmGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  btmGrad.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
  ctx.fillStyle = btmGrad;
  ctx.fillRect(0, height - 420, width, 420);

  // -------------------------------------------------------------
  // SECTION 1: HEADER (LOGO + CHURCH TITLE)
  // Montserrat font only & Perfect Vertical Center Alignment
  // -------------------------------------------------------------
  const headerCenterY = 150;
  const logoH = 104;
  const logoW = state.logoImage ? (state.logoImage.width / state.logoImage.height) * logoH : 84;

  ctx.font = '900 34px "Montserrat", sans-serif';
  const gpdiW = ctx.measureText('GPdI').width;
  ctx.font = '900 46px "Montserrat", sans-serif';
  const cotwW = ctx.measureText('COTW').width;
  ctx.font = '700 20px "Montserrat", sans-serif';
  const temanggungW = ctx.measureText('TEMANGGUNG').width + 20;
  const maxTextW = Math.max(gpdiW, cotwW, temanggungW);

  const headerGap = 20;
  const totalHeaderW = logoW + headerGap + maxTextW;
  const logoX = (width - totalHeaderW) / 2;
  const textX = logoX + logoW + headerGap;

  if (state.logoImage) {
    ctx.drawImage(state.logoImage, logoX, headerCenterY - (logoH / 2), logoW, logoH);
  }

  // Draw Header Church Text (Vertically aligned with Logo)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // "GPdI"
  ctx.font = '900 34px "Montserrat", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('GPdI', textX, headerCenterY - 36);

  // "COTW"
  ctx.font = '900 46px "Montserrat", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('COTW', textX, headerCenterY);

  // "TEMANGGUNG" (Uppercase)
  ctx.save();
  ctx.font = '700 20px "Montserrat", sans-serif';
  ctx.fillStyle = '#f1f5f9';
  ctx.letterSpacing = '2px';
  ctx.fillText('TEMANGGUNG', textX, headerCenterY + 35);
  ctx.restore();

  // -------------------------------------------------------------
  // SECTION 2: MAIN HEADING (Ibadah RAYA or Pendalaman ALKITAB)
  // Center Alignment
  // -------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (state.mode === 'raya') {
    // "Ibadah" (Script / Cursive in warm gold)
    ctx.font = '400 135px "Great Vibes", cursive';
    const ibadahGrad = ctx.createLinearGradient(0, 310, 0, 410);
    ibadahGrad.addColorStop(0, '#fef08a');
    ibadahGrad.addColorStop(0.5, '#f59e0b');
    ibadahGrad.addColorStop(1, '#d97706');

    ctx.fillStyle = ibadahGrad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillText('Ibadah', width / 2, 360);

    // "RAYA" (Grand Serif with Golden metallic gradient)
    ctx.font = '900 148px "Cinzel", "Playfair Display", serif';
    const rayaGrad = ctx.createLinearGradient(0, 400, 0, 490);
    rayaGrad.addColorStop(0, '#ffffff');
    rayaGrad.addColorStop(0.25, '#fef3c7');
    rayaGrad.addColorStop(0.55, '#f59e0b');
    rayaGrad.addColorStop(0.85, '#d97706');
    rayaGrad.addColorStop(1, '#92400e');

    ctx.fillStyle = rayaGrad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillText('RAYA', width / 2, 480);
  } else {
    // "Pendalaman" (Script / Cursive in warm gold)
    ctx.font = '400 128px "Great Vibes", cursive';
    const paGrad = ctx.createLinearGradient(0, 310, 0, 410);
    paGrad.addColorStop(0, '#fef08a');
    paGrad.addColorStop(0.5, '#f59e0b');
    paGrad.addColorStop(1, '#d97706');

    ctx.fillStyle = paGrad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillText('Pendalaman', width / 2, 360);

    // "ALKITAB" (Grand Serif with Golden metallic gradient)
    ctx.font = '900 138px "Cinzel", "Playfair Display", serif';
    const alkitabGrad = ctx.createLinearGradient(0, 400, 0, 490);
    alkitabGrad.addColorStop(0, '#ffffff');
    alkitabGrad.addColorStop(0.25, '#fef3c7');
    alkitabGrad.addColorStop(0.55, '#f59e0b');
    alkitabGrad.addColorStop(0.85, '#d97706');
    alkitabGrad.addColorStop(1, '#92400e');

    ctx.fillStyle = alkitabGrad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillText('ALKITAB', width / 2, 480);
  }

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // -------------------------------------------------------------
  // SECTION 3: DATE BADGE (Enlarged Size, with PUKUL 18.00 on PA)
  // -------------------------------------------------------------
  const isPA = state.mode === 'pa';
  const dateBoxY = 535;
  const dateBoxH = isPA ? 82 : 80;
  const dateBoxW = isPA ? 920 : 820;
  const dateBoxX = (width - dateBoxW) / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(20, 10, 5, 0.72)';
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 2.5;

  roundRect(ctx, dateBoxX, dateBoxY, dateBoxW, dateBoxH, 18);
  ctx.fill();
  ctx.stroke();

  // Subtle inner gold line
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, dateBoxX + 4, dateBoxY + 4, dateBoxW - 8, dateBoxH - 8, 14);
  ctx.stroke();
  ctx.restore();

  // Group Calendar Icon and Date Text so they are centered together
  const dateFontSize = isPA ? 36 : 42;
  ctx.save();
  ctx.font = `800 ${dateFontSize}px "Montserrat", sans-serif`;
  const textW = ctx.measureText(state.dateFormatted).width;
  const iconSize = isPA ? 32 : 36;
  const iconGap = 16;
  const combinedW = iconSize + iconGap + textW;

  const groupStartX = (width - combinedW) / 2;
  const iconCenterX = groupStartX + (iconSize / 2);
  const textStartX = groupStartX + iconSize + iconGap;
  const centerY = dateBoxY + (dateBoxH / 2);

  // Draw refined modern calendar icon
  drawCalendarIcon(ctx, iconCenterX, centerY, iconSize);

  // Draw Date Text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(state.dateFormatted, textStartX, centerY);
  ctx.restore();

  // Decorative Golden Ribbon / Brush line below Date Badge
  drawDecorativeLine(ctx, width / 2, dateBoxY + dateBoxH + 24, isPA ? 740 : 680);

  // -------------------------------------------------------------
  // SECTION 4: SERVICES SECTION
  // -------------------------------------------------------------
  if (state.mode === 'raya') {
    drawRayaServices(ctx, width);
  } else {
    drawPAServiceCentered(ctx, width);
  }

  // -------------------------------------------------------------
  // SECTION 5: FOOTER (PATEN INSTAGRAM & YOUTUBE) & SAFE AREA
  // -------------------------------------------------------------
  const footerStartY = 1590;

  drawDecorativeLine(ctx, width / 2, footerStartY - 16, 520);
  drawSocialStackedFooter(ctx, width / 2, footerStartY);
}

/**
 * Draw 3 Services for Ibadah Raya Mode
 */
function drawRayaServices(context, canvasW) {
  const serviceStartY = 660;
  const serviceRowHeight = 280;

  state.services.forEach((service, index) => {
    const rowY = serviceStartY + (index * serviceRowHeight);
    drawServiceRow(context, service, rowY, serviceRowHeight, canvasW);

    if (index < state.services.length - 1) {
      const sepY = rowY + serviceRowHeight - 14;
      drawServiceSeparator(context, sepY, canvasW);
    }
  });
}

/**
 * Draw Single Service Row for Ibadah Raya (Pagi, Siang, Sore)
 * Requirements:
 * - Reduced side whitespace on badge & enlarged text for comfortable reading
 * - No shadow on time badge and live.webp
 * - Vertically centered in container
 */
function drawServiceRow(context, service, rowY, rowHeight, canvasW) {
  const leftColX = 90;
  // Reduced side whitespace & enlarged badge height
  const badgeW = 310;
  const badgeH = 86;

  // Live image sizing - enlarged to match width of time badge above it
  const liveImgAspect = (state.liveImage && state.liveImage.width && state.liveImage.height)
    ? (state.liveImage.width / state.liveImage.height)
    : 4.04;
  const liveW = badgeW; // 310px wide - exact same width as the time badge!
  const liveH = Math.round(liveW / liveImgAspect); // ~77px tall
  const liveGap = 12;

  const totalLeftH = service.live ? (badgeH + liveGap + liveH) : badgeH;
  const leftStartY = rowY + (rowHeight - totalLeftH) / 2;

  // 1. Time Badge (NO SHADOW!)
  context.save();
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.shadowOffsetY = 0;

  const badgeGrad = context.createLinearGradient(leftColX, leftStartY, leftColX + badgeW, leftStartY + badgeH);
  badgeGrad.addColorStop(0, '#f59e0b');
  badgeGrad.addColorStop(0.5, '#fbbf24');
  badgeGrad.addColorStop(1, '#d97706');

  context.fillStyle = badgeGrad;
  roundRect(context, leftColX, leftStartY, badgeW, badgeH, 16);
  context.fill();

  context.textAlign = 'center';
  context.textBaseline = 'middle';

  // Service Name (Enlarged to 32px to reduce side whitespace!)
  context.font = '900 32px "Montserrat", sans-serif';
  context.fillStyle = '#18181b';
  context.fillText(service.name, leftColX + (badgeW / 2), leftStartY + 31);

  // Service Time (Enlarged to 25px!)
  context.font = '800 25px "Montserrat", sans-serif';
  context.fillStyle = '#27272a';
  context.fillText(service.time, leftColX + (badgeW / 2), leftStartY + 64);

  // 2. LIVE STREAMING BADGE (Enlarged to match time badge width!)
  if (service.live) {
    const liveY = leftStartY + badgeH + liveGap;
    const liveX = leftColX + ((badgeW - liveW) / 2);

    if (state.liveImage) {
      context.drawImage(state.liveImage, liveX, liveY, liveW, liveH);
    }
  }
  context.restore();

  // 3. Vertical Divider Line
  const dividerX = leftColX + badgeW + 36;
  context.save();
  const vLineGrad = context.createLinearGradient(0, rowY, 0, rowY + rowHeight);
  vLineGrad.addColorStop(0, 'rgba(245, 158, 11, 0.1)');
  vLineGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.6)');
  vLineGrad.addColorStop(1, 'rgba(245, 158, 11, 0.1)');
  context.strokeStyle = vLineGrad;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(dividerX, rowY + 16);
  context.lineTo(dividerX, rowY + rowHeight - 24);
  context.stroke();
  context.restore();

  // 4. Right Column: Theme & Auto-resizing
  const rightColX = dividerX + 32;
  const maxThemeW = canvasW - rightColX - 60;
  const maxThemeH = rowHeight - 45;

  const themeRaw = (service.theme && service.theme.trim().length > 0 ? service.theme : service.fallbackTheme).toUpperCase();
  const fitted = fitThemeText(context, themeRaw, maxThemeW, maxThemeH, 44, 22);

  const labelH = 26;
  const labelGap = 8;
  const totalThemeBlockH = labelH + labelGap + fitted.textHeight;
  const themeStartY = rowY + (rowHeight - totalThemeBlockH) / 2;

  // "TEMA" Label
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.font = '800 22px "Montserrat", sans-serif';
  context.fillStyle = '#f59e0b';
  context.fillText('TEMA', rightColX, themeStartY);

  // Auto-resized Theme Lines
  context.font = `800 ${fitted.fontSize}px "Playfair Display", "Cinzel", Georgia, serif`;
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(0, 0, 0, 0.9)';
  context.shadowBlur = 10;

  const startLinesY = themeStartY + labelH + labelGap;
  fitted.lines.forEach((line, lineIdx) => {
    context.fillText(line, rightColX, startLinesY + (lineIdx * fitted.lineHeight));
  });

  context.shadowBlur = 0;
}

/**
 * Draw Centered Service for Pendalaman Alkitab Mode
 * Requirements:
 * - Tanggal sudah sertakan jam (RABU, DD MMMM YYYY PUKUL 18.00)
 * - Tata letak: Tema (BESAR), Label Live Streaming (PERBESAR) di tengah
 * - Whitespace samping & atas-bawah dikurangi signifikan
 */
function drawPAServiceCentered(context, canvasW) {
  const service = state.paService;

  // 1. TEMA Section (Centered & SANGAT BESAR!)
  const themeRaw = (service.theme && service.theme.trim().length > 0 ? service.theme : service.fallbackTheme).toUpperCase();
  // Expanded max width to 1000px to minimize side whitespace
  const maxThemeW = 1000;
  const maxThemeH = 580;
  // Starting font size 96px, min 42px
  const fitted = fitThemeText(context, themeRaw, maxThemeW, maxThemeH, 96, 42);

  // Significantly enlarged live streaming badge (height 124px, width ~500px)
  const liveH = 124;
  const liveImgAspect = (state.liveImage && state.liveImage.width && state.liveImage.height)
    ? (state.liveImage.width / state.liveImage.height)
    : 4.04;
  const liveW = Math.round(liveH * liveImgAspect);

  // Calculate vertical center positioning for the entire block
  const labelH = 50;
  const labelGap = 20;
  const themeLinesH = fitted.textHeight;
  const gapToLive = 50;
  const totalBlockH = labelH + labelGap + themeLinesH + (service.live ? (gapToLive + liveH) : 0);

  // Position block higher up to leave generous space below the live streaming badge
  // for placing an Instagram Story URL / link sticker!
  const blockStartY = 720;

  // Draw "TEMA" Label (Enlarged to 42px with elegant letter spacing)
  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.font = '900 42px "Montserrat", sans-serif';
  context.fillStyle = '#f59e0b';
  context.letterSpacing = '6px';
  context.shadowColor = 'rgba(245, 158, 11, 0.5)';
  context.shadowBlur = 12;
  context.fillText('TEMA', canvasW / 2, blockStartY);
  context.restore();

  // Draw Theme Lines (BESAR, Megah & Padat)
  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.font = `800 ${fitted.fontSize}px "Playfair Display", "Cinzel", Georgia, serif`;
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(0, 0, 0, 0.95)';
  context.shadowBlur = 20;

  const startLinesY = blockStartY + labelH + labelGap;
  fitted.lines.forEach((line, lineIdx) => {
    context.fillText(line, canvasW / 2, startLinesY + (lineIdx * fitted.lineHeight));
  });
  context.restore();

  // Draw Live Streaming Label (BESAR, Centered below Theme)
  if (service.live && state.liveImage) {
    const liveY = startLinesY + themeLinesH + gapToLive;
    const liveX = (canvasW - liveW) / 2;

    context.save();
    context.shadowBlur = 0;
    context.drawImage(state.liveImage, liveX, liveY, liveW, liveH);
    context.restore();
  }
}

/**
 * Draw Horizontal Service Separator
 */
function drawServiceSeparator(context, y, canvasW) {
  context.save();
  const grad = context.createLinearGradient(120, 0, canvasW - 120, 0);
  grad.addColorStop(0, 'rgba(245, 158, 11, 0)');
  grad.addColorStop(0.3, 'rgba(245, 158, 11, 0.45)');
  grad.addColorStop(0.5, 'rgba(254, 240, 138, 0.85)');
  grad.addColorStop(0.7, 'rgba(245, 158, 11, 0.45)');
  grad.addColorStop(1, 'rgba(245, 158, 11, 0)');

  context.strokeStyle = grad;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(120, y);
  context.lineTo(canvasW - 120, y);
  context.stroke();

  // Small glowing diamond in center
  context.fillStyle = '#fef08a';
  context.shadowColor = 'rgba(245, 158, 11, 0.8)';
  context.shadowBlur = 8;
  context.beginPath();
  context.moveTo(canvasW / 2, y - 5);
  context.lineTo(canvasW / 2 + 5, y);
  context.lineTo(canvasW / 2, y + 5);
  context.lineTo(canvasW / 2 - 5, y);
  context.closePath();
  context.fill();

  context.restore();
}

/**
 * Draw Decorative Thin Line with Center Sparkle
 */
function drawDecorativeLine(context, centerX, y, length) {
  context.save();
  const half = length / 2;
  const grad = context.createLinearGradient(centerX - half, 0, centerX + half, 0);
  grad.addColorStop(0, 'rgba(245, 158, 11, 0)');
  grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.6)');
  grad.addColorStop(1, 'rgba(245, 158, 11, 0)');

  context.strokeStyle = grad;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(centerX - half, y);
  context.lineTo(centerX + half, y);
  context.stroke();
  context.restore();
}

/**
 * Draw Calendar Outline Icon Glyph
 */
function drawCalendarIcon(context, x, y, size) {
  context.save();
  context.strokeStyle = '#f59e0b';
  context.fillStyle = '#f59e0b';
  context.lineWidth = 2.4;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const w = size;
  const h = size * 0.94;
  const startX = Math.round(x - (w / 2));
  const startY = Math.round(y - (h / 2));

  // 1. Calendar Body Box
  roundRect(context, startX, startY, w, h, 6);
  context.stroke();

  // 2. Top Header Bar (Solid Gold Accent)
  context.save();
  context.beginPath();
  roundRect(context, startX, startY, w, h, 6);
  context.clip();
  context.fillRect(startX, startY, w, Math.round(h * 0.3));
  context.restore();

  // 3. Top Binder Rings (Rounded Hanging Tabs)
  const ringW = 4;
  const ringH = 8;
  const ring1X = Math.round(startX + (w * 0.28));
  const ring2X = Math.round(startX + (w * 0.72));
  roundRect(context, ring1X - (ringW / 2), startY - 4, ringW, ringH, 2);
  roundRect(context, ring2X - (ringW / 2), startY - 4, ringW, ringH, 2);
  context.fill();

  // 4. Date Dots Matrix (2 rows x 3 columns)
  const dotRadius = 1.8;
  const gridW = w - 16;
  const colStep = gridW / 2;
  const gridStartY = startY + (h * 0.52);
  const rowStep = h * 0.22;

  context.beginPath();
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const dotX = startX + 8 + (col * colStep);
      const dotY = gridStartY + (row * rowStep);
      context.moveTo(dotX + dotRadius, dotY);
      context.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    }
  }
  context.fill();

  context.restore();
}

/**
 * Draw Paten Stacked Social Media Footer:
 * Line 1: (icon) instagram  @gpdicotw_temanggung
 * Line 2: (icon) youtube    GPdI COTW Temanggung
 * Followed by Keep Safe Area (>200px at bottom)
 */
function drawSocialStackedFooter(context, centerX, startY) {
  context.save();
  context.font = '700 28px "Montserrat", sans-serif';
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(0, 0, 0, 0.9)';
  context.shadowBlur = 8;

  const igText = state.igHandle;
  const ytText = state.ytChannel;

  // --- LINE 1: INSTAGRAM ---
  const line1Y = startY + 24;
  const igIconSize = 34;
  const igTextW = context.measureText(igText).width;
  const line1TotalW = igIconSize + 14 + igTextW;
  const line1StartX = centerX - (line1TotalW / 2);

  // Instagram Icon
  const igX = line1StartX;
  const igY = line1Y - (igIconSize / 2);
  const igGrad = context.createLinearGradient(igX, igY + igIconSize, igX + igIconSize, igY);
  igGrad.addColorStop(0, '#f58529');
  igGrad.addColorStop(0.5, '#dd2a7b');
  igGrad.addColorStop(1, '#8134af');

  context.fillStyle = igGrad;
  roundRect(context, igX, igY, igIconSize, igIconSize, 9);
  context.fill();

  context.strokeStyle = '#ffffff';
  context.lineWidth = 2.2;
  roundRect(context, igX + 4.5, igY + 4.5, igIconSize - 9, igIconSize - 9, 6);
  context.stroke();

  context.beginPath();
  context.arc(igX + (igIconSize / 2), igY + (igIconSize / 2), 5.5, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(igX + igIconSize - 8.5, igY + 8.5, 1.6, 0, Math.PI * 2);
  context.fill();

  // Instagram Text
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = '#f8fafc';
  context.fillText(igText, igX + igIconSize + 14, line1Y);

  // --- LINE 2: YOUTUBE ---
  const line2Y = line1Y + 48;
  const ytW = 42;
  const ytH = 30;
  const ytTextW = context.measureText(ytText).width;
  const line2TotalW = ytW + 14 + ytTextW;
  const line2StartX = centerX - (line2TotalW / 2);

  const ytX = line2StartX;
  const ytY = line2Y - (ytH / 2);

  // YouTube Red Icon Box
  context.fillStyle = '#ff0000';
  roundRect(context, ytX, ytY, ytW, ytH, 8);
  context.fill();

  // White play triangle inside
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.moveTo(ytX + 15, ytY + 7.5);
  context.lineTo(ytX + 29, ytY + 15);
  context.lineTo(ytX + 15, ytY + 22.5);
  context.closePath();
  context.fill();

  // YouTube Text
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = '#f8fafc';
  context.fillText(ytText, ytX + ytW + 14, line2Y);

  context.restore();
}

/**
 * Canvas Helper: Rounded Rectangle
 */
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Download High-Res PNG
 */
function downloadPoster() {
  const modePrefix = state.mode === 'raya' ? 'Jadwal-Ibadah-Raya' : 'Jadwal-Pendalaman-Alkitab';
  const fileName = `${modePrefix}-COTW-${state.dateObj.toISOString().slice(0, 10)}.png`;

  if (canvas.toBlob) {
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Gagal menghasilkan file gambar.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  } else {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Set Application Mode (Raya or PA)
 */
function setAppMode(newMode) {
  state.mode = newMode;

  modeRayaBtn.classList.toggle('active', newMode === 'raya');
  modePABtn.classList.toggle('active', newMode === 'pa');

  cardServicesRaya.classList.toggle('hidden', newMode !== 'raya');
  cardServicesPA.classList.toggle('hidden', newMode !== 'pa');

  if (newMode === 'raya') {
    quickJumpBtnText.textContent = 'Minggu Terdekat';
    const nearestSun = getNearestSunday();
    state.dateObj = nearestSun;
    state.dateFormatted = formatIndonesianDate(nearestSun, 'raya');
    dateDisplayText.value = state.dateFormatted;
    nativeDateInput.value = nearestSun.toISOString().slice(0, 10);
  } else {
    quickJumpBtnText.textContent = 'Rabu Terdekat';
    const nearestWed = getNearestWednesday();
    state.dateObj = nearestWed;
    state.dateFormatted = formatIndonesianDate(nearestWed, 'pa');
    dateDisplayText.value = state.dateFormatted;
    nativeDateInput.value = nearestWed.toISOString().slice(0, 10);
  }

  drawCanvas();
}

/**
 * Bind UI Events
 */
function bindEvents() {
  // Mode Tabs
  modeRayaBtn.addEventListener('click', () => setAppMode('raya'));
  modePABtn.addEventListener('click', () => setAppMode('pa'));

  // Date Sync
  nativeDateInput.addEventListener('change', (e) => {
    if (e.target.value) {
      const selected = new Date(e.target.value + 'T00:00:00');
      state.dateObj = selected;
      state.dateFormatted = formatIndonesianDate(selected, state.mode);
      dateDisplayText.value = state.dateFormatted;
      drawCanvas();
    }
  });

  triggerDateBtn.addEventListener('click', () => {
    if (nativeDateInput.showPicker) {
      nativeDateInput.showPicker();
    } else {
      nativeDateInput.focus();
    }
  });

  dateDisplayText.addEventListener('click', () => {
    if (nativeDateInput.showPicker) {
      nativeDateInput.showPicker();
    }
  });

  btnNextSunday.addEventListener('click', () => {
    if (state.mode === 'raya') {
      const targetDay = getNearestSunday();
      state.dateObj = targetDay;
      state.dateFormatted = formatIndonesianDate(targetDay, 'raya');
      dateDisplayText.value = state.dateFormatted;
      nativeDateInput.value = targetDay.toISOString().slice(0, 10);
    } else {
      const targetDay = getNearestWednesday();
      state.dateObj = targetDay;
      state.dateFormatted = formatIndonesianDate(targetDay, 'pa');
      dateDisplayText.value = state.dateFormatted;
      nativeDateInput.value = targetDay.toISOString().slice(0, 10);
    }
    drawCanvas();
  });

  // Raya Themes
  themeInput1.addEventListener('input', (e) => {
    state.services[0].theme = e.target.value;
    drawCanvas();
  });

  themeInput2.addEventListener('input', (e) => {
    state.services[1].theme = e.target.value;
    drawCanvas();
  });

  themeInput3.addEventListener('input', (e) => {
    state.services[2].theme = e.target.value;
    drawCanvas();
  });

  // Raya Live Stream Toggles
  streamToggle1.addEventListener('change', (e) => {
    state.services[0].live = e.target.checked;
    drawCanvas();
  });

  streamToggle2.addEventListener('change', (e) => {
    state.services[1].live = e.target.checked;
    drawCanvas();
  });

  streamToggle3.addEventListener('change', (e) => {
    state.services[2].live = e.target.checked;
    drawCanvas();
  });

  // PA Theme & Toggle
  themeInputPA.addEventListener('input', (e) => {
    state.paService.theme = e.target.value;
    drawCanvas();
  });

  streamTogglePA.addEventListener('change', (e) => {
    state.paService.live = e.target.checked;
    drawCanvas();
  });

  // Overlay Dim
  dimOverlayInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.dimOverlay = val;
    dimVal.textContent = `${Math.round(val * 100)}%`;
    drawCanvas();
  });

  // Upload Background
  uploadBgBtn.addEventListener('click', () => {
    bgFileInput.click();
  });

  bgFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleUploadBackground(file);
  });

  refreshStorageBtn.addEventListener('click', () => {
    loadActiveBackground();
  });

  // Download
  downloadBtn.addEventListener('click', downloadPoster);

  // Copy Streaming URL for PA (Direct button copy)
  if (copyStreamUrlBtnPA) {
    copyStreamUrlBtnPA.addEventListener('click', async () => {
      const url = 'https://www.youtube.com/@GPdICOTWTemanggung/live';
      const markSuccess = () => {
        const prevHtml = copyStreamUrlBtnPA.innerHTML;
        copyStreamUrlBtnPA.innerHTML = '<i class="fa-solid fa-check"></i> URL Tersalin!';
        copyStreamUrlBtnPA.classList.add('btn-success');
        setTimeout(() => {
          copyStreamUrlBtnPA.innerHTML = prevHtml;
          copyStreamUrlBtnPA.classList.remove('btn-success');
        }, 2200);
      };

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          markSuccess();
        } else {
          throw new Error('Clipboard API unavailable');
        }
      } catch (err) {
        // Fallback for browsers / iOS where clipboard API might be restricted
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = url;
        tempTextarea.style.position = 'fixed';
        tempTextarea.style.left = '-9999px';
        tempTextarea.setAttribute('readonly', '');
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        try {
          document.execCommand('copy');
          markSuccess();
        } catch (copyErr) {
          alert('URL Streaming: ' + url);
        }
        document.body.removeChild(tempTextarea);
      }
    });
  }
}

/**
 * Initialize Application
 */
async function initApp() {
  // Set default initial date to nearest Sunday
  const nearestSun = getNearestSunday();
  state.dateObj = nearestSun;
  state.dateFormatted = formatIndonesianDate(nearestSun, 'raya');
  dateDisplayText.value = state.dateFormatted;
  nativeDateInput.value = nearestSun.toISOString().slice(0, 10);

  // Set default themes in inputs (left empty so placeholder displays)
  themeInput1.value = state.services[0].theme;
  themeInput2.value = state.services[1].theme;
  themeInput3.value = state.services[2].theme;
  streamToggle1.checked = state.services[0].live;
  streamToggle2.checked = state.services[1].live;
  streamToggle3.checked = state.services[2].live;

  themeInputPA.value = state.paService.theme;
  streamTogglePA.checked = state.paService.live;

  bindEvents();

  // Load assets & backgrounds
  await preloadLocalAssets();
  await loadActiveBackground();

  // Ensure fonts loaded before initial render
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      drawCanvas();
    });
  } else {
    drawCanvas();
  }
}

// Start
document.addEventListener('DOMContentLoaded', initApp);
