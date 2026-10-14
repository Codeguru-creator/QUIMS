/* ===== IECMS ADMIN DASHBOARD - UI MODULE ===== */
/* Sidebar, notifications, modals, contact FAB, outside clicks */

/* ===== SIDEBAR ===== */
function renderSidebar() {
  const navItems = [
    { id: 'dashboard', label: 'Analytics', icon: 'layout-dashboard' },
    { id: 'assignments', label: 'My Assignments', icon: 'clipboard-list' },
    { id: 'register', label: 'Register Task', icon: 'plus-circle' },
    { id: 'records', label: 'Master Records', icon: 'book-open' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const subtitle = document.getElementById('sidebar-subtitle');
  if (subtitle) subtitle.textContent = 'Assistant Portal';
  document.title = state.activeTab === 'assignments' ? 'My Assignments' : 'IT Assistant Dashboard';
  if (state.activeTab === 'team') state.activeTab = 'dashboard';
  nav.innerHTML = navItems.map(item => {
    const unread = item.id === 'notifications' ? state.notifications.filter(n => !n.read).length : 0;
    const badgeHtml = unread > 0 ? `<span class="sidebar-nav-badge">${unread > 9 ? '9+' : unread}</span>` : '';
    return `
      <button class="sidebar-nav-btn ${state.activeTab === item.id ? 'active' : ''}" onclick="switchTab('${item.id}')">
        <span class="nav-left"><i data-lucide="${item.icon}" class="icon-sm"></i><span>${item.label}</span></span>
        ${badgeHtml}
      </button>
    `;
  }).join('');
  updateSidebarState();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function switchTab(tab) {
  if (!tab) return;
  if (tab === 'team') return;
  // Do not let a previously opened modal or notification preview intercept
  // navigation clicks after a form flow has completed.
  closeModal();
  hideNotifPreview();
  state.activeTab = tab;
  state.drillDown = null;
  renderSidebar();
  renderContent();
  if (window.innerWidth < 1024) closeSidebar();
}

function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  updateSidebarState();
}

function closeSidebar() {
  state.sidebarOpen = false;
  updateSidebarState();
}

function updateSidebarState() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  if (state.sidebarOpen) {
    sidebar.classList.remove('closed');
    if (overlay) overlay.classList.remove('hidden');
  } else {
    sidebar.classList.add('closed');
    if (overlay) overlay.classList.add('hidden');
  }
}

/* ===== NOTIFICATION BADGE ===== */
function updateNotifBadge() {
  const unread = state.notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notif-badge');
  if (badge) {
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  // Update sidebar badge too
  renderSidebar();
}

/* ===== NOTIFICATION PREVIEW ===== */
function showNotifPreview() {
  const recent = state.notifications.slice(0, 5);
  if (recent.length === 0) return;
  const preview = document.getElementById('notif-preview');
  if (!preview) return;
  preview.innerHTML = `
    <div class="notif-preview-header">
      <h3><i data-lucide="bell" style="width:16px;height:16px"></i> Recent Notifications</h3>
      <button onclick="hideNotifPreview()"><i data-lucide="x" style="width:16px;height:16px"></i></button>
    </div>
    <div class="notif-preview-list">
      ${recent.map(n => `
        <div class="notif-preview-item ${n.read ? '' : 'unread'}" onclick="markNotificationRead('${n.id}')">
          <div class="notif-preview-item-row">
            <div style="flex-shrink:0;margin-top:2px">${getNotifIconSmall(n.type)}</div>
            <div class="notif-preview-item-content">
              <div class="notif-preview-item-title-row">
                <p class="notif-preview-item-title ${n.read ? 'read' : 'unread'}">${esc(n.title)}</p>
                ${!n.read ? '<span class="notif-preview-unread-dot"></span>' : ''}
              </div>
              <p class="notif-preview-item-msg">${esc(n.message)}</p>
              <p class="notif-preview-item-time"><i data-lucide="clock" style="width:12px;height:12px"></i> ${formatTimeAgo(n.createdAt)}</p>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="notif-preview-footer">
      <button onclick="handleBellClick()">View all notifications &rarr;</button>
    </div>
  `;
  preview.classList.remove('hidden');
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function hideNotifPreview() {
  const preview = document.getElementById('notif-preview');
  if (preview) preview.classList.add('hidden');
}

function handleBellClick() {
  hideNotifPreview();
  switchTab('notifications');
}

/* ===== CONTACT FAB ===== */
function toggleContactMenu() {
  contactMenuOpen = !contactMenuOpen;
  contactType = null;
  renderContactMenu();
}

function renderContactMenu() {
  const menu = document.getElementById('contact-menu');
  const btn = document.getElementById('contact-fab-btn');
  if (!menu || !btn) return;
  if (!contactMenuOpen) {
    menu.classList.add('hidden');
    btn.classList.remove('open');
    btn.innerHTML = '<i data-lucide="message-circle" class="icon-lg"></i>';
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    return;
  }
  btn.classList.add('open');
  btn.innerHTML = '<i data-lucide="plus" class="icon-lg"></i>';
  if (!contactType) {
    menu.innerHTML = `
      <h4>Contact via</h4>
      <div class="contact-type-btns">
        <button class="contact-type-btn whatsapp" onclick="setContactType('whatsapp')">WhatsApp</button>
        <button class="contact-type-btn call" onclick="setContactType('call')">Call</button>
      </div>
    `;
  } else {
    const contacts = state.assistants.filter(a =>
      ['admin', 'supervisor'].includes(String(a.role || '').toLowerCase()) &&
      Boolean(contactType === 'whatsapp' ? a.whatsapp : a.phone)
    );
    menu.innerHTML = `
      <div class="contact-list-header">
        <h4>${contactType === 'whatsapp' ? 'WhatsApp Contacts' : 'Call Contacts'}</h4>
        <button onclick="setContactType(null)"><i data-lucide="x" style="width:16px;height:16px"></i></button>
      </div>
      <div class="contact-list">
        ${contacts.length > 0 ? contacts.map(a => `
          <div class="contact-list-item">
            <span>${esc(a.name)}</span>
            ${contactType === 'whatsapp'
              ? `<a href="https://wa.me/${(a.whatsapp || '').replace(/\D/g, '')}" target="_blank" rel="noreferrer" class="whatsapp"><i data-lucide="message-circle" style="width:16px;height:16px"></i></a>`
              : `<a href="tel:${a.phone}" class="phone"><i data-lucide="phone" style="width:16px;height:16px"></i></a>`
            }
          </div>
        `).join('') : '<p class="contact-empty">No contacts available</p>'}
      </div>
    `;
  }
  menu.classList.remove('hidden');
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function setContactType(type) {
  contactType = type;
  renderContactMenu();
}

/* ===== OUTSIDE CLICKS ===== */
function setupOutsideClicks() {
  document.addEventListener('mousedown', (e) => {
    // Contact menu
    const fab = document.getElementById('contact-fab');
    if (contactMenuOpen && fab && !fab.contains(e.target)) {
      contactMenuOpen = false;
      contactType = null;
      renderContactMenu();
    }
    // Notif preview
    const notifWrap = document.getElementById('notif-bell-wrapper');
    if (notifWrap && !notifWrap.contains(e.target)) {
      hideNotifPreview();
    }
  });
}

/* ===== MODAL ===== */
function openModal(title, bodyHtml, footerHtml, wide) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const footer = document.getElementById('modal-footer');
  if (footer) {
    if (footerHtml) {
      footer.innerHTML = footerHtml;
      footer.classList.remove('hidden');
    } else {
      footer.classList.add('hidden');
    }
  }
  const modal = document.getElementById('modal');
  if (modal) {
    modal.className = wide ? 'modal wide' : 'modal';
    modal.classList.remove('hidden');
  }
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.classList.remove('hidden');
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('hidden');
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
  
  // Untick the FTU checkbox if the modal title was FTU Credentials Registration
  const titleEl = document.getElementById('modal-title');
  if (titleEl && titleEl.textContent === "FTU Credentials Registration") {
    const ftuCheckbox = document.getElementById('reg-is-ftu');
    if (ftuCheckbox) ftuCheckbox.checked = false;
  }
}

/* ===== PROFILE MODAL ===== */
async function openProfileModal() {
  if (typeof loadCurrentUserProfileWithRetry === 'function') {
    await loadCurrentUserProfileWithRetry(2);
  }
  const currentProfile = getCurrentProfileUser();
  const admin = currentProfile;
  const profilePic = state.profilePicture;
  const adminName = getSafeProfileDisplayName();
  const adminRole = normalizeRole(admin.role || currentProfile.role || 'admin');
  const profileTitle = `${adminRole.charAt(0).toUpperCase()}${adminRole.slice(1)} Profile`;
  const isOnline = normalizeRole(admin.status) === 'online';
  let body;
  if (admin) {
    body = `
      <div class="profile-modal-content">
        <div id="profile-primary-view">
          <div class="profile-modal-header-section">
          <div class="profile-dp-wrapper">
            <div class="profile-dp-container" id="profile-dp-container">
              ${profilePic
                ? `<img src="${profilePic}" alt="Profile" class="profile-dp-img" id="profile-dp-img">`
                : `<div class="profile-dp-placeholder" id="profile-dp-placeholder">${getInitials(adminName)}</div>`
              }
              <label class="profile-dp-overlay" for="profile-dp-input">
                <i data-lucide="camera" style="width:20px;height:20px"></i>
                <span>Change</span>
              </label>
            </div>
            <input type="file" id="profile-dp-input" accept="image/*" style="display:none" onchange="handleProfilePicUpload(event)">
          </div>
          <div class="profile-modal-name-area">
            <h3 class="profile-modal-name">${esc(adminName)}</h3>
            <span class="profile-modal-role-badge">${esc(adminRole)}</span>
          </div>
          </div>
          <div class="profile-modal-details">
          <div class="profile-detail-row">
            <div class="profile-detail-icon"><i data-lucide="user" style="width:16px;height:16px"></i></div>
            <div class="profile-detail-info"><span class="profile-detail-label">Name</span><span class="profile-detail-value">${esc(adminName)}</span></div>
          </div>
          <div class="profile-detail-row">
            <div class="profile-detail-icon"><i data-lucide="mail" style="width:16px;height:16px"></i></div>
            <div class="profile-detail-info"><span class="profile-detail-label">Email</span><span class="profile-detail-value">${esc(admin.email || currentProfile.email || 'Not set')}</span></div>
          </div>
          <div class="profile-detail-row">
            <div class="profile-detail-icon"><i data-lucide="phone" style="width:16px;height:16px"></i></div>
            <div class="profile-detail-info"><span class="profile-detail-label">Phone</span><span class="profile-detail-value">${esc(admin.phone || currentProfile.phone || 'Not set')}</span></div>
          </div>
          <div class="profile-detail-row">
            <div class="profile-detail-icon"><i data-lucide="message-circle" style="width:16px;height:16px"></i></div>
            <div class="profile-detail-info"><span class="profile-detail-label">WhatsApp</span><span class="profile-detail-value">${esc(admin.whatsapp || currentProfile.whatsapp || 'Not set')}</span></div>
          </div>
          </div>
          <div class="profile-modal-stats">
          <div class="profile-stat-card resolved-stat">
            <span class="profile-stat-value">${admin.completed || 0}</span>
            <span class="profile-stat-label">Resolved</span>
          </div>
          <div class="profile-stat-card pending-stat">
            <span class="profile-stat-value">${admin.pending || 0}</span>
            <span class="profile-stat-label">Pending</span>
          </div>
          </div>
          <div class="profile-modal-actions">
            <button class="btn btn-outline profile-change-pw-btn" onclick="toggleChangePassword()">
              <i data-lucide="lock" style="width:14px;height:14px"></i> Change Password
            </button>
          </div>
        </div>

        <div id="change-password-section" class="change-password-section hidden">
          <div class="change-password-heading">
            <button class="change-password-back" type="button" onclick="toggleChangePassword()" title="Back to profile">
              <i data-lucide="arrow-left" style="width:16px;height:16px"></i>
            </button>
            <div>
              <h4>Change Password</h4>
              <p>Update your account password</p>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input type="password" class="form-input form-input-sm" id="current-password" placeholder="Enter current password">
          </div>
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input type="password" class="form-input form-input-sm" id="new-password" placeholder="Enter new password">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm New Password</label>
            <input type="password" class="form-input form-input-sm" id="confirm-password" placeholder="Confirm new password">
          </div>
          <button class="btn btn-primary btn-sm" onclick="handleChangePassword()">Update Password</button>
        </div>
      </div>
    `;
  } else {
    body = '<div style="text-align:center;padding:32px;color:var(--slate-500)"><p>No admin profile available</p></div>';
  }
  openModal(profileTitle, body, `<button class="btn btn-primary" onclick="closeModal()">Close</button>`);
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('profile-modal');
}

function handleProfilePicUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    state.profilePicture = ev.target.result;
    // Update the profile avatar in header
    const headerAvatar = document.querySelector('.profile-avatar');
    if (headerAvatar) {
      const isOnline = normalizeRole(getCurrentProfileUser().status) === 'online';
      headerAvatar.innerHTML = `<img src="${ev.target.result}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%"><span class="status-dot avatar-status ${isOnline ? 'online' : 'offline'}" aria-label="${isOnline ? 'Online' : 'Offline'}"></span>`;
    }
    // Update the modal display picture
    const container = document.getElementById('profile-dp-container');
    if (container) {
      const existing = container.querySelector('.profile-dp-img') || container.querySelector('.profile-dp-placeholder');
      if (existing) {
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.alt = 'Profile';
        img.className = 'profile-dp-img';
        img.id = 'profile-dp-img';
        existing.replaceWith(img);
      }
    }
    addToast('Profile picture updated!');
  };
  reader.readAsDataURL(file);
}

function toggleChangePassword() {
  const profileView = document.getElementById('profile-primary-view');
  const section = document.getElementById('change-password-section');
  const modal = document.getElementById('modal');
  if (!profileView || !section) return;
  const showPassword = section.classList.toggle('hidden');
  profileView.classList.toggle('hidden', !showPassword);
  if (modal) modal.classList.toggle('change-password-modal', !showPassword);
  const title = document.getElementById('modal-title');
  const role = normalizeRole(state.currentUserRole || state.currentUser?.role || 'supervisor');
  const profileTitle = `${role.charAt(0).toUpperCase()}${role.slice(1)} Profile`;
  if (title) title.textContent = showPassword ? profileTitle : 'Change Password';
  if (!showPassword) document.getElementById('current-password')?.focus();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function handleChangePassword() {
  const current = document.getElementById('current-password').value;
  const newPw = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;
  if (!current || !newPw || !confirm) { addToast('Please fill all password fields', 'error'); return; }
  if (newPw !== confirm) { addToast('Passwords do not match', 'error'); return; }
  if (newPw.length < 8) { addToast('Password must be at least 8 characters', 'error'); return; }
  
  try {
    const isAssistant = String(state.currentUserRole || '').toLowerCase() === 'assistant';
    const res = await fetch(isAssistant ? 'api/users.php?action=change-own-password' : 'api/users.php?action=reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.adminId || 1,
        target_type: 'user',
        current_password: current,
        new_password: newPw
      })
    });
    if (res.ok) {
      addToast('Password changed successfully!');
      document.getElementById('change-password-section').classList.add('hidden');
      document.getElementById('profile-primary-view')?.classList.remove('hidden');
      document.getElementById('modal')?.classList.remove('change-password-modal');
      const title = document.getElementById('modal-title');
      const role = normalizeRole(state.currentUserRole || state.currentUser?.role || 'supervisor');
      if (title) title.textContent = `${role.charAt(0).toUpperCase()}${role.slice(1)} Profile`;
      document.getElementById('current-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
    } else {
      const data = await res.json();
      addToast(data.error || 'Failed to change password', 'error');
    }
  } catch (err) {
    console.error('Error changing password:', err);
    addToast('Network error while changing password', 'error');
  }
}
