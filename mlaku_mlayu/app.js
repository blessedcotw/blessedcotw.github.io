// CONFIGURATION: Set your Google Apps Script Web App URL here
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwGJicjSfoptvmkOcH5WbrNqoxhcQosXk83yr9vnQJhj62ZdexceqQwHxmUQlmR6ZZ8mA/exec";

// State variables
let contacts = [];
let template = "";
let sentStatuses = {}; // Map of contact id to boolean sent status

// DOM Elements
const fetchDataBtn = document.getElementById('btn-fetch-data');
const templateInput = document.getElementById('message-template');
const saveTemplateBtn = document.getElementById('btn-save-template');
const searchInput = document.getElementById('search-input');
const resetStatusBtn = document.getElementById('btn-reset-status');
const contactsTableBody = document.getElementById('contacts-table-body');

// Stat Elements
const statTotal = document.getElementById('stat-total');
const statPending = document.getElementById('stat-pending');
const statSent = document.getElementById('stat-sent');
const progressBar = document.getElementById('progress-bar');
const progressPercentage = document.getElementById('progress-percentage');

// Initialize App
window.addEventListener('DOMContentLoaded', async () => {
  // Load saved configurations from LocalStorage
  const savedTemplate = localStorage.getItem('wa_message_template');
  sentStatuses = JSON.parse(localStorage.getItem('wa_sent_statuses')) || {};
  const isDark = localStorage.getItem('wa_dark_theme') === 'true';

  // Load default from config.json
  let defaultTemplate = "";
  
  try {
    const configRes = await fetch('config.json');
    if (configRes.ok) {
      const configData = await configRes.json();
      if (configData.default_template) {
        defaultTemplate = configData.default_template;
      }
    }
  } catch (err) {
    console.warn("Could not load default template from config.json.");
  }

  template = savedTemplate !== null ? savedTemplate : defaultTemplate;
  templateInput.value = template;

  // Setup collapsible template card on mobile
  const templateCardHeader = document.getElementById('template-card-header');
  const templateCard = document.getElementById('template-card');
  const toggleIcon = document.getElementById('template-toggle-icon');
  
  if (templateCardHeader && templateCard) {
    templateCardHeader.addEventListener('click', (e) => {
      // Only toggle on mobile screens (width <= 1024px)
      if (window.innerWidth <= 1024) {
        const isExpanded = templateCard.classList.toggle('expanded');
        if (toggleIcon) {
          toggleIcon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    });
  }

  // Check if we have cached contacts
  const cachedContacts = localStorage.getItem('wa_contacts');
  if (cachedContacts) {
    contacts = JSON.parse(cachedContacts);
    renderTable();
    updateStats();
  }
});


// Helper: Insert template placeholder
function insertPlaceholder(placeholder) {
  const start = templateInput.selectionStart;
  const end = templateInput.selectionEnd;
  const text = templateInput.value;
  templateInput.value = text.substring(0, start) + placeholder + text.substring(end);
  templateInput.focus();
  templateInput.selectionStart = templateInput.selectionEnd = start + placeholder.length;
}

// Save Template
saveTemplateBtn.addEventListener('click', () => {
  template = templateInput.value;
  localStorage.setItem('wa_message_template', template);
  renderTable(); // Rerender to update message previews
  alert('Template berhasil disimpan!');
});

// Clean and Convert Phone Number (e.g. 08123456 -> 628123456)
function formatPhoneNumber(phoneStr) {
  if (!phoneStr) return '';
  
  // Remove non-digit characters
  let digits = phoneStr.replace(/\D/g, '');
  
  // If number starts with 08..., convert to 628...
  if (digits.startsWith('08')) {
    digits = '628' + digits.substring(2);
  }
  // If it starts with 8..., prepends 62
  else if (digits.startsWith('8') && digits.length >= 9 && digits.length <= 13) {
    digits = '62' + digits;
  }
  
  return digits;
}

// Fetch spreadsheet data from GAS
fetchDataBtn.addEventListener('click', async () => {
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.includes("YOUR_SCRIPT_ID_HERE")) {
    alert('Harap konfigurasikan GAS_WEB_APP_URL terlebih dahulu di bagian paling atas file app.js.');
    return;
  }
  
  fetchDataBtn.disabled = true;
  fetchDataBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menarik Data...';

  try {
    const response = await fetch(GAS_WEB_APP_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const result = await response.json();
    if (result.status === 'success') {
      contacts = result.contacts;
      localStorage.setItem('wa_contacts', JSON.stringify(contacts));
      renderTable();
      updateStats();
      alert(`Berhasil menarik ${contacts.length} kontak dari spreadsheet!`);
    } else {
      throw new Error(result.message || 'Gagal mengambil data.');
    }
  } catch (error) {
    console.error('Fetch Error:', error);
    alert('Terjadi kesalahan saat menarik data. Pastikan URL GAS_WEB_APP_URL benar di file app.js, dideploy sebagai "Anyone", dan Anda telah mengizinkan akses otorisasi.');
  } finally {
    fetchDataBtn.disabled = false;
    fetchDataBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Tarik Data';
  }
});

// Render Table Rows
function renderTable() {
  const searchTerm = searchInput.value.toLowerCase();
  const filtered = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm) || 
    c.phone.includes(searchTerm) ||
    formatPhoneNumber(c.phone).includes(searchTerm) ||
    (c.category && c.category.toLowerCase().includes(searchTerm))
  );

  if (filtered.length === 0) {
    contactsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty-state">
          <i class="fas fa-search-minus empty-icon"></i>
          <p>${contacts.length === 0 ? 'Belum ada data. Klik tombol "Tarik Data" untuk memuat.' : 'Tidak ada kontak yang cocok dengan pencarian Anda.'}</p>
        </td>
      </tr>
    `;
    return;
  }

  contactsTableBody.innerHTML = filtered.map(c => {
    const formattedPhone = formatPhoneNumber(c.phone);
    const isSent = !!sentStatuses[c.id];
    const previewText = generateMessage(c.name, c.phone, c.category || '');
    
    return `
      <tr class="${isSent ? 'row-sent' : ''}">
        <td data-label="No" class="row-number">${c.id}</td>
        <td data-label="Nama" class="contact-name">${escapeHTML(c.name)}<span class="card-category-badge">${escapeHTML(c.category || '')}</span></td>
        <td data-label="Nomor HP" class="phone-column">
          <div class="phone-container">
            <span class="phone-orig">${escapeHTML(c.phone)}</span>
            <span class="phone-conv"><i class="fab fa-whatsapp"></i> ${formattedPhone}</span>
          </div>
        </td>
        <td data-label="Kategori" class="contact-category">${escapeHTML(c.category || '-')}</td>
        <td data-label="Status">
          <span class="status-badge ${isSent ? 'sent' : 'pending'}">
            <i class="fas ${isSent ? 'fa-check' : 'fa-clock'}"></i>
            ${isSent ? 'Terkirim' : 'Pending'}
          </span>
        </td>
        <td data-label="Aksi">
          <div class="action-buttons">
            <button class="btn-send" onclick="sendWhatsApp('${c.id}', '${formattedPhone}', \`${escapeJS(previewText)}\`)" title="Kirim WhatsApp">
              <i class="fab fa-whatsapp"></i>
            </button>
            <button class="btn-check ${isSent ? 'active' : ''}" onclick="toggleSentStatus('${c.id}')" title="Tandai Terkirim">
              <i class="fas fa-check"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Generate Personalized Message
function generateMessage(name, phone, category) {
  let msg = templateInput.value || template;
  msg = msg.replace(/{Nama}/g, name);
  msg = msg.replace(/{Nomor}/g, phone);
  msg = msg.replace(/{Kategori}/g, category);
  return msg;
}

// Send WhatsApp Handler
function sendWhatsApp(id, phone, text) {
  if (!phone) {
    alert('Nomor telepon tidak valid.');
    return;
  }
  
  // Create Click-to-chat URL using official WhatsApp API (opens native app/desktop client directly)
  const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;
  
  // Open in new tab
  window.open(waUrl, '_blank');
  
  // Auto mark as sent
  markAsSent(id);
}

// Toggle Sent/Pending Status manually
function toggleSentStatus(id) {
  if (sentStatuses[id]) {
    delete sentStatuses[id];
  } else {
    sentStatuses[id] = true;
  }
  saveStatuses();
  renderTable();
  updateStats();
}

// Mark specific ID as sent
function markAsSent(id) {
  sentStatuses[id] = true;
  saveStatuses();
  renderTable();
  updateStats();
}

function saveStatuses() {
  localStorage.setItem('wa_sent_statuses', JSON.stringify(sentStatuses));
}

// Update Dashboard Statistics
function updateStats() {
  const total = contacts.length;
  const sent = contacts.filter(c => !!sentStatuses[c.id]).length;
  const pending = total - sent;
  const percent = total > 0 ? Math.round((sent / total) * 100) : 0;

  statTotal.textContent = total;
  statSent.textContent = sent;
  statPending.textContent = pending;
  
  progressBar.style.width = `${percent}%`;
  progressPercentage.textContent = `${percent}%`;
}

// Reset all statuses
resetStatusBtn.addEventListener('click', () => {
  if (confirm('Apakah Anda yakin ingin menyetel ulang status pengiriman semua kontak menjadi Pending?')) {
    sentStatuses = {};
    saveStatuses();
    renderTable();
    updateStats();
  }
});

// Real-time Search
searchInput.addEventListener('input', renderTable);

// Utilities
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function escapeJS(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}
