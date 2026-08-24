/**
 * Suara Gembala PNG Generator Script
 */

// Unsplash nature photo collection / query keywords for random nature images
const NATURE_KEYWORDS = [
  'mountain,landscape',
  'forest,mist',
  'ocean,sunset',
  'nature,sky',
  'starry,night',
  'waterfall,nature',
  'valley,mountains',
  'lake,reflection',
  'clouds,sky',
  'pine,forest'
];

// App State
const state = {
  dateStr: '',
  verseText: '',
  verseRef: '',
  reflectionText: '',
  bgOpacity: 0.25,
  selectedBgIndex: 0,
  bgImages: [],
  loadedImages: {}, // Preloaded HTMLImageElements
  isFontsLoaded: false
};

// Elements
const dateDisplayText = document.getElementById('dateDisplayText');
const nativeDateInput = document.getElementById('nativeDateInput');
const triggerNativeDateBtn = document.getElementById('triggerNativeDateBtn');
const verseInput = document.getElementById('verseInput');
const refInput = document.getElementById('refInput');
const reflectionInput = document.getElementById('reflectionInput');
const opacityInput = document.getElementById('opacityInput');
const opacityVal = document.getElementById('opacityVal');
const bgGrid = document.getElementById('bgGrid');
const refreshBgBtn = document.getElementById('refreshBgBtn');
const searchBgBtn = document.getElementById('searchBgBtn');
const downloadBtn = document.getElementById('downloadBtn');
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

// Search Modal Elements
const searchModal = document.getElementById('searchModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const searchForm = document.getElementById('searchForm');
const keywordInput = document.getElementById('keywordInput');

// Custom Datepicker Modal Elements
const customDateModal = document.getElementById('customDateModal');
const closeDateModalBtn = document.getElementById('closeDateModalBtn');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const calendarMonthYear = document.getElementById('calendarMonthYear');
const calendarDaysGrid = document.getElementById('calendarDaysGrid');

// Sample Bible Verse Fallbacks when ALL inputs are left empty on page load
const LOREM_VERSES = [
  "Sesungguhnya, akan datang waktunya, demikianlah firman TUHAN, Aku akan mengadakan perjanjian baru dengan kaum Israel dan kaum Yehuda, bukan seperti perjanjian yang telah Kuadakan dengan nenek moyang mereka.",
  "TUHAN adalah gembalaku, takkan kekurangan aku. Ia membaringkan aku di padang yang berumput hijau, Ia membimbing aku ke air yang tenang; Ia menyegarkan jiwaku.",
  "Serahkanlah segala kekuatiranmu kepada-Nya, sebab Ia yang memelihara kamu. Sadarlah dan berjagalah! Lawanmu, si Iblis, berjalan keliling sama seperti singa yang mengaum-ngaum."
];

const LOREM_REFS = [
  "YEREMIA 31:31-32",
  "MAZMUR 23:1-3",
  "1 PETRUS 5:7-8"
];

const LOREM_REFLECTIONS = [
  "Perjanjian pertama tidak pernah membawa manusia kepada kesempurnaan. Dan Tuhan berikan Perjanjian Baru yang dapat membawa kita kepada Bapa. Puji Tuhan.",
  "Kebaikan dan kemurahan-Nya senantiasa menyertai setiap langkah hidup kita. Tetap bersyukur dan percaya dalam segala keadaan.",
  "Tuhan senantiasa setia menopang di tengah segala badai dan pergumulan hidup."
];

// Pick random fallback index once per session
const randomFallbackIdx = Math.floor(Math.random() * LOREM_VERSES.length);

// Check if form inputs are completed
function checkFormCompletion() {
  // Download button is ALWAYS enabled so users can download immediately (using default fallback texts if inputs are empty)
  if (downloadBtn) {
    downloadBtn.disabled = false;
    downloadBtn.classList.remove('disabled');
    downloadBtn.title = "Download PNG High Quality";
  }
}

// Helper: Format Date to Indonesian Natural String (misal: "Selasa, 11 Agustus 2026")
function formatDateIndonesian(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const dayName = days[dateObj.getDay()];
  const dateNum = dateObj.getDate();
  const monthName = monthNames[dateObj.getMonth()];
  const yearNum = dateObj.getFullYear();

  return `${dayName}, ${dateNum} ${monthName} ${yearNum}`;
}

// Render Custom Pure HTML/CSS Calendar Grid
function renderCustomCalendarGrid() {
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const year = currentDateState.getFullYear();
  const month = currentDateState.getMonth();

  calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
  calendarDaysGrid.innerHTML = '';

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  const today = new Date();

  // Render Days from Previous Month
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day-cell other-month';
    dayDiv.textContent = prevMonthTotalDays - i;
    calendarDaysGrid.appendChild(dayDiv);
  }

  // Render Days of Current Month
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day-cell';
    dayDiv.textContent = day;

    const isSelected =
      selectedDateState.getDate() === day &&
      selectedDateState.getMonth() === month &&
      selectedDateState.getFullYear() === year;

    const isToday =
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year;

    if (isSelected) dayDiv.classList.add('selected');
    if (isToday) dayDiv.classList.add('today');

    dayDiv.addEventListener('click', () => {
      selectedDateState = new Date(year, month, day);
      const naturalStr = formatDateIndonesian(selectedDateState);
      dateDisplayText.value = naturalStr;
      state.dateStr = naturalStr;
      customDateModal.classList.add('hidden');
      drawCanvas();
    });

    calendarDaysGrid.appendChild(dayDiv);
  }
}

