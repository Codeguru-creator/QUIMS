/* ===== IECMS ADMIN DASHBOARD - CORE MODULE ===== */
/* State, initialization, helpers, utilities */

/* ===== APP STATE ===== */
const state = {
  activeTab: 'dashboard',
  sidebarOpen: false,
  drillDown: null,
  sort: { key: 'date', dir: 'desc' },
  filter: { text: '', type: 'All', start: '2023-01-01', end: new Date().toISOString().split('T')[0] },
  dashFilter: { start: '2023-01-01', end: new Date().toISOString().split('T')[0] },
  notificationFilter: { start: '2023-01-01', end: new Date().toISOString().split('T')[0], type: 'All', readStatus: 'All' },
  selectedAssistantId: null,
  selectedDrilldownAssistantId: null,
  tickets: [],
  ticketsError: '',
  assistants: [],
  notifications: [],
  users: [],
  generalUsers: [],
  generalUsersError: '',
  generalUserLookupId: '',
  generalUserLookupResult: null,
  generalUserLookupError: '',
  settingsSearch: '',
  adminId: null,
  currentUser: null,
  profilePicture: null,
  currentUserName: '',
  currentUserRole: '',
  passkeys: [],
  passkeysFetched: false,
  failedAttempts: 0,
  virtualSessionApproved: false,
  pcopyingApproved: false,
  verifiedVirtualSessionName: '',
  verifiedPCopyingName: '',
  verificationContext: 'vs',
  ftuReturnContext: null
};

let toasts = [];
let isLoading = true;
let contactMenuOpen = false;
let contactType = null; // 'whatsapp' | 'call' | null
let chartInstances = {};

/* ===== HELPER FUNCTIONS ===== */
function normalizeRole(role) {
  return (role || '').toString().trim().toLowerCase();
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2);
}

function getAssistantDisplayName(assistant) {
  return assistant?.name || assistant?.email || 'Unknown';
}

function getCurrentProfileUser() {
  const sessionUser = state.currentUser || {};
  const fallbackName = sessionUser.full_name || sessionUser.name || state.currentUserName || sessionUser.email || 'Admin';
  const fallbackRole = sessionUser.role || state.currentUserRole || 'admin';

  return {
    ...sessionUser,
    id: sessionUser.id ?? state.adminId ?? null,
    full_name: sessionUser.full_name || fallbackName,
    name: sessionUser.full_name || sessionUser.name || fallbackName,
    email: sessionUser.email || '',
    role: sessionUser.role || fallbackRole,
    last_logout: sessionUser.last_logout || '',
    phone: sessionUser.phone || '',
    whatsapp: sessionUser.whatsapp || '',
    status: sessionUser.status || 'offline',
    completed: sessionUser.completed || 0,
    pending: sessionUser.pending || 0
  };
}

function getSafeProfileDisplayName() {
  const profile = getCurrentProfileUser();
  return profile.full_name || profile.name || profile.email || 'Admin';
}

