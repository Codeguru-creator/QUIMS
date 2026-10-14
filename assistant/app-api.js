/* ===== IECMS ADMIN DASHBOARD - API MODULE ===== */
/* Data loading and API interactions */

/* ===== LOAD CURRENT USER PROFILE ===== */
let authRedirectStarted = false;
let dataLoadInProgress = false;
let dataReloadQueued = false;
let dataReloadShouldRender = false;
let dataReloadProfile = false;

function redirectToLoginIfUnauthorized(response) {
  if (response.status !== 401 || authRedirectStarted) return false;
  authRedirectStarted = true;
  window.location.replace('../login.html');
  return true;
}

async function loadCurrentUserProfileWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch('api/users.php?action=current', {
        method: 'GET',
        credentials: 'include'
      });
      if (redirectToLoginIfUnauthorized(response)) return;
      if (!response.ok) {
        if (i === retries - 1) {
          console.error(`Failed to fetch current user profile after ${retries} attempts:`, response.status);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      const data = await response.json();
      state.currentUser = {
        ...data,
        full_name: data.full_name || data.name || data.email || 'Admin',
        name: data.full_name || data.name || data.email || 'Admin',
        role: data.role || 'admin'
      };
      state.adminId = state.currentUser.id;
      state.currentUserName = state.currentUser.full_name;
      state.currentUserRole = normalizeRole(state.currentUser.role);
      updateProfileHeader();
      loadProfilePicture();
      return;
    } catch (err) {
      if (i === retries - 1) {
        console.error(`Error fetching current user profile after ${retries} attempts:`, err);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}

/* ===== LOAD INITIAL DATA ===== */
async function loadInitialData(loadProfile = true, backgroundRefresh = false) {
  if (dataLoadInProgress) {
    if (backgroundRefresh) return;
    dataReloadQueued = true;
    dataReloadShouldRender = dataReloadShouldRender || !backgroundRefresh;
    dataReloadProfile = dataReloadProfile || loadProfile;
    return;
  }

  dataLoadInProgress = true;
  try {
    do {
      dataReloadQueued = false;
      const shouldRender = !backgroundRefresh || dataReloadShouldRender;
      const shouldLoadProfile = loadProfile || dataReloadProfile;
      dataReloadShouldRender = false;
      dataReloadProfile = false;
      await performDataLoad(shouldLoadProfile, !shouldRender);
      loadProfile = false;
      backgroundRefresh = true;
    } while (dataReloadQueued);
  } finally {
    dataLoadInProgress = false;
  }
}

async function performDataLoad(loadProfile, backgroundRefresh) {
  // Show the dashboard shell immediately; data fills in as each request completes.
  isLoading = false;
  if (!backgroundRefresh) renderContent();

  const loadCollection = async (url, key, validate = value => value) => {
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (redirectToLoginIfUnauthorized(response)) return;
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      state[key] = validate(await response.json());
    } catch (err) {
      console.warn(`Failed to fetch ${key}:`, err.message);
    }
  };

  if (loadProfile) {
    await loadCurrentUserProfileWithRetry(2);
  }
  const dataLoads = [
    loadPasskeys(),
    loadCollection('api/assistants.php?v=role-sync-1', 'assistants', value => Array.isArray(value) ? value : []),
    loadCollection('api/tickets.php', 'tickets', value => Array.isArray(value) ? value : []),
    loadCollection('api/notifications.php', 'notifications', value => Array.isArray(value) ? value : [])
  ];
  if (String(state.currentUserRole || '').toLowerCase() !== 'assistant') {
    dataLoads.push(loadCollection('api/users.php?v=status-sync-1', 'users', value => Array.isArray(value) ? value : []));
  }
  await Promise.allSettled(dataLoads);

  const activeElement = document.activeElement;
  const content = document.getElementById('content');
  const editingContent = content?.contains(activeElement)
    && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
  const preserveCurrentView = backgroundRefresh
    && (['register', 'settings'].includes(state.activeTab) || editingContent);
  if (!preserveCurrentView) {
    renderContent();
    updateNotifBadge();
  }
}

async function loadPasskeys() {
  try {
    const response = await fetch('api/passkeys.php', { credentials: 'include' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json();
    state.passkeys = Array.isArray(data) ? data : [];
    state.passkeysFetched = true;
  } catch (err) {
    console.warn('Failed to fetch verification credentials:', err.message);
  }
}

async function refreshAssistantsForDrilldown() {
  try {
    const response = await fetch('api/assistants.php?v=role-sync-1', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return;
    const assistants = await response.json();
    state.assistants = Array.isArray(assistants) ? assistants : [];
    if (state.activeTab === 'dashboard' && state.drillDown === 'active') renderContent();
  } catch (err) {
    console.warn('Failed to refresh assistants:', err.message);
  }
}

/* ===== LOAD NOTIFICATIONS ===== */
async function loadNotifications() {
  try {
    const res = await fetch('api/notifications.php', { credentials: 'include' });
    if (res.ok) {
      state.notifications = await res.json();
      updateNotifBadge();
    }
  } catch (err) {
    console.error('Error loading notifications:', err);
  }
}

/* ===== MARK NOTIFICATION READ ===== */
async function markNotificationRead(id) {
  try {
    const res = await fetch('api/notifications.php?action=mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      const notification = state.notifications.find(n => n.id === id);
      if (notification) {
        notification.is_read = 1;
        updateNotifBadge();
      }
    }
  } catch (err) {
    console.error('Error marking notification as read:', err);
  }
}

/* ===== MARK ALL NOTIFICATIONS READ ===== */
async function markAllNotificationsRead() {
  try {
    const res = await fetch('api/notifications.php?action=mark-all-read', {
      credentials: 'include',
      method: 'POST'
    });
    if (res.ok) {
      state.notifications.forEach(n => {
        n.is_read = 1;
      });
      updateNotifBadge();
    }
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
  }
}

/* ===== DELETE NOTIFICATION ===== */
function deleteNotification(id) {
  const notification = state.notifications.find(item => String(item.id) === String(id));
  const title = notification ? notification.title : 'this notification';
  openModal('Delete Notification', `
    <div style="padding:8px 4px 4px;text-align:center;">
      <p style="margin:0;color:var(--slate-700);font-size:.95rem;line-height:1.5;">
        Are you sure you want to delete this notification?
      </p>
      <p style="margin:8px 0 0;color:var(--slate-500);font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${esc(title)}
      </p>
    </div>
  `, `
    <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn btn-danger" onclick="confirmDeleteNotification('${esc(String(id))}')">Delete</button>
  `);
}

async function confirmDeleteNotification(id) {
  closeModal();
  try {
    const res = await fetch(`api/notifications.php?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (res.ok) {
      state.notifications = state.notifications.filter(n => n.id !== id);
      updateNotifBadge();
    }
  } catch (err) {
    console.error('Error deleting notification:', err);
  }
}
