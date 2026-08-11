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
const flatpickrDateInput = document.getElementById('flatpickrDate');
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

// Calendar State
let currentDateState = new Date();
let selectedDateState = new Date();

/// Sample Bible Verse Fallbacks when inputs are empty
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

// Check if form inputs are completed (Only Verse Text & Verse Ref required, Reflection can be empty)
function checkFormCompletion() {
  const isVerseFilled = state.verseText.trim().length > 0;
  const isRefFilled = state.verseRef.trim().length > 0;
  
  // Download is enabled as long as Verse & Verse Number/Ref are filled (reflection is optional)
  const isComplete = isVerseFilled && isRefFilled;

  if (downloadBtn) {
    downloadBtn.disabled = !isComplete;
    if (!isComplete) {
      downloadBtn.classList.add('disabled');
      downloadBtn.title = "Lengkapi Isi Teks Ayat dan Nomor Ayat untuk mendownload PNG";
    } else {
      downloadBtn.classList.remove('disabled');
      downloadBtn.title = "Download PNG High Quality";
    }
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

    // Process photo objects from Pexels API payload: photo.src.portrait or photo.src.large2x
    const imagePromises = photos.map((photo, i) => {
      const imgUrl = photo.src ? (photo.src.portrait || photo.src.large2x || photo.src.large) : '';
      const img = new Image();
      img.crossOrigin = 'anonymous';

      return new Promise((resolve) => {
        img.onload = () => resolve({ img, url: imgUrl, index: i, photographer: photo.photographer });
        img.onerror = () => resolve({ img: null, url: imgUrl, index: i });
        img.src = imgUrl;
      });
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
function drawCanvas() {
  const width = canvas.width;   // 1080
  const height = canvas.height; // 1920
  const paddingX = 90;
  const contentWidth = width - (paddingX * 2);

  // 1. Draw Base Pure Black Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Nature Image Background with User Opacity
  const activeBg = state.bgImages[state.selectedBgIndex];
  if (activeBg && activeBg.img) {
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

  // Fallback values if input boxes are left empty
  const activeVerseText = state.verseText.trim() || LOREM_VERSES[randomFallbackIdx];
  const activeVerseRef = state.verseRef.trim() || LOREM_REFS[randomFallbackIdx];
  const activeReflectionText = state.reflectionText.trim() || LOREM_REFLECTIONS[randomFallbackIdx];

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
    ctx.font = `500 ${verseFontSize}px "Montserrat", sans-serif`;
    verseLines = getWrappedLines(ctx, activeVerseText, contentWidth);
    const verseLineHeight = verseFontSize * 1.5;
    const verseBlockH = verseLines.length * verseLineHeight;

    const refBlockH = refFontSize * 1.6;

    const dividerH = 50;

    ctx.font = `400 ${reflectionFontSize}px "Playfair Display", serif`;
    reflectionLines = getWrappedLines(ctx, activeReflectionText, contentWidth);
    const reflectionLineHeight = reflectionFontSize * 1.5;
    const reflectionBlockH = reflectionLines.length * reflectionLineHeight;

    totalCalculatedH = verseBlockH + refBlockH + dividerH + reflectionBlockH + 120; // Spacings

    if (totalCalculatedH > remainingHeight && verseFontSize > 28) {
      verseFontSize -= 2;
      reflectionFontSize -= 2;
      refFontSize -= 2;
    } else {
      break;
    }
  }

  // --- Render Verse Text (Montserrat Medium) ---
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${verseFontSize}px "Montserrat", sans-serif`;
  const verseLineH = verseFontSize * 1.55;

  verseLines.forEach((line) => {
    ctx.fillText(line, width / 2, currentY);
    currentY += verseLineH;
  });
  currentY += 35;

  // --- Render Verse Reference / Number (Playfair Display SC Gold) ---
  ctx.fillStyle = '#F59E0B';
  ctx.font = `700 ${refFontSize}px "Playfair Display", serif`;
  ctx.fillText(activeVerseRef, width / 2, currentY);
  currentY += refFontSize * 0.8 + 40;

  // --- Render Divider Image ---
  const divider = state.loadedImages['divider'];
  if (divider) {
    const dividerW = 540;
    const dividerH = (divider.height / divider.width) * dividerW;
    ctx.drawImage(divider, (width - dividerW) / 2, currentY, dividerW, dividerH);
    currentY += dividerH + 50;
  } else {
    currentY += 40;
  }

  // --- Render Reflection Text (Playfair Display Regular) ---
  ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${reflectionFontSize}px "Playfair Display", serif`;
  const reflectionLineH = reflectionFontSize * 1.55;

  reflectionLines.forEach((line) => {
    ctx.fillText(line, width / 2, currentY);
    currentY += reflectionLineH;
  });
}

// Download High-Res PNG Handler
function handleDownload() {
  // Redraw canvas with opacity applied cleanly
  drawCanvas();

  const link = document.createElement('a');
  const dateFormatted = dateInput.value || 'ayat-harian';
  link.download = `Suara_Gembala_${dateFormatted}.png`;
  link.href = canvas.toDataURL('image/png', 1.0);
  link.click();
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
  nativeDateInput.addEventListener('change', (e) => {
    if (e.target.value) {
      const selectedDate = new Date(e.target.value + 'T00:00:00');
      const naturalStr = formatDateIndonesian(selectedDate);
      dateDisplayText.value = naturalStr;
      state.dateStr = naturalStr;
      drawCanvas();
    }
  });

  // Trigger native browser datepicker dialog
  const openCalendar = () => {
    if (typeof nativeDateInput.showPicker === 'function') {
      nativeDateInput.showPicker();
    } else {
      nativeDateInput.click();
    }
  };

  dateDisplayText.addEventListener('click', openCalendar);
  triggerNativeDateBtn.addEventListener('click', openCalendar);

  downloadBtn.addEventListener('click', handleDownload);
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