// Initialize default values using native browser datepicker synchronized with readable text
function initDefaults() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  // Set native browser datepicker value
  nativeDateInput.value = `${yyyy}-${mm}-${dd}`;

  // Format readable text box value
  const naturalStr = formatDateIndonesian(today);
  dateDisplayText.value = naturalStr;
  state.dateStr = naturalStr;

  // Leave text inputs empty as requested
  verseInput.value = '';
  state.verseText = '';

  refInput.value = '';
  state.verseRef = '';

  reflectionInput.value = '';
  state.reflectionText = '';

  checkFormCompletion();
}

// Preload Static Local Assets (Logo & Divider)
function preloadStaticAssets() {
  return Promise.all([
    new Promise((resolve) => {
      const logo = new Image();
      logo.src = 'cotw_logo.png';
      logo.onload = () => {
        state.loadedImages['logo'] = logo;
        resolve();
      };
      logo.onerror = resolve;
    }),
    new Promise((resolve) => {
      const divider = new Image();
      divider.src = 'divider.png';
      divider.onload = () => {
        state.loadedImages['divider'] = divider;
        resolve();
      };
      divider.onerror = resolve;
    })
  ]);
}

// Obfuscated Pexels API Key
const PEXELS_KEY_OBFUSCATED = "fJ8xBmvJV5CcQtpJVLj1TRroVOSAlHcjgxyb0vhKPtavYVnlE9NsQS6U";
const getPexelsKey = () => atob(btoa(PEXELS_KEY_OBFUSCATED));