function formatLastSeen(value) {
  if (!value) return 'Not available';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return 'Not available';
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} ${time}`;
}

function getPresenceLabel(item) {
  return normalizeRole(item?.status) === 'online'
    ? 'Online now'
    : `Last seen ${formatLastSeen(item?.last_seen || item?.last_logout || item?.last_login)}`;
}

/* ===== HELPER FOR CLIENT LOCAL STORAGE STATE PERSISTENCE (DEPRECATED) ===== */
function persistLocalData() {
  // Completely removed local array and localStorage saving to enforce database-only persistence
}

/* ===== INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', () => {
  installBackLogoutConfirmation();
  window.addEventListener('pageshow', event => {
    if (event.persisted) verifyAdminDashboardSession();
  });
  renderSidebar();
  startClock();
  loadInitialData();
  setInterval(() => {
    if (!document.hidden) loadInitialData(false, true);
  }, 30000);
  setInterval(() => {
    if (!document.hidden) loadCurrentUserProfileWithRetry(1);
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadInitialData(false, true);
  });
  setupOutsideClicks();
  loadProfilePicture();
  loadSidebarLogo();
  window.addEventListener('resize', () => {
    if (window.innerWidth < 1024) {
      state.sidebarOpen = false;
      updateSidebarState();
    }
  });
});

function installBackLogoutConfirmation() {
  history.pushState({ iecmsBackGuard: true }, '', window.location.href);
  window.addEventListener('popstate', () => {
    history.pushState({ iecmsBackGuard: true }, '', window.location.href);
    openSignOutModal();
  });
}

async function verifyAdminDashboardSession() {
  try {
    const response = await fetch('api/users.php?action=current', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Session expired');
    const user = await response.json();
    const routes = { admin: 'index.php', supervisor: '../supervisor/supervisor-dashboard.php', assistant: '../assistant/assistant-dashboard.php', general_user: '../user-dashboard.php' };
    const role = String(user.role || '').toLowerCase();
    if (role !== 'admin') window.location.replace(routes[role] || '../index.html');
  } catch (error) {
    window.location.replace('../index.html');
  }
}

function loadProfilePicture() {
  // Profile picture now uses only uploaded images, no localStorage fallback
  if (state.profilePicture) {
    const headerAvatar = document.querySelector('.profile-avatar');
    if (headerAvatar) {
      const isOnline = normalizeRole(getCurrentProfileUser().status) === 'online';
      headerAvatar.innerHTML = `<img src="${state.profilePicture}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%"><span class="status-dot avatar-status ${isOnline ? 'online' : 'offline'}" aria-label="${isOnline ? 'Online' : 'Offline'}"></span>`;
    }
  }
}

function updateProfileHeader() {
  const nameEl = document.querySelector('.profile-name');
  const roleEl = document.querySelector('.profile-role');
  const avatarEl = document.querySelector('.profile-avatar');

  const profile = getCurrentProfileUser();
  const displayName = getSafeProfileDisplayName();
  const displayRole = normalizeRole(profile.role || 'admin');
  const isOnline = normalizeRole(profile.status) === 'online';
  if (avatarEl) {
    avatarEl.title = getPresenceLabel(profile);
    avatarEl.setAttribute('aria-label', `${displayName} - ${getPresenceLabel(profile)}`);
  }

  if (displayName) {
    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) {
      const currentRole = displayRole;
      const roleLabel = currentRole ? currentRole.charAt(0).toUpperCase() + currentRole.slice(1) : 'Administrator';
      roleEl.textContent = roleLabel;
    }
    if (avatarEl && !state.profilePicture) {
      const initials = getInitials(displayName);
      avatarEl.innerHTML = `${initials}<span class="status-dot avatar-status ${isOnline ? 'online' : 'offline'}" aria-label="${isOnline ? 'Online' : 'Offline'}"></span>`;
      avatarEl.dataset.initials = initials;
    } else if (avatarEl) {
      const oldStatus = avatarEl.querySelector('.avatar-status');
      if (oldStatus) oldStatus.remove();
      avatarEl.insertAdjacentHTML('beforeend', `<span class="status-dot avatar-status ${isOnline ? 'online' : 'offline'}" aria-label="${isOnline ? 'Online' : 'Offline'}"></span>`);
    }
  } else {
    if (nameEl) nameEl.textContent = 'Admin';
    if (roleEl) roleEl.textContent = 'Admin';
    if (avatarEl) {
      const oldStatus = avatarEl.querySelector('.avatar-status');
      if (oldStatus) oldStatus.remove();
      if (!state.profilePicture) avatarEl.textContent = '?';
      avatarEl.insertAdjacentHTML('beforeend', '<span class="status-dot avatar-status offline" aria-label="Offline"></span>');
      avatarEl.dataset.initials = '?';
    }
  }
}

function loadSidebarLogo() {
  const img = document.getElementById('sidebar-logo-img');
  const text = document.getElementById('sidebar-avatar-text');
  if (img && text) {
    img.src = '../system logo (2).webp';
    img.classList.remove('hidden');
    text.classList.add('hidden');
  }
}

function setSidebarLogo(imageUrl) {
  const img = document.getElementById('sidebar-logo-img');
  const text = document.getElementById('sidebar-avatar-text');
  if (img && text && imageUrl) {
    img.src = imageUrl;
    img.classList.remove('hidden');
    text.classList.add('hidden');
  }
}

/* ===== CLOCK ===== */
function startClock() {
  function tick() {
    const now = new Date();
    const timeEl = document.getElementById('header-time');
    const dateEl = document.getElementById('header-date');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (dateEl) dateEl.textContent = now.toDateString();
  }
  tick();
  setInterval(tick, 1000);
}

/* ===== TOAST ===== */
function addToast(message, type = 'success') {
  // Prevent duplicate toast with the exact same message and type from stacking
  if (toasts.some(t => t.message === message && t.type === type)) {
    return;
  }
  const id = Math.random().toString(36).substring(7);
  toasts.push({ id, message, type });
  renderToasts();
  setTimeout(() => {
    removeToast(id);
  }, 2200);
}

const showToast = addToast;

function removeToast(id) {
  const el = document.getElementById('toast-' + id);
  if (el) {
    el.classList.add('removing');
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      renderToasts();
    }, 200);
  } else {
    toasts = toasts.filter(t => t.id !== id);
    renderToasts();
  }
}

function renderToasts() {
  const container = document.getElementById('toast-container');
  if (!container) return;
  container.innerHTML = toasts.map(t => `
    <div id="toast-${t.id}" class="toast ${t.type}">
      <i data-lucide="${t.type === 'success' ? 'check-circle' : 'alert-triangle'}" class="icon-sm"></i>
      <span class="toast-msg">${esc(t.message)}</span>
      <button class="toast-close" onclick="removeToast('${t.id}')"><i data-lucide="x" style="width:16px;height:16px"></i></button>
    </div>
  `).join('');
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/* ===== SIGN OUT ===== */
function openSignOutModal() {
  const userName = state.currentUserName || 'Admin';
  const userRole = (state.currentUserRole || 'admin').toString().trim();
  const roleLabel = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'Admin';

  const body = `
    <div style="padding:6px 4px 2px; display:flex; flex-direction:column; align-items:center; text-align:center;">
      <h4 style="margin:0 0 6px; font-size:1.2rem; font-weight:600; color:var(--slate-900);">Are you sure you want to logout?</h4>
      <p style="margin:0 0 18px; font-size:0.92rem; color:var(--slate-500); line-height:1.5; max-width:300px;">
        You are logged in as ${esc(userName)}, ${esc(roleLabel)}.
      </p>
    </div>
  `;

  openModal('Logout', body, `
    <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="handleSignOut()" style="min-width:120px;">Logout</button>
  `);
}

async function handleSignOut() {
  try {
    await fetch('../api/logout.php', { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('Logout request failed:', err);
  } finally {
    closeModal();
    window.location.href = '../index.html';
  }
}

/* ===== UTILITY: HTML ESCAPE ===== */
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