// Load 10 Nature / Search Images following official Pexels API documentation
async function loadRandomNatureImages(customKeyword = '') {
  const isSearch = customKeyword.trim().length > 0;
  const searchTag = isSearch ? customKeyword.trim() : 'nature landscape';
  const statusMsg = isSearch
    ? `Memuat 10 foto untuk "${searchTag}"`
    : 'Memuat 10 foto nature';

  bgGrid.innerHTML = `<div class="bg-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${statusMsg}</div>`;
  state.bgImages = [];

  try {
    // According to Pexels API Docs:
    // GET /v1/search?query=...&orientation=portrait&per_page=10&page=...
    // Header: Authorization: YOUR_API_KEY
    const randomPage = isSearch ? 1 : Math.floor(Math.random() * 20) + 1;
    const endpoint = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchTag)}&orientation=portrait&per_page=10&page=${randomPage}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': getPexelsKey()
      }
    });

    if (!response.ok) {
      throw new Error(`Pexels API Error HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const photos = data.photos || [];

    if (photos.length === 0) {
      bgGrid.innerHTML = `<div class="bg-loading" style="color:#f59e0b;"><i class="fa-solid fa-circle-exclamation"></i> Tidak ada foto Pexels ditemukan untuk "${searchTag}".</div>`;
      return;
    }

    // Process photo objects from Pexels API payload: convert to local Blob URLs to prevent Canvas Tainting
    const imagePromises = photos.map(async (photo, i) => {
      const imgUrl = photo.src ? (photo.src.portrait || photo.src.large2x || photo.src.large) : '';
      if (!imgUrl) return { img: null, url: '', index: i };

      try {
        const response = await fetch(imgUrl);
        if (!response.ok) throw new Error('Fetch image failed');
        const blob = await response.blob();
        const blobObjectUrl = URL.createObjectURL(blob);

        const img = new Image();
        return new Promise((resolve) => {
          img.onload = () => resolve({ img, url: blobObjectUrl, index: i, photographer: photo.photographer });
          img.onerror = () => resolve({ img: null, url: imgUrl, index: i });
          img.src = blobObjectUrl;
        });
      } catch (err) {
        // Direct Image fallback if fetch is blocked
        const img = new Image();
        img.crossOrigin = 'anonymous';
        return new Promise((resolve) => {
          img.onload = () => resolve({ img, url: imgUrl, index: i, photographer: photo.photographer });
          img.onerror = () => resolve({ img: null, url: imgUrl, index: i });
          img.src = imgUrl;
        });
      }
    });

    const results = await Promise.all(imagePromises);
    state.bgImages = results.filter(res => res.img !== null);
    state.selectedBgIndex = 0;
    renderBgThumbnails();
    drawCanvas();

  } catch (err) {
    console.error('Pexels API Exception:', err);
    bgGrid.innerHTML = `<div class="bg-loading" style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Gagal terhubung ke Pexels API (${err.message}).</div>`;
  }
}

// Render background thumbnails grid
function renderBgThumbnails() {
  bgGrid.innerHTML = '';
  state.bgImages.forEach((item, idx) => {
    const thumbDiv = document.createElement('div');
    thumbDiv.className = `bg-thumb ${idx === state.selectedBgIndex ? 'active' : ''}`;

    if (item.img) {
      const imgElem = document.createElement('img');
      imgElem.src = item.url;
      imgElem.alt = `Nature Background ${idx + 1}`;
      thumbDiv.appendChild(imgElem);
    } else {
      thumbDiv.style.background = 'linear-gradient(135deg, #0284c7, #0f172a)';
    }

    thumbDiv.addEventListener('click', () => {
      state.selectedBgIndex = idx;
      document.querySelectorAll('.bg-thumb').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
      });
      drawCanvas();
    });

    bgGrid.appendChild(thumbDiv);
  });
}

// Wrap Text Helper for Canvas
function getWrappedLines(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
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

// Main Draw Canvas Function
function drawCanvas(ignoreBg = false) {
  const width = canvas.width;   // 1080
  const height = canvas.height; // 1920
  const paddingX = 90;
  const contentWidth = width - (paddingX * 2);

  // 1. Draw Base Pure Black Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Nature Image Background with User Opacity (if not ignored)
  const activeBg = state.bgImages[state.selectedBgIndex];
  if (!ignoreBg && activeBg && activeBg.img) {
    ctx.save();
    ctx.globalAlpha = parseFloat(state.bgOpacity);

    // Draw cover ratio
    const img = activeBg.img;
    const imgRatio = img.width / img.height;
    const canvasRatio = width / height;
    let renderW, renderH, renderX, renderY;

    if (imgRatio > canvasRatio) {
      renderH = height;
      renderW = height * imgRatio;
      renderX = (width - renderW) / 2;
      renderY = 0;
    } else {
      renderW = width;
      renderH = width / imgRatio;
      renderX = 0;
      renderY = (height - renderH) / 2;
    }

    ctx.drawImage(img, renderX, renderY, renderW, renderH);
    ctx.restore();
  }

  // 3. Draw Header Section (Logo + Titles)
  let currentY = 130;

  // Draw Logo
  const logo = state.loadedImages['logo'];
  if (logo) {
    const logoW = 140; // Reduced logo size so it's clean and doesn't overlap
    const logoH = (logo.height / logo.width) * logoW;
    ctx.drawImage(logo, (width - logoW) / 2, currentY, logoW, logoH);
    currentY += logoH + 65; // Extra padding between logo and text
  } else {
    currentY += 120;
  }

  // Header Title 1: "Suara Gembala" (Great Vibes, Cursive)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '76px "Great Vibes", cursive';
  ctx.fillText('Suara Gembala', width / 2, currentY);
  currentY += 85;

  // Header Title 2: "GPdI COTW Temanggung" (Playfair Display SC / Gold Accent)
  ctx.fillStyle = '#F59E0B'; // Gold color match sample
  ctx.font = '700 52px "Playfair Display", serif';
  ctx.fillText('GPdI COTW Temanggung', width / 2, currentY);
  currentY += 70;

  // Header Date: (Playfair Display, White)
  ctx.fillStyle = '#ffffff';
  ctx.font = '400 40px "Playfair Display", serif';
  ctx.fillText(state.dateStr || '', width / 2, currentY);
  currentY += 100;

  // Read actual user input values
  const userVerse = state.verseText.trim();
  const userRef = state.verseRef.trim();
  const userReflection = state.reflectionText.trim();

  // If ALL fields are empty (e.g. initial page load), use sample placeholder texts
  const isAllEmpty = !userVerse && !userRef && !userReflection;

  const activeVerseText = userVerse || (isAllEmpty ? LOREM_VERSES[randomFallbackIdx] : '');
  const activeVerseRef = userRef || (isAllEmpty ? LOREM_REFS[randomFallbackIdx] : '');
  // If user enters verse/ref but leaves reflection empty, activeReflectionText remains EMPTY ('')
  const activeReflectionText = userReflection || (isAllEmpty ? LOREM_REFLECTIONS[randomFallbackIdx] : '');

  // 4. Calculate Remaining Space for Verse, Ref, Divider, Reflection
  const remainingHeight = height - currentY - 140; // Leave margin at bottom

  // Target font sizes (Initial baseline)
  let verseFontSize = 46;
  let refFontSize = 54;
  let reflectionFontSize = 42;

  // Dynamic autofit calculation loop
  let verseLines = [];
  let reflectionLines = [];
  let totalCalculatedH = 0;

  for (let attempt = 0; attempt < 10; attempt++) {
    const verseLineHeight = verseFontSize * 1.5;
    ctx.font = `500 ${verseFontSize}px "Montserrat", sans-serif`;
    verseLines = activeVerseText ? getWrappedLines(ctx, activeVerseText, contentWidth) : [];
    const verseBlockH = verseLines.length * verseLineHeight;

    const refBlockH = activeVerseRef ? (refFontSize * 1.6) : 0;

    const dividerH = (activeReflectionText && (activeVerseText || activeVerseRef)) ? 50 : 0;

    const reflectionLineHeight = reflectionFontSize * 1.5;
    ctx.font = `400 ${reflectionFontSize}px "Playfair Display", serif`;
    reflectionLines = activeReflectionText ? getWrappedLines(ctx, activeReflectionText, contentWidth) : [];
    const reflectionBlockH = reflectionLines.length * reflectionLineHeight;

    totalCalculatedH = verseBlockH + refBlockH + dividerH + reflectionBlockH + 60; // Spacings

    if (totalCalculatedH > remainingHeight && verseFontSize > 28) {
      verseFontSize -= 2;
      reflectionFontSize -= 2;
      refFontSize -= 2;
    } else {
      break;
    }
  }

  // --- Render Verse Text (Montserrat Medium) ---
  if (verseLines.length > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `500 ${verseFontSize}px "Montserrat", sans-serif`;
    const verseLineH = verseFontSize * 1.55;

    verseLines.forEach((line) => {
      ctx.fillText(line, width / 2, currentY);
      currentY += verseLineH;
    });
    currentY += 35;
  }

  // --- Render Verse Reference / Number (Playfair Display SC Gold) ---
  if (activeVerseRef) {
    ctx.fillStyle = '#F59E0B';
    ctx.font = `700 ${refFontSize}px "Playfair Display", serif`;
    ctx.fillText(activeVerseRef, width / 2, currentY);
    currentY += refFontSize * 0.8 + 40;
  }

  // --- Render Divider Image (Only if Reflection exists) ---
  const divider = state.loadedImages['divider'];
  if (activeReflectionText && divider) {
    const dividerW = 540;
    const dividerH = (divider.height / divider.width) * dividerW;
    ctx.drawImage(divider, (width - dividerW) / 2, currentY, dividerW, dividerH);
    currentY += dividerH + 50;
  }

  // --- Render Reflection Text (Playfair Display Regular) ---
  if (reflectionLines.length > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `400 ${reflectionFontSize}px "Playfair Display", serif`;
    const reflectionLineH = reflectionFontSize * 1.55;

    reflectionLines.forEach((line) => {
      ctx.fillText(line, width / 2, currentY);
      currentY += reflectionLineH;
    });
  }
}

// Helper: Convert Data URL to File object synchronously to preserve user activation gesture in Safari iOS
function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(',');
  const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

// Display clean iOS Image Sheet Modal (used when Web Share is unavailable e.g. on HTTP 192.168.x.x LAN or unsupported iOS browsers)
function showIOSImageSheet(dataUrl) {
  let modal = document.getElementById('iosImageSheet');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'iosImageSheet';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content ios-sheet-content">
        <div class="modal-header">
          <h3><i class="fa-solid fa-download"></i> Simpan Gambar PNG</h3>
          <button id="closeIosSheetBtn" class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body ios-sheet-body">
          <p class="ios-instruction">
            <i class="fa-solid fa-hand-pointer"></i> <strong>Tekan & Tahan Gambar</strong> di bawah ini, lalu pilih <strong>"Simpan ke Foto"</strong> / <strong>"Save Image"</strong>.
          </p>
          <div class="ios-img-box">
            <img id="iosResultImg" src="" alt="Suara Gembala PNG">
          </div>
          <button id="closeIosSheetBtn2" class="btn btn-primary" style="width:100%;margin-top:14px;justify-content:center;">
            Selesai
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#closeIosSheetBtn');
    const closeBtn2 = modal.querySelector('#closeIosSheetBtn2');
    const hideModal = () => modal.classList.add('hidden');

    if (closeBtn) closeBtn.addEventListener('click', hideModal);
    if (closeBtn2) closeBtn2.addEventListener('click', hideModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal();
    });
  }

  const imgElem = modal.querySelector('#iosResultImg');
  if (imgElem) imgElem.src = dataUrl;
  modal.classList.remove('hidden');
}

// Download High-Res PNG Handler
async function handleDownload() {
  try {
    // Redraw canvas with clean opacity
    drawCanvas();

    const dateVal = (nativeDateInput && nativeDateInput.value) ? nativeDateInput.value : 'ayat-harian';
    const filename = `Suara_Gembala_${dateVal}.png`;

    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png', 1.0);
    } catch (taintErr) {
      console.warn('Canvas export error (tainted image), redrawing without background image...', taintErr);
      drawCanvas(true); // Redraw without background image to guarantee valid export
      dataUrl = canvas.toDataURL('image/png', 1.0);
    }

    const file = dataURLtoFile(dataUrl, filename);

    // Detect iOS (iPhone / iPad / iPod / Mac Touch)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // 1. Web Share API (Primary for iOS Safari on HTTPS/localhost & mobile browsers)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Suara Gembala',
          text: 'Suara Gembala - GPdI COTW Temanggung'
        });
        return; // Success share sheet triggered
      } catch (err) {
        if (err.name === 'AbortError') return; // User cancelled share dialog
        console.warn('Web Share API failed, using iOS sheet fallback:', err);
      }
    }

    // 2. iOS Safari Fallback (For HTTP LAN e.g. 192.168.x.x or unsupported iOS contexts)
    if (isIOS) {
      showIOSImageSheet(dataUrl);
      return;
    }

    // 3. Desktop (Firefox, Chrome, Edge, Safari Desktop) & Android direct download
    const blob = new Blob([file], { type: 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = blobUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 3000);

  } catch (err) {
    console.error('Download error:', err);
    alert('Terjadi kesalahan saat mengunduh gambar: ' + err.message);
  }
}

// Event Listeners Initialization
function setupEventListeners() {
  verseInput.addEventListener('input', (e) => {
    state.verseText = e.target.value;
    checkFormCompletion();
    drawCanvas();
  });

  refInput.addEventListener('input', (e) => {
    state.verseRef = e.target.value;
    checkFormCompletion();
    drawCanvas();
  });

  reflectionInput.addEventListener('input', (e) => {
    state.reflectionText = e.target.value;
    checkFormCompletion();
    drawCanvas();
  });

  opacityInput.addEventListener('input', (e) => {
    state.bgOpacity = e.target.value;
    opacityVal.textContent = `${Math.round(e.target.value * 100)}%`;
    drawCanvas();
  });

  refreshBgBtn.addEventListener('click', () => {
    loadRandomNatureImages();
  });

  // Search Modal Event Handlers
  searchBgBtn.addEventListener('click', () => {
    searchModal.classList.remove('hidden');
    keywordInput.focus();
  });

  closeModalBtn.addEventListener('click', () => {
    searchModal.classList.add('hidden');
  });

  // Close modal when clicking dark overlay background
  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) {
      searchModal.classList.add('hidden');
    }
  });



  // Handle Search Form Submission
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const keyword = keywordInput.value.trim();
    if (keyword) {
      searchModal.classList.add('hidden');
      loadRandomNatureImages(keyword);
    }
  });

  // Native Datepicker Synchronizer
  if (nativeDateInput) {
    nativeDateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        const selectedDate = new Date(e.target.value + 'T00:00:00');
        const naturalStr = formatDateIndonesian(selectedDate);
        if (dateDisplayText) dateDisplayText.value = naturalStr;
        state.dateStr = naturalStr;
        drawCanvas();
      }
    });
  }

  // Trigger native browser datepicker dialog
  const openCalendar = () => {
    if (!nativeDateInput) return;
    if (typeof nativeDateInput.showPicker === 'function') {
      nativeDateInput.showPicker();
    } else {
      nativeDateInput.click();
    }
  };

  if (dateDisplayText) dateDisplayText.addEventListener('click', openCalendar);
  if (triggerNativeDateBtn) triggerNativeDateBtn.addEventListener('click', openCalendar);

  if (downloadBtn) downloadBtn.addEventListener('click', handleDownload);
}

// App Initialization
async function initApp() {
  initDefaults();
  setupEventListeners();

  await preloadStaticAssets();

  // Wait for web fonts to load to avoid text metric distortion on initial canvas draw
  document.fonts.ready.then(() => {
    state.isFontsLoaded = true;
    drawCanvas();
  });

  loadRandomNatureImages();
}

// Run app when DOM ready
document.addEventListener('DOMContentLoaded', initApp);
