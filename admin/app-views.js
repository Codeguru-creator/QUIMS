function updateAssistantTicketCount(assigneeId, status, change) {
  if (assigneeId === null || assigneeId === undefined || assigneeId === '') return;
  const assistant = state.assistants.find(item => Number(item.id) === Number(assigneeId));
  if (!assistant) return;
  const key = String(status).toLowerCase() === 'resolved' ? 'completed' : 'pending';
  assistant[key] = Math.max(0, Number(assistant[key] || 0) + change);
}

function upsertTicketInState(ticket) {
  if (!ticket) return;
  const savedTicket = {
    ...ticket,
    assignee: ticket.assignee === null || ticket.assignee === undefined || ticket.assignee === ''
      ? null
      : Number(ticket.assignee)
  };
  const existingTicket = state.tickets.find(item => String(item.id) === String(savedTicket.id));
  if (existingTicket) updateAssistantTicketCount(existingTicket.assignee, existingTicket.status, -1);
  updateAssistantTicketCount(savedTicket.assignee, savedTicket.status, 1);
  state.tickets = [savedTicket, ...state.tickets.filter(item => String(item.id) !== String(savedTicket.id))];
  state.ticketsError = '';
}

function removeTicketFromState(ticketId) {
  const existingTicket = state.tickets.find(item => String(item.id) === String(ticketId));
  if (existingTicket) updateAssistantTicketCount(existingTicket.assignee, existingTicket.status, -1);
  state.tickets = state.tickets.filter(item => String(item.id) !== String(ticketId));
}

function renderTeam(container) {
  const selectedAssistant = state.assistants.find(a => a.id === state.selectedAssistantId);
  const orderedAssistants = [...state.assistants].sort((a, b) => {
    const rank = { admin: 0, supervisor: 1, assistant: 2 };
    return (rank[String(a.role).toLowerCase()] ?? 3) - (rank[String(b.role).toLowerCase()] ?? 3) || String(a.name).localeCompare(String(b.name));
  });
  container.innerHTML = `
    <div class="space-y-6">
      <div class="team-header">
        <h3><i data-lucide="users" style="width:24px;height:24px;color:var(--emerald-600)"></i> Team Overview</h3>
        <button class="team-add-btn" onclick="openAddAssistantModal()"><i data-lucide="plus" style="width:20px;height:20px"></i></button>
      </div>
      <div class="team-layout">
        <div class="team-cards-area">
          <div class="team-cards-grid">
            ${orderedAssistants.map(a => assistantCardHtml(a)).join('')}
          </div>
        </div>
        <div class="team-panel-area">
          ${selectedAssistant ? assignmentPanelHtml(selectedAssistant) : `
            <div class="team-placeholder">
              <i data-lucide="mouse-pointer-click" style="width:28px;height:28px;color:var(--slate-300)"></i>
              <span style="font-size:.85rem;color:var(--slate-500);font-weight:500">Select an assistant card to view details and assign tasks</span>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function renderAssignments(container) {
  const assignedTickets = state.tickets.filter(t => t.assignee != null && t.assignee !== '');
  const unassignedTickets = state.tickets.filter(t => t.assignee == null || t.assignee === '');

  const assignmentRows = assignedTickets.length > 0 ? assignedTickets.map(t => {
    const assistant = state.assistants.find(a => Number(a.id) === Number(t.assignee));
    const pending = String(t.status).toLowerCase() !== 'resolved';
    return `
      <tr>
        <td class="mono">${esc(t.id)}</td>
        <td>${esc(t.date)}</td>
        <td>${esc(assistant ? assistant.name : getAssistantName(t.assignee))}</td>
        <td>${esc(t.type)}</td>
        <td>${esc(t.category || '-')}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(t.description)}">${esc(t.description)}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${pending ? '<span class="status-badge pending">Pending</span>' : '<span class="status-badge resolved">Resolved</span>'}</td>
        <td>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="openEditTicketModal('${t.id}')">Edit</button>
            <button class="btn btn-cancel btn-sm" onclick="openAssignModal(${Number(t.assignee)})">Reassign</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="9" class="empty-row" style="text-align:center;padding:32px;color:var(--slate-400)">No assigned tasks found.</td></tr>';

  const backlogRows = unassignedTickets.length > 0 ? unassignedTickets.map(t => `
    <tr>
      <td class="mono">${esc(t.id)}</td>
      <td>${esc(t.date)}</td>
      <td>${esc(t.type)}</td>
      <td>${esc(t.category || '-')}</td>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(t.description)}">${esc(t.description)}</td>
      <td>${statusBadge(t.status)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openAssignModal(${state.assistants.find(a => a.status !== 'disabled') ? state.assistants.find(a => a.status !== 'disabled').id : 0})">Assign</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7" class="empty-row" style="text-align:center;padding:26px;color:var(--slate-400)">No backlog items to assign.</td></tr>';

  container.innerHTML = `
    <div class="space-y-6">
      <div class="records-filter-bar" style="align-items:center;justify-content:space-between;">
        <div>
          <h2 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;color:var(--slate-800)"><i data-lucide="clipboard-list" style="width:20px;height:20px;color:var(--emerald-600)"></i> Assignment Overview</h2>
        </div>
        <div class="chip-row">
          <span class="status-badge info" style="background:var(--emerald-100);color:var(--emerald-700)">${assignedTickets.length} Assigned</span>
          <span class="status-badge info" style="background:var(--amber-100);color:var(--amber-700)">${unassignedTickets.length} Backlog</span>
        </div>
      </div>

      <div class="records-table-card">
        <div style="padding:14px 16px;border-bottom:1px solid var(--slate-200);display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <h3 style="margin:0;font-size:1rem;color:var(--slate-800)">Current Assignments</h3>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Assigned To</th>
                <th>Type</th>
                <th>Category</th>
                <th>Description</th>
                <th>Status</th>
                <th>Action</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>${assignmentRows}</tbody>
          </table>
        </div>
      </div>

      <div class="records-table-card">
        <div style="padding:14px 16px;border-bottom:1px solid var(--slate-200);display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <h3 style="margin:0;font-size:1rem;color:var(--slate-800)">Open Backlog</h3>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Description</th>
                <th>Status</th>
                <th>Assign</th>
              </tr>
            </thead>
            <tbody>${backlogRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function renderAssignmentsLegacyPlaceholder(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="records-filter-bar">
        <h2 style="margin:0">Assignments</h2>
      </div>
      <div class="records-table-card">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>Assigned To</th><th>Status</th><th>Action</th></tr></thead>
            <tbody><tr><td colspan="4" class="empty-row" style="text-align:center;padding:32px;color:var(--slate-400)">Assignments page ready.</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function assistantCardHtml(a) {
  const role = String(a.role || 'assistant').toLowerCase();
  const isAdmin = role === 'admin';
  const status = normalizeRole(a.status);
  const isDisabled = status === 'disabled';
  const isSelected = a.id === state.selectedAssistantId;
  const remainingTime = getAssistantRemainingTime(a);
  return `
    <div class="assistant-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled-look' : ''}" onclick="selectAssistant(${a.id})">
      <div class="assistant-card-bar ${isAdmin ? 'admin' : 'normal'}"></div>
      <div class="assistant-card-body">
        <div class="assistant-card-top">
          <div class="assistant-card-info">
            <div class="assistant-card-avatar">${getInitials(a.name)}</div>
            <div>
              <h3 class="assistant-card-name">${esc(a.name)}</h3>
              <div class="assistant-card-badges">
                <span class="role-badge ${isAdmin ? 'admin-role' : role === 'supervisor' ? 'supervisor-role' : 'assistant-role'}">${role === 'admin' ? 'Administrator' : role.charAt(0).toUpperCase() + role.slice(1)}</span>
                ${isDisabled ? '<span class="role-badge disabled-badge">DISABLED</span>' : ''}
              </div>
            </div>
          </div>
          <span class="status-indicator" title="${esc(getPresenceLabel(a))}" aria-label="${esc(getPresenceLabel(a))}">
            ${status === 'online' ? '<span class="ping"></span>' : ''}
            <span class="dot ${status}"></span>
          </span>
        </div>
        ${isDisabled && remainingTime ? `
          <div class="assistant-card-disabled-info">
            <i data-lucide="clock" style="width:14px;height:14px"></i>
            <span>Disabled for ${esc(a.disableDuration || '')} &bull; ${esc(remainingTime)}</span>
          </div>
        ` : ''}
        <div class="assistant-card-email">
          <i data-lucide="mail" style="width:16px;height:16px;color:var(--slate-400)"></i>
          <span>${esc(a.email)}</span>
        </div>
        <div class="assistant-card-stats">
          <div class="assistant-card-stat"><span class="assistant-card-stat-value resolved">${a.completed}</span><span class="assistant-card-stat-label resolved">Resolved</span></div>
          <div class="assistant-card-stat"><span class="assistant-card-stat-value pending-val">${a.pending}</span><span class="assistant-card-stat-label pending-val">Pending</span></div>
        </div>
      </div>
    </div>
  `;
}

function selectAssistant(id) {
  state.selectedAssistantId = state.selectedAssistantId === id ? null : id;
  renderContent();
}

function selectDrilldownAssistant(id) {
  state.selectedDrilldownAssistantId = id;
  renderContent();
}

function clearDrilldownAssistantSelection() {
  state.selectedDrilldownAssistantId = null;
  renderContent();
}

function assignmentPanelHtml(a) {
  const isAdminUser = a.id === state.adminId;
  const isDisabled = a.status === 'disabled';
  const canReceiveAssignments = String(a.role).toLowerCase() !== 'admin';
  const assistantTickets = state.tickets.filter(t => Number(t.assignee) === Number(a.id));
  const recentTickets = [...assistantTickets].reverse().slice(0, 3);
  const disableInfo = getDisableInfo(a);

  return `
    <div class="assignment-panel">
      <div class="assignment-panel-card ${isAdminUser ? 'admin-bg' : 'normal-bg'}">
        <div class="assignment-panel-header">
          <h3 class="assignment-panel-name ${isAdminUser ? 'admin-color' : 'normal-color'}">
            <i data-lucide="user-check" style="width:20px;height:20px"></i> ${esc(a.name)}
          </h3>
          <div class="assignment-panel-actions">
            <button class="panel-action-btn manage" onclick="openManageModal(${a.id})" title="Manage Profile"><i data-lucide="minus-circle" style="width:20px;height:20px"></i></button>
            ${canReceiveAssignments ? `<button class="panel-action-btn assign" onclick="openAssignModal(${a.id})" title="Assign Task" ${isDisabled ? 'disabled' : ''}><i data-lucide="plus" style="width:20px;height:20px"></i></button>` : ''}
            <button class="panel-close-btn" onclick="selectAssistant(${a.id})"><i data-lucide="x-circle" style="width:24px;height:24px"></i></button>
          </div>
        </div>
        <p class="panel-meta"><span class="panel-meta-role">${esc(a.role)}</span> <span style="color:var(--slate-400)">&bull;</span> <span>${esc(a.email)}</span></p>
        ${isDisabled && disableInfo ? `
          <div class="panel-disabled-banner">
            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
              <i data-lucide="clock" style="width:16px;height:16px;color:var(--red-600);margin-top:2px"></i>
              <div>
                <h4>Account Disabled</h4>
                <p>Reason: ${esc(disableInfo.reason || '')}</p>
              </div>
            </div>
            <div class="panel-disabled-grid">
              <div><span class="label">Total Time</span><p class="value">${esc(disableInfo.total || '')}</p></div>
              <div><span class="label">Remaining</span><p class="value">${esc(disableInfo.remaining || '')}</p></div>
            </div>
            <button class="btn btn-full btn-sm" style="margin-top:12px;background:#fff;border:1px solid var(--red-300);color:var(--red-700);font-weight:700" onclick="enableAssistant(${a.id})">
              <i data-lucide="check-circle" style="width:12px;height:12px"></i> Enable Account Now
            </button>
          </div>
        ` : ''}
        <div class="panel-stats">
          <div class="panel-stat-box"><span class="panel-stat-value resolved">${a.completed}</span><span class="panel-stat-label">Resolved</span></div>
          <div class="panel-stat-box"><span class="panel-stat-value pending-val">${a.pending}</span><span class="panel-stat-label">Pending</span></div>
        </div>
        <div class="panel-activity">
          <h5>Recent Activity</h5>
          <div class="panel-activity-list">
            ${recentTickets.length > 0 ? recentTickets.map(t => `
              <div class="panel-activity-item">
                <div class="panel-activity-item-top">
                  <span class="panel-activity-item-id">${esc(t.id)}</span>
                  <span class="panel-activity-item-status" style="background:${String(t.status).toLowerCase() === 'resolved' ? 'var(--green-100)' : 'var(--blue-100)'};color:${String(t.status).toLowerCase() === 'resolved' ? 'var(--green-700)' : 'var(--blue-700)'}">${esc(t.status)}</span>
                </div>
                <p class="panel-activity-item-desc">${esc(t.description)}</p>
              </div>
            `).join('') : '<p class="panel-empty">No recent assignments.</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ===== ADD ASSISTANT MODAL ===== */
function openAddAssistantModal() {
  const body = `
    <div style="display:flex;flex-direction:column;gap:10px;padding:0 8px 0 8px;box-sizing:border-box">
      <div style="max-width:95%;width:100%;margin:0 auto;display:flex;justify-content:center;padding:0 8px 0 8px;box-sizing:border-box">
        <div class="form-group" style="margin-bottom:0;width:100%"><label class="form-label">Full Name</label><input class="form-input form-input-sm" id="add-name" placeholder="John Doe" style="width:100%"></div>
      </div>
      <div style="max-width:95%;width:100%;margin:0 auto;display:flex;justify-content:center;padding:0 8px 0 8px;box-sizing:border-box">
        <div class="form-group" style="margin-bottom:0;width:100%"><label class="form-label">Email Address</label><input type="email" class="form-input form-input-sm" id="add-email" placeholder="john@example.com" autocomplete="email" required style="width:100%"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 8px 0 8px;box-sizing:border-box">
        <div class="form-group" style="margin-bottom:0"><label class="form-label">Password</label>
          <div style="position:relative">
            <input type="password" class="form-input form-input-sm" id="add-password" style="padding-right:36px;width:100%" placeholder="Min 6 chars">
            <button type="button" onclick="toggleAssistantPasswords(this)" aria-label="Show passwords" aria-pressed="false" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:var(--slate-400);padding:4px"><i data-lucide="eye" style="width:15px;height:15px"></i></button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0"><label class="form-label">Confirm Password</label>
          <div style="position:relative">
            <input type="password" class="form-input form-input-sm" id="add-confirm-password" style="padding-right:36px;width:100%" placeholder="Repeat password">
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 8px 0 8px;box-sizing:border-box">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="add-whatsapp">WhatsApp (10 digits)</label>
          <div style="display:flex;gap:6px">
            <input type="tel" class="form-input form-input-sm" id="add-whatsapp" placeholder="0771234567" inputmode="numeric" autocomplete="tel" maxlength="10" pattern="[0-9]{10}" required style="width:100%">
            <button type="button" class="btn btn-outline btn-sm" onclick="openAssistantWhatsAppCheck()" title="Open this number in WhatsApp" aria-label="Open WhatsApp to check this number"><i data-lucide="external-link" style="width:14px;height:14px"></i></button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0"><label class="form-label" for="add-phone">Phone (10 digits)</label><input type="tel" class="form-input form-input-sm" id="add-phone" placeholder="0771234567" inputmode="numeric" autocomplete="tel" maxlength="10" pattern="[0-9]{10}" required style="width:100%"></div>
      </div>
      <div style="max-width:70%;width:100%;padding:0 8px 0 8px;box-sizing:border-box">
        <div class="form-group" style="margin-bottom:0"><label class="form-label">Role</label>
          <select class="form-select form-select-sm" id="add-role" style="width:100%"><option value="Assistant">Assistant</option><option value="Supervisor">Supervisor</option><option value="Admin">Admin</option></select>
        </div>
      </div>
    </div>
  `;
  openModal('Add New Assistant', body, `
    <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="handleAddAssistant()">Add Member</button>
  `);
}

function togglePasswordField(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}" style="width:16px;height:16px"></i>`;
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function toggleAssistantPasswords(btn) {
  const passwordInputs = [
    document.getElementById('add-password'),
    document.getElementById('add-confirm-password')
  ].filter(Boolean);
  if (!passwordInputs.length) return;

  const showPasswords = passwordInputs[0].type === 'password';
  passwordInputs.forEach(input => {
    input.type = showPasswords ? 'text' : 'password';
  });
  btn.setAttribute('aria-pressed', String(showPasswords));
  btn.setAttribute('aria-label', showPasswords ? 'Hide passwords' : 'Show passwords');
  btn.innerHTML = `<i data-lucide="${showPasswords ? 'eye-off' : 'eye'}" style="width:16px;height:16px"></i>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAssistantWhatsAppCheck() {
  const whatsappInput = document.getElementById('add-whatsapp');
  const whatsapp = String(whatsappInput?.value || '').trim();
  if (!/^\d{10}$/.test(whatsapp)) {
    addToast('Enter a 10-digit WhatsApp number first.', 'error');
    whatsappInput?.focus();
    return;
  }

  const internationalNumber = `263${whatsapp.replace(/^0/, '')}`;
  window.open(`https://wa.me/${internationalNumber}`, '_blank', 'noopener,noreferrer');
}

async function handleAddAssistant() {
  const name = document.getElementById('add-name').value.trim();
  const email = document.getElementById('add-email').value.trim();
  const password = document.getElementById('add-password').value;
  const confirmPassword = document.getElementById('add-confirm-password').value;
  const whatsapp = document.getElementById('add-whatsapp').value.trim();
  const phone = document.getElementById('add-phone').value.trim();
  const role = document.getElementById('add-role').value;

  if (password !== confirmPassword) { addToast('Passwords do not match', 'error'); return; }
  if (!name || !email) { addToast('Name and Email are required', 'error'); return; }
  const emailInput = document.getElementById('add-email');
  if (!emailInput.checkValidity() || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,63}$/.test(email)) {
    addToast('Enter a valid email address with a complete domain.', 'error');
    emailInput.focus();
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    addToast('Phone number must contain exactly 10 digits.', 'error');
    document.getElementById('add-phone').focus();
    return;
  }
  if (!/^\d{10}$/.test(whatsapp)) {
    addToast('WhatsApp number must contain exactly 10 digits.', 'error');
    document.getElementById('add-whatsapp').focus();
    return;
  }

  try {
    const res = await fetch('../api/assistants.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, role, status: 'offline', completed: 0, pending: 0, whatsapp, phone, password })
    });

    const text = await res.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('Non-JSON response from /api/assistants:', text);
        throw new Error('Server returned a non-JSON response');
      }
    }

    if (res.ok) {
      if (!data.assistant || !data.user) {
        throw new Error('The server created the account but did not return its saved assistant and user records.');
      }
      state.assistants = [...state.assistants.filter(item => String(item.id) !== String(data.assistant.id)), data.assistant];
      state.assistants.sort((left, right) => String(left.name).localeCompare(String(right.name)));
      state.users = [...state.users.filter(item => String(item.id) !== String(data.user.id)), data.user];
      state.users.sort((left, right) => String(left.full_name || '').localeCompare(String(right.full_name || '')));
      closeModal();
      addToast(name + ' added to the team!');
      renderContent();
    } else {
      addToast(data.error || 'Failed to add assistant', 'error');
    }
  } catch (err) {
    console.error('Error adding assistant:', err);
    addToast('Network error while adding assistant. Check the backend and your session.', 'error');
  }
}

/* ===== ASSIGN MODAL ===== */
let assignModalMode = 'new';

function openAssignModal(assistantId) {
  assignModalMode = 'new';
  const backlogTickets = state.tickets.filter(t => t.assignee === null && t.status === 'Pending');
  const a = state.assistants.find(x => x.id === assistantId);
  const body = `
    <div class="space-y-4">
      <div class="assign-mode-tabs">
        <button class="assign-mode-tab active" id="assign-tab-new" onclick="switchAssignMode('new')">Create New</button>
        <button class="assign-mode-tab ${backlogTickets.length === 0 ? '' : ''}" id="assign-tab-backlog" onclick="switchAssignMode('backlog')" ${backlogTickets.length === 0 ? 'disabled' : ''}>From Backlog (${backlogTickets.length})</button>
      </div>
      <div id="assign-mode-content"></div>
    </div>
  `;
  openModal('Assign to ' + (a ? a.name : ''), body, `
    <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="handleAssignSubmit(${assistantId})">Assign Task</button>
  `);
  renderAssignModeContent(backlogTickets);
}

function switchAssignMode(mode) {
  assignModalMode = mode;
  document.getElementById('assign-tab-new').className = 'assign-mode-tab ' + (mode === 'new' ? 'active' : '');
  document.getElementById('assign-tab-backlog').className = 'assign-mode-tab ' + (mode === 'backlog' ? 'active' : '');
  renderAssignModeContent(state.tickets.filter(t => t.assignee === null && t.status === 'Pending'));
}

function renderAssignModeContent(backlogTickets) {
  const container = document.getElementById('assign-mode-content');
  if (!container) return;
  if (assignModalMode === 'new') {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="form-group"><label class="form-label">Issue Type</label>
          <select class="form-select form-select-sm" id="assign-type" onchange="onAssignTypeChange()">
            <option value="User Problem">User Problem</option><option value="IECMS">IECMS</option>
          </select>
        </div>
        <div id="assign-category-wrap" class="form-group"><label class="form-label">Category</label>
          <select class="form-select form-select-sm" id="assign-category"><option value="Hardware">Hardware</option><option value="Software">Software</option><option value="Other">Other</option></select>
        </div>
        <div id="assign-case-wrap" class="form-group hidden">
          <div style="padding:12px;background:var(--slate-50);border-radius:8px;border:1px solid var(--emerald-100)">
            <label class="form-label-sm" style="color:var(--emerald-600)">IECMS Case Number</label>
            <input class="form-input form-input-sm" id="assign-case" placeholder="Enter Case ID">
          </div>
        </div>
        <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea form-input-sm" id="assign-desc" rows="3" placeholder="Task details..."></textarea></div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="form-group"><label class="form-label">Select Ticket</label>
        <select class="form-select form-select-sm" id="assign-backlog-ticket">
          <option value="">Select a ticket...</option>
          ${backlogTickets.map(t => `<option value="${t.id}">[${t.id}] ${esc(t.description.substring(0, 40))}${t.description.length > 40 ? '...' : ''}</option>`).join('')}
        </select>
      </div>
    `;
  }
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function onAssignTypeChange() {
  const type = document.getElementById('assign-type').value;
  document.getElementById('assign-category-wrap').classList.toggle('hidden', type !== 'User Problem');
  document.getElementById('assign-case-wrap').classList.toggle('hidden', type !== 'IECMS');
}

async function handleAssignSubmit(assistantId) {
  if (assignModalMode === 'new') {
    const desc = document.getElementById('assign-desc').value.trim();
    if (!desc) return;
    const type = document.getElementById('assign-type').value;
    const category = type === 'User Problem' ? document.getElementById('assign-category').value : null;
    const caseNum = type === 'IECMS' ? (document.getElementById('assign-case').value || '') : '';
    const today = new Date().toISOString().split('T')[0];

    const ticketData = {
      date: today, assignedDate: today, resolvedDate: null,
      type, category, description: desc, assignee: assistantId,
      status: 'Pending', external: caseNum ? 'Case #' + caseNum : null,
      externalCause: null, adminConstraint: false
    };

    try {
      // 1. Create the ticket on the server
      const ticketRes = await fetch('../api/tickets.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketData)
      });
      if (!ticketRes.ok) {
        const errorResult = await ticketRes.json();
        throw new Error(errorResult.error || 'Failed to create ticket on server.');
      }
      const ticketResult = await ticketRes.json();
      const newId = ticketResult.ticket?.id;
      if (!ticketResult.ticket) throw new Error('The server did not return the saved task.');
      upsertTicketInState(ticketResult.ticket);
      addToast('New Task ' + newId + ' assigned');
      closeModal();
      renderContent();
    } catch (err) {
      console.error('Error in assigning new task:', err);
      addToast('Network error: ' + err.message, 'error');
    }
  } else {
    const ticketId = document.getElementById('assign-backlog-ticket').value;
    if (!ticketId) return;
    const today = new Date().toISOString().split('T')[0];

    try {
      // 1. Update the ticket assignee and status on the server
      const ticketRes = await fetch('../api/tickets.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ticketId,
          updates: { assignee: assistantId, status: 'Pending', assignedDate: today }
        })
      });
      if (!ticketRes.ok) {
        throw new Error('Failed to update ticket assignee on server.');
      }
      const assignmentResult = await ticketRes.json();
      if (!assignmentResult.ticket) throw new Error('The server did not return the updated task.');
      upsertTicketInState(assignmentResult.ticket);
      addToast('Backlog Task ' + ticketId + ' assigned');
      closeModal();
      renderContent();
    } catch (err) {
      console.error('Error in assigning backlog task:', err);
      addToast('Network error: ' + err.message, 'error');
    }
  }
}

/* ===== MANAGE MODAL ===== */
function openManageModal(assistantId) {
  const a = state.assistants.find(x => x.id === assistantId);
  if (!a) return;
  const isDisabled = a.status === 'disabled';
  const body = `
    <div class="space-y-4">
      ${isDisabled ? `
        <div class="manage-section enable">
          <h4>Account Currently Disabled</h4>
          <p>This account is disabled for ${esc(a.disableDuration || 'unknown')}. You can enable it immediately.</p>
          <button class="btn btn-green btn-full" onclick="enableAssistant(${a.id});closeModal()">Enable Account</button>
        </div>
      ` : `
        <div class="manage-section disable">
          <h4>Disable Profile</h4>
          <input class="manage-input amber" id="manage-disable-reason" placeholder="Reason for disabling">
          <input class="manage-input amber" id="manage-disable-duration" placeholder="Duration (e.g 7 days)">
          <button class="btn btn-amber btn-full" onclick="handleDisableAssistant(${a.id})">Disable Account</button>
        </div>
      `}
      <div class="manage-section delete">
        <h4>Delete Profile</h4>
        <input class="manage-input red" id="manage-delete-reason" placeholder="Reason for deletion">
        <button class="btn btn-danger btn-full" onclick="handleDeleteAssistant(${a.id})">Delete Permanently</button>
      </div>
    </div>
  `;
  openModal('Manage ' + a.name, body, null);
}

async function handleDisableAssistant(id) {
  if (id === state.adminId) { addToast('Cannot disable your own admin account!', 'error'); return; }
  const reason = document.getElementById('manage-disable-reason').value.trim();
  const duration = document.getElementById('manage-disable-duration').value.trim();
  if (!reason || !duration) return;

  try {
    const res = await fetch('../api/assistants.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        updates: {
          status: 'disabled',
          disabledAt: new Date().toISOString(),
          disableDuration: duration,
          disableReason: reason
        }
      })
    });
    if (res.ok) {
      await loadInitialData(false);
      closeModal();
      addToast('Assistant disabled successfully');
      renderContent();
    } else {
      const data = await res.json();
      addToast(data.error || 'Failed to disable assistant', 'error');
    }
  } catch (err) {
    console.error('Error disabling assistant:', err);
    addToast('Network error while disabling assistant', 'error');
  }
}

async function enableAssistant(id) {
  try {
    const res = await fetch('../api/assistants.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        updates: {
          status: 'offline',
          disabledAt: null,
          disableDuration: null,
          disableReason: null
        }
      })
    });
    if (res.ok) {
      await loadInitialData(false);
      addToast('Assistant enabled successfully');
      renderContent();
    } else {
      const data = await res.json();
      addToast(data.error || 'Failed to enable assistant', 'error');
    }
  } catch (err) {
    console.error('Error enabling assistant:', err);
    addToast('Network error while enabling assistant', 'error');
  }
}

async function handleDeleteAssistant(id) {
  if (id === state.adminId) { addToast('Cannot delete your own admin account!', 'error'); return; }
  const reason = document.getElementById('manage-delete-reason').value.trim();
  if (!reason) return;

  try {
    const res = await fetch('../api/assistants.php', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      await loadInitialData(false);
      state.selectedAssistantId = null;
      closeModal();
      addToast('Assistant deleted successfully');
      renderContent();
    } else {
      const data = await res.json();
      addToast(data.error || 'Failed to delete assistant', 'error');
    }
  } catch (err) {
    console.error('Error deleting assistant:', err);
    addToast('Network error while deleting assistant', 'error');
  }
}

/* ===== REGISTER FORM ===== */
function renderRegister(container) {
  state.virtualSessionApproved = false; // Reset approval state on form render
  state.pcopyingApproved = false; // Reset approval state on form render
  state.verifiedVirtualSessionName = '';
  state.verifiedPCopyingName = '';
  container.innerHTML = `
    <div class="register-card" style="max-width:800px">
      <h2>Register New Ticket</h2>
      <form id="register-form" onsubmit="handleRegisterSubmit(event)" class="space-y-4">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="reg-type" onchange="onRegTypeChange()">
              <option value="User Problem">User Problem</option>
              <option value="IECMS">IECMS</option>
              <option value="P/COPYING">P/COPYING</option>
              <option value="Virtual Sessions">Virtual Sessions</option>
            </select>
          </div>
          <div class="form-group" id="reg-category-wrap">
            <label class="form-label">Category</label>
            <select class="form-select" id="reg-category">
              <option value="Hardware">Hardware</option>
              <option value="Software">Software</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div id="reg-pcopying-wrap" class="hidden">
          <div class="special-section blue">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Quantity</label>
                <input type="number" class="form-input" id="reg-quantity" min="1" placeholder="Enter quantity">
              </div>
              <div class="form-group">
                <label class="form-label">Staff Details</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <input class="form-input" id="reg-staff-details" placeholder="Staff name / ID" style="padding-right: 44px; width: 100%;" oninput="validateStaffDetailsInput()">
                  <button type="button" onclick="verifyPasskey('pcopying')" class="sig-verify-btn" style="position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: var(--emerald-600); display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;" title="Verify Passkey">
                    <i data-lucide="key" style="width: 18px; height: 18px;"></i>
                  </button>
                </div>
                <p id="reg-staff-status" style="font-size: 11.5px; font-weight: 600; margin-top: 4px; color: #ef4444; display: none;"></p>
              </div>
            </div>
          </div>
        </div>
        <div id="reg-iecms-wrap" class="hidden">
          <div class="special-section emerald">
            <div class="form-grid">
              <div class="form-group"><label class="form-label">IECMS Case Number</label><input class="form-input" id="reg-case" placeholder="Case ID"></div>
              <div class="form-group" id="reg-resolution-wrap"><label class="form-label">Resolution (if closing)</label><input class="form-input" id="reg-resolution" placeholder="Resolution details"></div>
            </div>
          </div>
        </div>
        <div id="reg-virtual-sessions-wrap" class="hidden">
          <div class="special-section teal">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Session Date</label>
                <input type="date" class="form-input" id="reg-vs-date">
              </div>
              <div class="form-group">
                <label class="form-label">Start Time</label>
                <input type="time" class="form-input" id="reg-vs-start-time">
              </div>
              <div class="form-group">
                <label class="form-label">End Time</label>
                <input type="time" class="form-input" id="reg-vs-end-time">
              </div>
              <div class="form-group">
                <label class="form-label">Held At</label>
                <input type="text" class="form-input" id="reg-vs-held-at" placeholder="Location">
              </div>
              <div class="form-group">
                <label class="form-label">Case Number</label>
                <input type="text" class="form-input" id="reg-vs-case" placeholder="Case ID">
              </div>
              <div class="form-group">
                <label class="form-label">Presiding Judge</label>
                <input type="text" class="form-input" id="reg-vs-judge" placeholder="Judge name">
              </div>
              <div class="form-group" style="grid-column: span 2;">
                <label class="form-label">Comments</label>
                <select class="form-select" id="reg-vs-comment-select" onchange="onVsCommentChange()">
                  <option value="">Select comment outcome</option>
                  <option value="Successful">Successful</option>
                  <option value="Unsuccessful">Unsuccessful</option>
                  <option value="Successful but poor network connection">Successful but poor network connection</option>
                  <option value="Unsuccessful due to poor network connection">Unsuccessful due to poor network connection</option>
                  <option value="Unsuccessful due to cancellation">Unsuccessful due to cancellation</option>
                  <option value="custom">Custom</option>
                </select>
                <div id="reg-vs-custom-comment-wrap" class="hidden" style="position:relative;margin-top:10px;">
                  <textarea class="form-textarea" id="reg-vs-custom-comment" rows="3" maxlength="3500" placeholder="Enter a custom comment..." oninput="updateVsCommentCount()"></textarea>
                  <span id="reg-vs-comment-count" style="position:absolute;right:10px;bottom:8px;font-size:11px;color:var(--slate-400);">0/500 words</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Supported By (Current User)</label>
                <input type="text" class="form-input" id="reg-vs-supported-by" readonly placeholder="Auto-filled">
              </div>
              <div class="form-group">
                <label class="form-label">Representative Signature</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <input type="text" class="form-input" id="reg-vs-signature" placeholder="Signature" style="padding-right: 44px; width: 100%;" oninput="validateVsSignatureInput()">
                  <button type="button" onclick="verifyPasskey('vs')" class="sig-verify-btn" style="position: absolute; right: 8px; z-index: 2; background: none; border: none; cursor: pointer; color: var(--emerald-600); display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;" title="Verify Passkey">
                    <i data-lucide="key" style="width: 18px; height: 18px;"></i>
                  </button>
                </div>
                <p id="reg-vs-status" style="font-size: 11.5px; font-weight: 600; margin-top: 4px; color: #ef4444; display: none;"></p>
              </div>
            </div>
          </div>
        </div>
        <div id="reg-ftu-wrap" class="hidden">
          <div class="special-section blue" style="border-left: 4px solid var(--amber-500); background-color: var(--amber-50); margin-top: 12px; margin-bottom: 12px; border-color: var(--amber-200);">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" class="form-checkbox" id="reg-is-ftu" onchange="onRegFTUChange(event)">
              <span class="form-label" style="margin-bottom:0;font-weight:600;color:var(--slate-800)">First Time User (FTU)?</span>
            </label>
          </div>
        </div>
        <div class="form-group" id="reg-desc-wrap">
          <label class="form-label">Description</label>
          <div class="text-desc-relative" style="position: relative;">
            <textarea class="form-textarea" id="reg-desc" rows="3" placeholder="Issue details..."></textarea>
            <button type="button" id="reg-ai-btn" class="ai-btn" onclick="handleAIGenerate()" title="Ask Gemini AI for Suggestion">
              <i data-lucide="sparkles" style="width:18px;height:18px"></i>
            </button>
          </div>
          <div id="reg-ai-suggestion" class="hidden" aria-live="polite" style="margin-top:8px;padding:12px;border:1px solid var(--slate-200);border-radius:8px;background:var(--slate-50);white-space:pre-wrap">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center">
              <img src="../background.jpg" alt="Judicial Service Commission logo" style="width:96px;height:96px;object-fit:contain">
              <strong>QUIMS HELPDESK</strong>
            </div>
            <div id="reg-ai-suggestion-text" class="ai-response-scroll" style="margin-top:6px"></div>
          </div>
        </div>
        <div class="form-group hidden" id="reg-pcopying-desc-wrap">
          <label class="form-label">Description (Purpose)</label>
          <select class="form-select" id="reg-pcopying-desc-select" onchange="onPCopyingDescChange()">
            <option value="Printing purposes">Printing purposes</option>
            <option value="custom">Custom</option>
          </select>
          <div id="reg-pcopying-custom-desc-wrap" class="hidden" style="margin-top: 10px;">
            <label class="form-label" style="font-size: 13.5px; opacity: 0.9;">Custom Description</label>
            <textarea class="form-textarea" id="reg-pcopying-custom-desc" rows="3" placeholder="Describe details for custom..."></textarea>
          </div>
        </div>
        <div class="form-group" id="reg-assignee-wrap">
          <label class="form-label">Assign To</label>
          <select class="form-select assignee-select" id="reg-assignee" onchange="onRegAssigneeChange()" size="1">
            <option value="">-- Unassigned --</option>
            ${state.currentUser?.assistant_id ? `<option value="${Number(state.currentUser.assistant_id)}">${esc(state.currentUserName || 'My account')} (Myself)</option>` : ''}
            ${state.assistants.filter(a => String(a.role).toLowerCase() !== 'admin' && a.status !== 'disabled').map(a => `<option value="${a.id}">${esc(a.name)} (${esc(a.role)})</option>`).join('')}
          </select>
        </div>
        <div id="reg-external-wrap" class="hidden">
          <div class="special-section slate">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px">
              <input type="checkbox" class="form-checkbox" id="reg-is-external" onchange="onRegExternalChange()">
              <span class="form-label" style="margin-bottom:0">Requires External Vendor?</span>
            </label>
            <div id="reg-external-fields" class="hidden space-y-4" style="margin-top:12px">
              <div class="form-group"><label class="form-label-sm">Cause of External Help</label><input class="form-input form-input-sm" id="reg-ext-cause" placeholder="e.g. Motherboard failure"></div>
              <div class="form-group"><label class="form-label-sm">Person/Vendor doing it</label><input class="form-input form-input-sm" id="reg-ext-person" placeholder="Vendor Name"></div>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;padding-top:16px">
          <button type="submit" class="btn btn-primary btn-full btn-lg" id="reg-submit-btn">Create Ticket (Backlog)</button>
        </div>
      </form>
    </div>
  `;
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  // Pre-fill supported by field with current user's name
  const supportedByField = document.getElementById('reg-vs-supported-by');
  if(supportedByField) supportedByField.value = state.currentUserName || '';
  ['reg-vs-date', 'reg-vs-start-time', 'reg-vs-end-time', 'reg-vs-held-at', 'reg-vs-case', 'reg-vs-judge', 'reg-vs-comment-select', 'reg-vs-signature'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.addEventListener('input', updateRegSubmitBtn);
    if (field) field.addEventListener('change', updateRegSubmitBtn);
  });
}

function getVsComment() {
  const selected = document.getElementById('reg-vs-comment-select')?.value || '';
  return selected === 'custom' ? (document.getElementById('reg-vs-custom-comment')?.value.trim() || '') : selected;
}

function onVsCommentChange() {
  const selected = document.getElementById('reg-vs-comment-select')?.value || '';
  document.getElementById('reg-vs-custom-comment-wrap')?.classList.toggle('hidden', selected !== 'custom');
  updateVsCommentCount();
  updateRegSubmitBtn();
}

function updateVsCommentCount() {
  const field = document.getElementById('reg-vs-custom-comment');
  const counter = document.getElementById('reg-vs-comment-count');
  if (!field || !counter) return;
  const words = field.value.trim() ? field.value.trim().split(/\s+/) : [];
  if (words.length > 500) field.value = words.slice(0, 500).join(' ');
  const count = field.value.trim() ? field.value.trim().split(/\s+/).length : 0;
  counter.textContent = `${count}/500 words`;
  counter.style.color = count >= 500 ? 'var(--red-600)' : 'var(--slate-400)';
}

function onPCopyingDescChange() {
  const selectVal = document.getElementById('reg-pcopying-desc-select').value;
  const customWrap = document.getElementById('reg-pcopying-custom-desc-wrap');
  if (customWrap) {
    customWrap.classList.toggle('hidden', selectVal !== 'custom');
  }
}

function onRegTypeChange() {
  const type = document.getElementById('reg-type').value;
  const isPCopying = type === 'P/COPYING';
  const isVirtualSessions = type === 'Virtual Sessions';
  document.getElementById('reg-category-wrap').classList.toggle('hidden', type !== 'User Problem');
  document.getElementById('reg-pcopying-wrap').classList.toggle('hidden', !isPCopying);
  document.getElementById('reg-iecms-wrap').classList.toggle('hidden', isPCopying || type !== 'IECMS');
  document.getElementById('reg-virtual-sessions-wrap').classList.toggle('hidden', !isVirtualSessions);
  document.getElementById('reg-desc-wrap').classList.toggle('hidden', isVirtualSessions || isPCopying);
  
  // Clear other sections' error messages and values when switching to keep things clean
  const staffInput = document.getElementById('reg-staff-details');
  if (staffInput) staffInput.value = '';
  const staffStatus = document.getElementById('reg-staff-status');
  if (staffStatus) {
    staffStatus.textContent = '';
    staffStatus.style.display = 'none';
  }

  const vsSigInput = document.getElementById('reg-vs-signature');
  if (vsSigInput) vsSigInput.value = '';
  const vsCommentSelect = document.getElementById('reg-vs-comment-select');
  if (vsCommentSelect) vsCommentSelect.value = '';
  const vsCustomComment = document.getElementById('reg-vs-custom-comment');
  if (vsCustomComment) vsCustomComment.value = '';
  const vsCustomCommentWrap = document.getElementById('reg-vs-custom-comment-wrap');
  if (vsCustomCommentWrap) vsCustomCommentWrap.classList.add('hidden');
  const vsStatus = document.getElementById('reg-vs-status');
  if (vsStatus) {
    vsStatus.textContent = '';
    vsStatus.style.display = 'none';
  }

  const pcopyDescWrap = document.getElementById('reg-pcopying-desc-wrap');
  if (pcopyDescWrap) {
    pcopyDescWrap.classList.toggle('hidden', !isPCopying);
    const dSelect = document.getElementById('reg-pcopying-desc-select');
    if (dSelect) dSelect.value = 'Printing purposes';
    onPCopyingDescChange();
  }
  
  document.getElementById('reg-assignee-wrap').classList.toggle('hidden', isPCopying || isVirtualSessions);
  document.getElementById('reg-external-wrap').classList.add('hidden');
  document.getElementById('reg-ai-btn').classList.toggle('hidden', type === 'IECMS' || isPCopying || isVirtualSessions);
  
  const ftuWrap = document.getElementById('reg-ftu-wrap');
  if (ftuWrap) {
    ftuWrap.classList.toggle('hidden', !isPCopying && !isVirtualSessions);
    const ftuCheckbox = document.getElementById('reg-is-ftu');
    if (ftuCheckbox) ftuCheckbox.checked = false;
  }
  
  state.virtualSessionApproved = false;
  state.pcopyingApproved = false;
  updateRegSubmitBtn();
}

function onRegAssigneeChange() {
  const assignee = document.getElementById('reg-assignee') ? document.getElementById('reg-assignee').value : '';
  const type = document.getElementById('reg-type').value;
  const isPCopying = type === 'P/COPYING';
  const extWrap = document.getElementById('reg-external-wrap');
  if (extWrap) extWrap.classList.toggle('hidden', !assignee);
  const resWrap = document.getElementById('reg-resolution-wrap');
  if (resWrap) resWrap.classList.toggle('hidden', !!assignee);
  updateRegSubmitBtn();
}



function onRegExternalChange() {
  const checked = document.getElementById('reg-is-external').checked;
  document.getElementById('reg-external-fields').classList.toggle('hidden', !checked);
}

function updateRegSubmitBtn() {
  const type = document.getElementById('reg-type').value;
  const assignee = document.getElementById('reg-assignee') ? document.getElementById('reg-assignee').value : '';
  const isExternal = document.getElementById('reg-is-external') ? document.getElementById('reg-is-external').checked : false;
  const btn = document.getElementById('reg-submit-btn');
  if (!btn) return;

  btn.disabled = false;
  if (type === 'P/COPYING') {
    btn.textContent = 'Submit Record';
    btn.disabled = !state.pcopyingApproved;
  } else if (type === 'Virtual Sessions') {
    btn.textContent = 'Submit Virtual Session';
    const requiredIds = ['reg-vs-date', 'reg-vs-start-time', 'reg-vs-end-time', 'reg-vs-held-at', 'reg-vs-case', 'reg-vs-judge', 'reg-vs-signature'];
    const fieldsComplete = requiredIds.every(id => document.getElementById(id)?.value.trim());
    btn.disabled = !state.virtualSessionApproved || !fieldsComplete || !getVsComment();
  } else {
    if (!assignee && !isExternal) btn.textContent = 'Create Ticket (Backlog)';
    else btn.textContent = 'Submit Record';
  }
}

async function handleAIGenerate() {
  const desc = document.getElementById('reg-desc');
  if (!desc || !desc.value.trim()) { addToast('Enter description first', 'error'); return; }
  const marker = '\n\nAI RESPONSE:\n';
  const markerIndex = desc.value.indexOf(marker);
  const originalPrompt = (markerIndex >= 0 ? desc.value.slice(0, markerIndex) : desc.value).trim();
  const btn = document.getElementById('reg-ai-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width:18px;height:18px"></i>';
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  try {
    const response = await fetch('../api/gemini.php?action=generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: originalPrompt })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Server returned HTTP ${response.status}`);
    }
    if (data.error) {
      throw new Error(data.error);
    }

    if (data.text) {
      if (markerIndex >= 0) desc.value = originalPrompt;
      const suggestion = document.getElementById('reg-ai-suggestion');
      const suggestionText = document.getElementById('reg-ai-suggestion-text');
      if (!suggestion || !suggestionText) throw new Error('AI suggestion area is unavailable.');
      suggestionText.textContent = data.text.trim();
      suggestion.classList.remove('hidden');
      addToast('AI suggestion generated for reference; it is not included in the record.');
    } else {
      throw new Error("Empty response received from server");
    }
  } catch (error) {
    console.error('Gemini Generate Error:', error);
    addToast(error.message || 'Could not fetch AI suggestion.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="sparkles" style="width:18px;height:18px"></i>';
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

/* ===== FTU AND PASSKEY SIGNATURE AUTHORIZATION ===== */
function onRegFTUChange(e) {
  if (e.target.checked) {
    openFTUModal();
  }
}

function openFTUModal(prefillName = state.currentUser?.full_name || state.currentUserName || '') {
  const currentName = String(state.currentUser?.full_name || state.currentUserName || '').trim();
  const useCurrentName = !prefillName || prefillName.trim().toLowerCase() === currentName.toLowerCase();
  const initialMode = useCurrentName ? 'current' : 'custom';
  const initialName = useCurrentName ? currentName : prefillName.trim();
  const bodyHtml = `
    <div class="space-y-4" style="color: var(--slate-800)">
      <p style="font-size: 14px; color: var(--slate-600); margin-bottom: 16px;">
        Register a representative signature passkey. Names are matched without regard to capitalization or outer spaces.
      </p>
      <div class="form-group" style="margin-bottom: 14px;">
        <label class="form-label" style="font-weight: 500;">Signer</label>
        <select class="form-input" id="ftu-name-mode" onchange="onFTUNameModeChange()">
          <option value="current" ${initialMode === 'current' ? 'selected' : ''}>Current User</option>
          <option value="custom" ${initialMode === 'custom' ? 'selected' : ''}>Custom</option>
        </select>
        <input type="text" class="form-input" id="ftu-name" value="${esc(initialName)}" placeholder="Enter full name" style="width: 100%; margin-top: 8px;" ${initialMode === 'current' ? 'readonly' : ''} oninput="validateFTU()">
        <p id="ftu-name-status" style="font-size: 11.5px; font-weight: 600; margin-top: 4px; color: #64748b;">${initialMode === 'current' ? 'Using your signed-in account name.' : 'Enter the signer’s full name.'}</p>
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label class="form-label" for="ftu-national-id" style="font-weight: 500;">National ID</label>
        <input type="text" class="form-input" id="ftu-national-id" maxlength="14" minlength="8" pattern="[A-Za-z0-9]{8,14}" autocomplete="off" placeholder="e.g. 12345678A12" oninput="validateFTU()">
        <p style="font-size: 11.5px; color: #64748b; margin-top: 4px;">Use 8 to 14 letters and numbers, including at least one of each.</p>
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label class="form-label" style="font-weight: 500;">Password / Passkey</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input type="password" class="form-input" id="ftu-password" placeholder="Create high-strength passkey (e.g. k5678)" style="width: 100%; padding-right: 44px;" oninput="validateFTU()">
          <button type="button" onclick="togglePasswordVisibility('ftu-password', 'ftu-eye-icon')" style="position: absolute; right: 12px; background: none; border: none; cursor: pointer; color: var(--slate-400); display: flex; align-items: center;" aria-label="Toggle password visibility">
            <i data-lucide="eye" id="ftu-eye-icon" style="width: 20px; height: 20px;"></i>
          </button>
        </div>
        <p id="ftu-req-hint" style="font-size: 11.5px; font-weight: 600; color: #ef4444; margin-top: 4px;">Requirement: 1 or 2 letters and at least 4 digits (max 8 digits)</p>
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label class="form-label" style="font-weight: 500;">Confirm Password / Passkey</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input type="password" class="form-input" id="ftu-confirm-password" placeholder="Confirm your passkey" style="width: 100%; padding-right: 44px;" oninput="validateFTU()">
          <button type="button" onclick="togglePasswordVisibility('ftu-confirm-password', 'ftu-confirm-eye-icon')" style="position: absolute; right: 12px; background: none; border: none; cursor: pointer; color: var(--slate-400); display: flex; align-items: center;" aria-label="Toggle password visibility">
            <i data-lucide="eye" id="ftu-confirm-eye-icon" style="width: 20px; height: 20px;"></i>
          </button>
        </div>
        <p id="ftu-match-status" class="hidden" style="font-size: 13px; font-weight: 600; margin-top: 6px;"></p>
      </div>
      <p id="ftu-error-msg" class="hidden" style="color: #ef4444; font-size: 13px; font-weight: 500; margin-top: 8px;"></p>
    </div>
  `;
  
  const footerHtml = `
    <div style="display: flex; gap: 12px; justify-content: flex-end; width: 100%;">
      <button class="btn btn-outline" onclick="cancelFTU()" style="padding: 8px 16px;">Cancel</button>
      <button id="ftu-confirm-btn" class="btn btn-primary" onclick="confirmFTU()" style="padding: 8px 16px;" disabled>Confirm</button>
    </div>
  `;
  
  openModal("FTU Credentials Registration", bodyHtml, footerHtml);
}

function onFTUNameModeChange() {
  const modeInput = document.getElementById('ftu-name-mode');
  const nameInput = document.getElementById('ftu-name');
  const status = document.getElementById('ftu-name-status');
  if (!modeInput || !nameInput) return;
  const isCurrent = modeInput.value === 'current';
  nameInput.readOnly = isCurrent;
  nameInput.value = isCurrent
    ? String(state.currentUser?.full_name || state.currentUserName || '').trim()
    : '';
  if (status) {
    status.textContent = isCurrent ? 'Using your signed-in account name.' : 'Enter the signer’s full name.';
    status.style.color = '#64748b';
  }
  validateFTU();
}

function validateStaffDetailsInput() {
  const staffInput = document.getElementById('reg-staff-details');
  const staffStatus = document.getElementById('reg-staff-status');
  if (!staffInput) return false;

  const nameVal = staffInput.value;

  const trimmedName = nameVal.trim();
  const isNameValid = trimmedName.length > 0;
  if (state.pcopyingApproved && trimmedName.toLowerCase() !== state.verifiedPCopyingName.toLowerCase()) {
    state.pcopyingApproved = false;
    state.verifiedPCopyingName = '';
  }

  if (staffStatus) {
    if (!trimmedName) {
      staffStatus.textContent = 'Please enter staff details';
      staffStatus.style.color = '#ef4444';
      staffStatus.style.display = 'block';
    } else if (!isNameValid) {
      staffStatus.textContent = 'Enter a signer name.';
      staffStatus.style.color = '#ef4444';
      staffStatus.style.display = 'block';
    } else {
      staffStatus.textContent = 'Staff details format satisfies criteria';
      staffStatus.style.color = '#10b981';
      staffStatus.style.display = 'block';
    }
  }
  return isNameValid;
}

function validateVsSignatureInput() {
  const sigInput = document.getElementById('reg-vs-signature');
  const sigStatus = document.getElementById('reg-vs-status');
  if (!sigInput) return false;

  const nameVal = sigInput.value;

  const trimmedName = nameVal.trim();
  const isNameValid = trimmedName.length > 0;
  if (state.virtualSessionApproved && trimmedName.toLowerCase() !== state.verifiedVirtualSessionName.toLowerCase()) {
    state.virtualSessionApproved = false;
    state.verifiedVirtualSessionName = '';
  }

  if (sigStatus) {
    if (!trimmedName) {
      sigStatus.textContent = 'Please enter signature details';
      sigStatus.style.color = '#ef4444';
      sigStatus.style.display = 'block';
    } else if (!isNameValid) {
      sigStatus.textContent = 'Enter a signer name.';
      sigStatus.style.color = '#ef4444';
      sigStatus.style.display = 'block';
    } else {
      sigStatus.textContent = 'Signature details format satisfies criteria';
      sigStatus.style.color = '#10b981';
      sigStatus.style.display = 'block';
    }
  }
  return isNameValid;
}


function validateFTU() {
  const nameInput = document.getElementById('ftu-name');
  const nationalIdInput = document.getElementById('ftu-national-id');
  const pwdInput = document.getElementById('ftu-password');
  const confirmPwdInput = document.getElementById('ftu-confirm-password');
  const confirmBtn = document.getElementById('ftu-confirm-btn');
  const nameStatus = document.getElementById('ftu-name-status');
  const reqHint = document.getElementById('ftu-req-hint');
  const matchStatus = document.getElementById('ftu-match-status');

  if (!nameInput || !nationalIdInput || !pwdInput || !confirmPwdInput || !confirmBtn) return;

  const nameVal = nameInput.value;

  // 2. Intercept and limit to max 8 digits for Password inputs with clean cursor maintenance
  const enforceDigitLimit = (inputEl) => {
    if (!inputEl) return;
    let val = inputEl.value;
    let digitsCount = 0;
    let cleanVal = '';
    let selectionStart = inputEl.selectionStart;
    let selectionEnd = inputEl.selectionEnd;
    let excludedAt = [];

    for (let i = 0; i < val.length; i++) {
      let char = val[i];
      if (/\d/.test(char)) {
        if (digitsCount < 8) {
          cleanVal += char;
          digitsCount++;
        } else {
          excludedAt.push(i);
        }
      } else {
        cleanVal += char;
      }
    }

    if (val !== cleanVal) {
      inputEl.value = cleanVal;
      let offset = excludedAt.filter(idx => idx < selectionStart).length;
      inputEl.setSelectionRange(selectionStart - offset, selectionEnd - offset);
    }
  };
  enforceDigitLimit(pwdInput);
  enforceDigitLimit(confirmPwdInput);

  const pwdVal = pwdInput.value;
  const confirmPwdVal = confirmPwdInput.value;

  // 3. Validate the account name before server-side account matching.
  const trimmedName = nameVal.trim();
  const isNameValid = trimmedName.length > 0;
  if (nameStatus) {
    if (isNameValid) {
      nameStatus.textContent = 'Name satisfies criteria';
      nameStatus.style.color = '#10b981'; // Green color
      nameInput.style.borderColor = '#10b981';
      nameInput.style.backgroundColor = '#f0fdf4';
    } else {
      nameStatus.textContent = 'Enter a signer name.';
      nameStatus.style.color = '#ef4444'; // Red color yes
      if (trimmedName) {
        nameInput.style.borderColor = '#ef4444';
        nameInput.style.backgroundColor = '#fef2f2';
      } else {
        nameInput.style.borderColor = '';
        nameInput.style.backgroundColor = '';
      }
    }
  }

  // 4. Validate Passkey requirement: 1 or 2 letters, and at least 4 digits (max 8 digits)
  const lettersMatch = pwdVal.match(/[a-zA-Z]/g) || [];
  const lettersCount = lettersMatch.length;
  const digitsMatch = pwdVal.match(/\d/g) || [];
  const digitsCount = digitsMatch.length;

  const isPasskeyValid = (lettersCount >= 1 && lettersCount <= 2) && (digitsCount >= 4 && digitsCount <= 8);

  if (reqHint) {
    if (isPasskeyValid) {
      reqHint.textContent = 'Requirement: 1 or 2 letters and at least 4 digits (max 8 digits)';
      reqHint.style.color = '#10b981'; // Green color
      pwdInput.style.borderColor = '#10b981';
      pwdInput.style.backgroundColor = '#f0fdf4';
    } else {
      reqHint.textContent = 'Requirement: 1 or 2 letters and at least 4 digits (max 8 digits)';
      reqHint.style.color = '#ef4444'; // Red color yes
      if (pwdVal) {
        pwdInput.style.borderColor = '#ef4444';
        pwdInput.style.backgroundColor = '#fef2f2';
      } else {
        pwdInput.style.borderColor = '';
        pwdInput.style.backgroundColor = '';
      }
    }
  }

  // Helper to safely set input visibility & update lucide icons
  const setInputVisibility = (inputEl, iconId, visible) => {
    if (!inputEl) return;
    inputEl.type = visible ? 'text' : 'password';
    const iconEl = document.getElementById(iconId);
    if (iconEl) {
      iconEl.setAttribute('data-lucide', visible ? 'eye-off' : 'eye');
    }
  };

  // 5. Match Check
  let isMatch = false;
  if (!confirmPwdVal) {
    if (matchStatus) {
      matchStatus.textContent = '';
      matchStatus.classList.add('hidden');
    }
    confirmPwdInput.style.borderColor = '';
    confirmPwdInput.style.backgroundColor = '';
  } else {
    isMatch = (pwdVal === confirmPwdVal);
    if (matchStatus) {
      if (isMatch) {
        matchStatus.textContent = 'Passwords match';
        matchStatus.style.color = '#10b981'; // Green color
        confirmPwdInput.style.borderColor = '#10b981';
        confirmPwdInput.style.backgroundColor = '#f0fdf4';
        
        // Hide/mask password since they are correct and matched
        setInputVisibility(pwdInput, 'ftu-eye-icon', false);
        setInputVisibility(confirmPwdInput, 'ftu-confirm-eye-icon', false);
      } else {
        matchStatus.textContent = 'Passwords do not match';
        matchStatus.style.color = '#ef4444'; // Red color yes
        confirmPwdInput.style.borderColor = '#ef4444';
        confirmPwdInput.style.backgroundColor = '#fef2f2';

        // Automatically show passkeys so the user can see their mismatch
        setInputVisibility(pwdInput, 'ftu-eye-icon', true);
        setInputVisibility(confirmPwdInput, 'ftu-confirm-eye-icon', true);
      }
      matchStatus.classList.remove('hidden');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  }

  // 6. Enforce confirm button constraints
  const isValid = isNameValid && isValidNationalIdInput(nationalIdInput.value) && isPasskeyValid && isMatch;
  confirmBtn.disabled = !isValid;
}

function isValidNationalIdInput(value) {
  return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,14}$/.test(String(value || '').trim());
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (input && icon) {
    if (input.type === 'password') {
      input.type = 'text';
      icon.setAttribute('data-lucide', 'eye-off');
    } else {
      input.type = 'password';
      icon.setAttribute('data-lucide', 'eye');
    }
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

function cancelFTU() {
  const check = document.getElementById('reg-is-ftu');
  if (check) check.checked = false;
  state.ftuReturnContext = null;
  closeModal();
}

async function confirmFTU() {
  const nameInput = document.getElementById('ftu-name');
  const nationalIdInput = document.getElementById('ftu-national-id');
  const pwdInput = document.getElementById('ftu-password');
  const confirmPwdInput = document.getElementById('ftu-confirm-password');
  const errEl = document.getElementById('ftu-error-msg');
  
  if (errEl) {
    errEl.classList.add('hidden');
    errEl.textContent = '';
    errEl.style.color = '#ef4444';
  }

  const name = nameInput ? nameInput.value.trim() : '';
  const nationalId = nationalIdInput ? nationalIdInput.value.trim() : '';
  const mode = document.getElementById('ftu-name-mode')?.value || 'current';
  const pwd = pwdInput ? pwdInput.value : '';
  const confirmPwd = confirmPwdInput ? confirmPwdInput.value : '';

  if (!name || !pwd || !confirmPwd || !isValidNationalIdInput(nationalId)) {
    const msg = 'Enter the signer name, a valid National ID (8–14 letters and numbers), and both passkey fields';
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    }
    addToast(msg, 'error');
    return;
  }

  const hasLetter = /[a-zA-Z]/.test(pwd);
  const digitCount = (pwd.match(/\d/g) || []).length;
  const hasFourDigits = digitCount >= 4;

  if (!hasLetter || !hasFourDigits) {
    const msg = 'Passkey must contain at least 1 letter and at least 4 digits (e.g., a1234)';
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.color = '#ef4444'; // Red color yes
      errEl.classList.remove('hidden');
    }
    addToast(msg, 'error');
    return;
  }

  if (pwd !== confirmPwd) {
    const msg = 'Passwords / Passkeys do not match';
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.color = '#ef4444'; // Red color yes
      errEl.classList.remove('hidden');
    }
    addToast(msg, 'error');
    return;
  }

  try {
    const res = await fetch('../api/passkeys.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'register', mode, name, national_id: nationalId, password: pwd })
    });
    const responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Passkey service returned an invalid response (${res.status}).`);
    }
    if (!res.ok || data.success !== true) {
      const message = data.error || 'Failed to save signer to General Users.';
      if (errEl) {
        errEl.textContent = message;
        errEl.classList.remove('hidden');
      }
      addToast(message, 'error');
      return;
    }
    const returnContext = state.ftuReturnContext;
    state.ftuReturnContext = null;
    await loadInitialData(false);
    addToast('Passkey registered successfully');
    closeModal();
    if (returnContext) await verifyPasskey(returnContext);
  } catch (err) {
    console.error('Error registering passkey:', err);
    const message = err instanceof Error ? err.message : 'Unable to save signer to General Users.';
    if (errEl) {
      errEl.textContent = message;
      errEl.classList.remove('hidden');
    }
    addToast(message, 'error');
  }
}

function showDisappearingFtuMessage(el, isModal = false) {
  if (!el) return;
  addToast('First-time user? Check the "First-time user (FTU)" option to register a new signature and passkey.', 'warning');
  
  const oldText = el.textContent;
  const oldColor = el.style.color;
  const oldDisplay = el.style.display;
  const wasHidden = el.classList.contains('hidden');

  el.textContent = 'If you are a first-time user, please create an FTU account first';
  el.style.color = '#4f46e5'; // high contrast Indigo-600
  el.style.fontWeight = '600';
  if (isModal) {
    el.classList.remove('hidden');
  } else {
    el.style.display = 'block';
  }

  setTimeout(() => {
    el.textContent = oldText;
    el.style.color = oldColor;
    if (isModal) {
      if (wasHidden) {
        el.classList.add('hidden');
      }
    } else {
      el.style.display = oldDisplay;
    }
  }, 6000);
}

async function lookupSignatureSigner(name, statusElement) {
  try {
    const response = await fetch('../api/passkeys.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'lookup', name })
    });
    const responseText = await response.text();
    let signer;
    try {
      signer = JSON.parse(responseText);
    } catch {
      throw new Error(response.status >= 500
        ? 'The server could not complete the signature lookup. Ask an administrator to check the PHP error log and database schema.'
        : 'The signature service returned an invalid response. Please try again or contact an administrator.');
    }
    if (!response.ok) throw new Error(signer.error || 'Signature lookup failed');

    if (!signer.exists) {
      throw new Error('No registered signature matches this name. Check the spelling or contact an administrator to verify the signer account.');
    }

    if (!signer.passkey_registered) {
      const ownName = String(state.currentUser?.full_name || state.currentUserName || '').trim().toLowerCase();
      const signerName = String(signer.name || name).trim().toLowerCase();
      if (ownName && ownName === signerName) {
        state.ftuReturnContext = state.verificationContext;
        if (statusElement) {
          statusElement.textContent = 'No passkey is registered for your account. Register your FTU passkey to continue.';
          statusElement.style.color = '#b45309';
          statusElement.style.display = 'block';
        }
        openFTUModal(signer.name || name);
      } else {
        throw new Error('This signer has no registered passkey. Contact an administrator to register one.');
      }
      return false;
    }
    return true;
  } catch (error) {
    const message = location.protocol === 'file:'
      ? 'Open the dashboard through http://localhost/iecms/index.html so the signature can be checked.'
      : !navigator.onLine
        ? 'No network connection. Reconnect and try again.'
        : (error.message || 'Unable to check this signature right now. Please try again.');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.style.color = '#ef4444';
      statusElement.style.display = 'block';
    }
    addToast(message, 'error');
    return false;
  }
}

async function verifyPasskey(context) {
  state.verificationContext = context || 'vs';

  if (state.verificationContext === 'pcopying') {
    const isStaffValid = validateStaffDetailsInput();
    if (!isStaffValid) {
      const staffInput = document.getElementById('reg-staff-details');
      const trimmedName = staffInput ? staffInput.value.trim() : '';
      if (!trimmedName) {
        addToast('Please enter Staff Details first.', 'error');
      } else {
        addToast('Enter a signer name.', 'error');
      }
      return;
    }

    const staffInput = document.getElementById('reg-staff-details');
    const trimmedName = staffInput ? staffInput.value.trim() : '';

    if (!await lookupSignatureSigner(trimmedName, document.getElementById('reg-staff-status'))) return;
  } else if (state.verificationContext === 'vs') {
    const isVsValid = validateVsSignatureInput();
    const vsInput = document.getElementById('reg-vs-signature');
    const trimmedName = vsInput ? vsInput.value.trim() : '';
    if (!isVsValid) {
      addToast(trimmedName ? 'Enter a signer name.' : 'Please enter the registered signer name.', 'error');
      return;
    }
    if (!await lookupSignatureSigner(trimmedName, document.getElementById('reg-vs-status'))) return;
  }

  const bodyHtml = `
    <div class="space-y-4" style="color: var(--slate-800)">
      <p style="font-size: 14px; color: var(--slate-600); margin-bottom: 16px;">
        This signature is registered. Enter its passkey to authorize this session.
      </p>
      <div class="form-group">
        <label class="form-label" style="font-weight: 500;">Enter Passkey</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input type="password" class="form-input" id="verification-passkey" placeholder="Enter your passkey" style="width: 100%; padding-right: 44px;" oninput="validateVerificationPasskey()">
          <button type="button" onclick="togglePasswordVisibility('verification-passkey', 'verify-eye-icon')" style="position: absolute; right: 12px; background: none; border: none; cursor: pointer; color: var(--slate-400); display: flex; align-items: center;" aria-label="Toggle password visibility">
            <i data-lucide="eye" id="verify-eye-icon" style="width: 20px; height: 20px;"></i>
          </button>
        </div>
      </div>
      <p id="verify-error-msg" class="hidden" style="color: #ef4444; font-size: 13px; font-weight: 500; margin-top: 8px;"></p>
    </div>
  `;
  
  const footerHtml = `
    <div style="display: flex; gap: 12px; justify-content: flex-end; width: 100%;">
      <button class="btn btn-outline" onclick="closeModal()" style="padding: 8px 16px;">Cancel</button>
      <button id="verify-submit-btn" class="btn btn-primary" onclick="submitPasskeyVerification()" style="padding: 8px 16px;" disabled>Verify</button>
    </div>
  `;
  
  const titleText = state.verificationContext === 'pcopying' ? "Authorizing Staff Details" : "Authorizing Virtual Session";
  openModal(titleText, bodyHtml, footerHtml);
}

function validateVerificationPasskey() {
  const inputEl = document.getElementById('verification-passkey');
  const verifyBtn = document.getElementById('verify-submit-btn');
  const errEl = document.getElementById('verify-error-msg');

  if (!inputEl) return;

  // Realtime digit limit to max 8 digits
  let val = inputEl.value;
  let digitsCount = 0;
  let cleanVal = '';
  let selectionStart = inputEl.selectionStart;
  let selectionEnd = inputEl.selectionEnd;
  let excludedAt = [];

  for (let i = 0; i < val.length; i++) {
    let char = val[i];
    if (/\d/.test(char)) {
      if (digitsCount < 8) {
        cleanVal += char;
        digitsCount++;
      } else {
        excludedAt.push(i);
      }
    } else {
      cleanVal += char;
    }
  }

  if (val !== cleanVal) {
    inputEl.value = cleanVal;
    let offset = excludedAt.filter(idx => idx < selectionStart).length;
    inputEl.setSelectionRange(selectionStart - offset, selectionEnd - offset);
  }

  const currentVal = inputEl.value;
  const targetFieldName = state.verificationContext === 'pcopying' ? 'reg-staff-details' : 'reg-vs-signature';
  const targetField = document.getElementById(targetFieldName);
  const enteredName = targetField ? targetField.value.trim() : '';

  // Empty field: remove text warning and disable button
  if (!currentVal) {
    if (errEl) {
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }
    if (verifyBtn) {
      verifyBtn.disabled = true;
    }
    return;
  }

  // Format validations: should not have more than 2 letters, less than 4 digits, or more than 8 digits
  const lettersMatch = currentVal.match(/[a-zA-Z]/g) || [];
  const lettersCount = lettersMatch.length;
  const digitsMatch = currentVal.match(/\d/g) || [];
  const actualDigitsCount = digitsMatch.length;

  const isPasskeyValid = (lettersCount >= 1 && lettersCount <= 2) && (actualDigitsCount >= 4 && actualDigitsCount <= 8);

  if (!isPasskeyValid) {
    if (errEl) {
      let unmet = [];
      if (lettersCount < 1 || lettersCount > 2) unmet.push('1 or 2 letters');
      if (actualDigitsCount < 4 || actualDigitsCount > 8) unmet.push('at least 4 digits (max 8)');
      errEl.textContent = 'Passkey requirement unmet: ' + unmet.join(' and ');
      errEl.style.color = '#ef4444';
      errEl.classList.remove('hidden');
    }
    if (verifyBtn) {
      verifyBtn.disabled = true;
    }
  } else {
    if (errEl) {
      errEl.textContent = 'Checking passkey...';
      errEl.style.color = 'var(--slate-500)';
      errEl.classList.remove('hidden');
    }
    if (verifyBtn) {
      verifyBtn.disabled = true;
    }
    const requestId = (state.passkeyValidationRequest || 0) + 1;
    state.passkeyValidationRequest = requestId;
    fetch('../api/passkeys.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'verify', name: enteredName, password: currentVal })
    }).then(async response => {
      const data = await response.json();
      if (state.passkeyValidationRequest !== requestId || !inputEl.isConnected) return;
      if (response.ok && data.success) {
        errEl.classList.add('hidden');
        errEl.textContent = '';
        verifyBtn.disabled = false;
      } else {
        errEl.textContent = data.error === 'Incorrect passkey'
          ? 'Incorrect passkey. Contact an administrator if you need help.'
          : (data.error || 'Unable to verify this passkey. Contact an administrator.');
        errEl.style.color = '#ef4444';
        errEl.classList.remove('hidden');
        verifyBtn.disabled = true;
      }
    }).catch(() => {
      if (state.passkeyValidationRequest !== requestId || !inputEl.isConnected) return;
      errEl.textContent = 'Unable to verify passkey. Please try again.';
      errEl.style.color = '#ef4444';
      errEl.classList.remove('hidden');
      verifyBtn.disabled = true;
    });
  }
}

async function submitPasskeyVerification() {
  const inputEl = document.getElementById('verification-passkey');
  const errEl = document.getElementById('verify-error-msg');
  
  if (errEl) {
    errEl.classList.add('hidden');
    errEl.textContent = '';
  }

  if (!inputEl) return;
  const entered = inputEl.value.trim();
  
  if (!entered) {
    const msg = 'Please enter your passkey to continue';
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.color = '#ef4444';
      errEl.classList.remove('hidden');
    }
    addToast(msg, 'error');
    return;
  }

  const targetFieldName = state.verificationContext === 'pcopying' ? 'reg-staff-details' : 'reg-vs-signature';
  const targetField = document.getElementById(targetFieldName);
  const enteredName = targetField ? targetField.value.trim() : '';

  if (!navigator.onLine) {
    const msg = 'No network connection. Reconnect and try again.';
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.color = '#ef4444';
      errEl.classList.remove('hidden');
    }
    addToast(msg, 'error');
    return;
  }

  try {
    const response = await fetch('../api/passkeys.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'verify', name: enteredName, password: entered })
    });
    const data = await response.json();
    if (response.ok && data.success === true) {
      state.failedAttempts = 0;
      approveSignature(data.name || enteredName);
      return;
    }
    state.failedAttempts = (state.failedAttempts || 0) + 1;
    const msg = data.error === 'Incorrect passkey'
      ? 'Incorrect passkey. Contact an administrator if you need help.'
      : (data.error || 'Unable to verify this passkey. Contact an administrator.');
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.color = '#ef4444';
      errEl.classList.remove('hidden');
    }
    addToast(msg, 'error');
  } catch (error) {
    const msg = 'Unable to verify passkey right now. Contact an administrator if this continues.';
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    }
    addToast(msg, 'error');
  }
}

function showPasskeyPassScreen(name) {
  const labelText = state.verificationContext === 'pcopying' ? 'P/COPYING Record Submission' : 'Virtual Session Submission';
  const bodyHtml = `
    <div style="text-align: center; padding: 24px 0; color: var(--slate-800)">
      <div style="width: 64px; height: 64px; background-color: var(--emerald-100); color: var(--emerald-600); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
        <i data-lucide="check-circle" style="width: 36px; height: 36px;"></i>
      </div>
      <h4 style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--slate-900);">Authorization Successful</h4>
      <p style="font-size: 14px; color: var(--slate-600); margin-bottom: 16px;">
        Authenticated as: <strong style="color: var(--slate-900); font-size: 16px;">${esc(name)}</strong>
      </p>
      <p style="font-size: 13px; color: var(--slate-500);">
        Click Continue to enable submission for this ${labelText}.
      </p>
    </div>
  `;
  
  const footerHtml = `
    <div style="display: flex; justify-content: center; width: 100%;">
      <button class="btn btn-primary" onclick="approveSignature(\`${esc(name).replace(/'/g, "\\'")}\`)" style="padding: 10px 24px;">Continue</button>
    </div>
  `;
  
  openModal("Signature Authorized", bodyHtml, footerHtml);
}

function approveSignature(name) {
  if (state.verificationContext === 'pcopying') {
    state.pcopyingApproved = true;
    state.verifiedPCopyingName = name.trim();
    const staffField = document.getElementById('reg-staff-details');
    if (staffField) {
      staffField.value = name;
    }
    addToast(`Staff details authorized as ${name}`);
  } else {
    state.virtualSessionApproved = true;
    state.verifiedVirtualSessionName = name.trim();
    const sigField = document.getElementById('reg-vs-signature');
    if (sigField) {
      sigField.value = name;
    }
    addToast(`Authorized as ${name}`);
  }
  closeModal();
  updateRegSubmitBtn();
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const type = document.getElementById('reg-type').value;
  const isPCopying = type === 'P/COPYING';
  const isVS = type === 'Virtual Sessions';
  
  if (isVS && (!state.virtualSessionApproved || state.verifiedVirtualSessionName.toLowerCase() !== document.getElementById('reg-vs-signature').value.trim().toLowerCase())) {
    addToast('Security Signature Required: Please verify your Passkey first.', 'error');
    return;
  }
  if (isPCopying && (!state.pcopyingApproved || state.verifiedPCopyingName.toLowerCase() !== document.getElementById('reg-staff-details').value.trim().toLowerCase())) {
    addToast('Security Signature Required: Please verify Staff Details Passkey first.', 'error');
    return;
  }

  // Thorough Input Validation
  if (type === 'User Problem' || type === 'Query') {
    const desc = document.getElementById('reg-desc').value.trim();
    if (!desc) {
      addToast('Description is required.', 'error');
      return;
    }
  }

  if (type === 'IECMS') {
    const caseNum = document.getElementById('reg-case').value.trim();
    if (!caseNum) {
      addToast('IECMS Case Number is required.', 'error');
      return;
    }
    const desc = document.getElementById('reg-desc').value.trim();
    if (!desc) {
      addToast('Description is required.', 'error');
      return;
    }
  }

  if (type === 'P/COPYING') {
    const qty = document.getElementById('reg-quantity').value;
    if (!qty || Number(qty) <= 0) {
      addToast('Quantity is required and must be greater than 0.', 'error');
      return;
    }
    const staff = document.getElementById('reg-staff-details').value.trim();
    if (!staff) {
      addToast('Staff details / ID is required.', 'error');
      return;
    }
    const pcopySelect = document.getElementById('reg-pcopying-desc-select').value;
    if (pcopySelect === 'custom') {
      const customDesc = document.getElementById('reg-pcopying-custom-desc') ? document.getElementById('reg-pcopying-custom-desc').value.trim() : '';
      if (!customDesc) {
        addToast('Custom purpose description is required.', 'error');
        return;
      }
    }
  }

  if (type === 'Virtual Sessions') {
    const vsDate = document.getElementById('reg-vs-date').value;
    const vsStart = document.getElementById('reg-vs-start-time').value;
    const vsEnd = document.getElementById('reg-vs-end-time').value;
    const vsHeldAt = document.getElementById('reg-vs-held-at').value.trim();
    const vsCase = document.getElementById('reg-vs-case').value.trim();
    const vsJudge = document.getElementById('reg-vs-judge').value.trim();
    const vsComments = getVsComment();
    const vsSig = document.getElementById('reg-vs-signature').value.trim();

    if (!vsDate || !vsStart || !vsEnd || !vsHeldAt || !vsCase || !vsJudge || !vsComments || !vsSig) {
      addToast('All Virtual Sessions fields are required.', 'error');
      return;
    }
  }

  const category = type === 'User Problem' ? document.getElementById('reg-category').value : null;
  
  let description = '';
  if (isVS) {
    const vsDate = document.getElementById('reg-vs-date').value;
    const vsStart = document.getElementById('reg-vs-start-time').value;
    const vsEnd = document.getElementById('reg-vs-end-time').value;
    const vsHeldAt = document.getElementById('reg-vs-held-at').value;
    const vsComments = getVsComment();
    const vsJudge = document.getElementById('reg-vs-judge').value;
    const vsSig = document.getElementById('reg-vs-signature').value;
    description = `Virtual Session on ${vsDate} (${vsStart} - ${vsEnd}) held at ${vsHeldAt}. Judge: ${vsJudge}. Comments: ${vsComments}. Signed by: ${vsSig}`;
  } else if (isPCopying) {
    const pcopySelect = document.getElementById('reg-pcopying-desc-select').value;
    if (pcopySelect === 'custom') {
      description = document.getElementById('reg-pcopying-custom-desc').value.trim() || 'Custom';
    } else {
      description = pcopySelect;
    }
  } else {
    description = document.getElementById('reg-desc').value.split('\n\nAI RESPONSE:\n')[0].trim();
  }
  
  const assigneeEl = document.getElementById('reg-assignee');
  const assignee = isPCopying || isVS
    ? String(state.currentUser?.assistant_id || '')
    : (assigneeEl ? assigneeEl.value : '');
  const isExternal = document.getElementById('reg-is-external') ? document.getElementById('reg-is-external').checked : false;
  const externalCause = isExternal ? (document.getElementById('reg-ext-cause').value.trim()) : '';
  const externalPerson = isExternal ? (document.getElementById('reg-ext-person').value.trim()) : '';
  const caseNumber = type === 'IECMS' ? (document.getElementById('reg-case').value.trim()) : '';
  const resolution = type === 'IECMS' && !assignee ? (document.getElementById('reg-resolution').value.trim()) : '';
  const quantity = isPCopying ? (document.getElementById('reg-quantity').value || null) : null;

  const today = new Date().toISOString().split('T')[0];
  const assigneeId = assignee ? parseInt(assignee) : null;
  let status = 'Pending';
  if (isVS) status = 'Resolved';
  if (resolution && type === 'IECMS') status = 'Resolved';

  const staffDetails = isPCopying ? (document.getElementById('reg-staff-details') ? document.getElementById('reg-staff-details').value.trim() : '') : '';

  const ticketData = {
    date: today, assignedDate: assigneeId ? today : null,
    resolvedDate: status === 'Resolved' ? today : null, type, category,
    description, quantity: isPCopying && quantity ? Number(quantity) : null,
    assignee: assigneeId, status,
    external: isExternal ? externalPerson : caseNumber ? 'Case #' + caseNumber : null,
    externalCause: isExternal ? externalCause : resolution || null,
    staffDetails: staffDetails || null,
    adminConstraint: false
  };

  try {
    // 1. Submit the ticket to the real server database
    const ticketRes = await fetch('../api/tickets.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticketData)
    });
    if (!ticketRes.ok) {
      throw new Error('Failed to create ticket on server.');
    }
    const ticketResult = await ticketRes.json();
    if (!ticketResult.ticket) throw new Error('The server did not return the saved record.');
    const newId = ticketResult.ticket.id;
    const savedStatus = ticketResult.ticket.status;

    // 2. Generate a real backend notification for this creation event
    const notifType = savedStatus === 'Resolved' ? 'success' : 'info';
    const notifTitle = savedStatus === 'Resolved' ? 'Ticket Resolved' : 'Ticket Created';
    const notifMessage = savedStatus === 'Resolved'
      ? `Ticket ${newId} (${type}) has been successfully registered and resolved.` 
      : `Ticket ${newId} (${type}) has been successfully created in the backlog.`;
    
    const notifRes = await fetch('../api/notifications.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: notifTitle,
        message: notifMessage,
        createdAt: new Date().toISOString(),
        type: notifType,
        read: false
      })
    });
    if (!notifRes.ok) {
      throw new Error('Failed to create notification on server.');
    }

    upsertTicketInState(ticketResult.ticket);
    void loadNotifications({ render: true });
    addToast('Ticket ' + newId + ' registered successfully!');

    if (window.VSP_STANDALONE) {
      state.activeTab = 'register';
      renderContent();
    } else {
      state.activeTab = 'records';
      renderSidebar();
      renderContent();
    }
  } catch (err) {
    console.error('Error registering ticket:', err);
    addToast(err instanceof Error ? err.message : 'Unable to register ticket. Please try again.', 'error');
  }
}

/* ===== RECORDS TABLE ===== */
function renderRecords(container) {
  const isAssistant = String(state.currentUserRole || '').toLowerCase() === 'assistant';
  if (state.ticketsError) {
    container.innerHTML = `
      <div class="records-table-card" role="alert" style="padding:24px;border:1px solid var(--red-200);border-radius:12px;color:var(--red-700);">
        <strong>Master Records could not be loaded.</strong>
        <p style="margin:8px 0 16px">${esc(state.ticketsError)}</p>
        <button type="button" class="btn btn-outline" onclick="loadInitialData(false)">Retry</button>
      </div>
    `;
    return;
  }
  const filteredTickets = state.tickets.filter(t => {
    const filterText = String(state.filter.text || '').toLowerCase();
    const textMatch = String(t.id || '').toLowerCase().includes(filterText) || String(t.description || '').toLowerCase().includes(filterText);
    const typeMatch = state.filter.type === 'All' || t.type === state.filter.type;
    const ticketDate = new Date(t.date);
    const startDate = new Date(state.filter.start);
    const endDate = new Date(state.filter.end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    return textMatch && typeMatch && ticketDate >= startDate && ticketDate <= endDate;
  });
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const aVal = a[state.sort.key] || '';
    const bVal = b[state.sort.key] || '';
    const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    return state.sort.dir === 'asc' ? cmp : -cmp;
  });

  const sortIcon = (key) => {
    if (state.sort.key !== key) return '<i data-lucide="chevrons-up-down" style="width:16px;height:16px;color:var(--slate-400)"></i>';
    return state.sort.dir === 'asc'
      ? '<i data-lucide="arrow-up" style="width:16px;height:16px;color:var(--emerald-600)"></i>'
      : '<i data-lucide="arrow-down" style="width:16px;height:16px;color:var(--emerald-600)"></i>';
  };

  const tableBodyRows = sortedTickets.length > 0 
    ? sortedTickets.map((t, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : 'var(--slate-50)'}">
          <td style="font-family:monospace;font-size:.75rem;font-weight:700;color:var(--emerald-700)">${esc(t.id)}</td>
          <td style="color:var(--slate-600);white-space:nowrap">${esc(t.date)}</td>
          <td style="color:var(--slate-600);white-space:nowrap">${esc(t.resolvedDate || '-')}</td>
          <td style="font-weight:500;color:var(--slate-800)">${esc(t.assignee_name || getAssistantName(t.assignee))}</td>
          <td style="color:var(--slate-600);white-space:nowrap">${esc(t.type)}</td>
          <td style="color:var(--slate-500)">${esc(t.category || '-')}</td>
          <td style="color:var(--slate-600);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.description)}">${esc(t.description)}</td>
          <td style="color:var(--slate-600);text-align:center">${t.quantity !== null && t.quantity !== undefined ? t.quantity : '-'}</td>
          <td style="color:var(--slate-700);font-weight:500">${esc(getRepresentativeSignature(t))}</td>
          <td style="font-size:.75rem">${t.external ? `<span style="font-weight:700;color:var(--slate-700)">${esc(t.external)}</span>${t.externalCause ? '<br><span style="color:var(--slate-400);font-style:italic">' + esc(t.externalCause) + '</span>' : ''}` : '-'}</td>
          <td><input type="checkbox" class="master-record-history-toggle" data-ticket-id="${esc(t.id)}" aria-label="Include change history for ${esc(t.id)}" onchange="togglePrintHistoryForTicket(this.dataset.ticketId, this.checked)" ${isPrintHistoryIncluded(t.id) ? 'checked' : ''}></td>
          <td>${statusBadge(t.status)}</td>
          <td>
            <div style="display:flex;gap:6px;align-items:center;">
              <button class="btn btn-primary btn-sm" onclick="openEditTicketModal('${esc(t.id)}')" title="Edit Ticket" style="padding:6px 10px;"><i data-lucide="edit" style="width:14px;height:14px"></i></button>
              <button class="btn btn-danger btn-sm" onclick="confirmDeleteTicket('${esc(t.id)}')" title="Delete Ticket" style="padding:6px 10px;"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
            </div>
            ${t.edited_by ? `<div style="font-size:.68rem;color:var(--slate-400);margin-top:4px;">Edited by ${esc(t.edited_by)}${t.edited_at ? ` on ${esc(t.edited_at)}` : ''}</div>` : ''}
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="${isAssistant ? 12 : 13}" style="text-align:center;padding:48px;color:var(--slate-400)"><i data-lucide="inbox" style="width:32px;height:32px;margin:0 auto 12px;color:var(--slate-300)"></i>No master records found matching the filters</td></tr>`;

  container.innerHTML = `
    <div class="space-y-6">
      <div class="records-filter-bar">
        <input id="records-search-input" class="form-input" style="max-width:280px" placeholder="Search ticket number or description" value="${esc(state.filter.text)}" oninput="updateRecordsFilter('text', this.value)">
        <select class="form-select" style="max-width:180px" onchange="updateRecordsFilter('type', this.value)">
          <option value="All" ${state.filter.type === 'All' ? 'selected' : ''}>All Types</option>
          <option value="User Problem" ${state.filter.type === 'User Problem' ? 'selected' : ''}>User Problem</option>
          <option value="IECMS" ${state.filter.type === 'IECMS' ? 'selected' : ''}>IECMS</option>
          <option value="P/COPYING" ${state.filter.type === 'P/COPYING' ? 'selected' : ''}>P/COPYING</option>
          <option value="Virtual Sessions" ${state.filter.type === 'Virtual Sessions' ? 'selected' : ''}>Virtual Sessions</option>
        </select>
        <input type="date" class="form-input" value="${state.filter.start}" onchange="updateRecordsFilter('start', this.value)">
        <input type="date" class="form-input" value="${state.filter.end}" onchange="updateRecordsFilter('end', this.value)">
        <div class="records-filter-actions">
          <button class="btn btn-danger" onclick="openPrintPreview()" title="Print all records matching the active filters">
            <i data-lucide="printer" style="width:20px;height:20px"></i> Print Preview
          </button>
        </div>
      </div>
      <div class="records-table-card">
        <div class="table-wrapper">
          <table id="records-table">
            <thead>
              <tr>
                <th onclick="handleRecordsSort('id')"><div class="th-inner">ID ${sortIcon('id')}</div></th>
                <th onclick="handleRecordsSort('date')"><div class="th-inner">Date Raised ${sortIcon('date')}</div></th>
                <th onclick="handleRecordsSort('resolvedDate')"><div class="th-inner">Resolved Date ${sortIcon('resolvedDate')}</div></th>
                <th onclick="handleRecordsSort('assignee')"><div class="th-inner">Assignee ${sortIcon('assignee')}</div></th>
                <th onclick="handleRecordsSort('type')"><div class="th-inner">Type ${sortIcon('type')}</div></th>
                <th>Category</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Representative Signature</th>
                <th>Ext. Info</th>
                <th><label class="master-record-history-label"><input type="checkbox" id="master-record-history-all" onchange="setPrintHistoryForMasterRecords(this.checked)"> Include History</label></th>
                <th onclick="handleRecordsSort('status')"><div class="th-inner">Status ${sortIcon('status')}</div></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tableBodyRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  syncPrintHistoryControls();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function renderContentKeepingInputFocus(inputId) {
  const input = document.getElementById(inputId);
  if (!input) {
    renderContent();
    return;
  }
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  renderContent();
  const refreshedInput = document.getElementById(inputId);
  if (!refreshedInput) return;
  refreshedInput.replaceWith(input);
  input.focus({ preventScroll: true });
  if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

function updateRecordsFilter(key, value) {
  state.filter[key] = value;
  if (key === 'text') {
    renderContentKeepingInputFocus('records-search-input');
  } else {
    renderContent();
  }
}

function handleRecordsSort(key) {
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort = { key, dir: 'desc' };
  }
  renderContent();
}

async function confirmDeleteTicket(id) {
  if (confirm('Delete Ticket ' + id + '?')) {
    await deleteTicket(id);
  }
}

async function deleteTicket(id) {
  try {
    const res = await fetch('../api/tickets.php', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      removeTicketFromState(id);
      addToast('Ticket ' + id + ' deleted');
      renderContent();
    } else {
      const data = await res.json();
      addToast(data.error || 'Failed to delete ticket', 'error');
    }
  } catch (err) {
    console.error('Error deleting ticket:', err);
    addToast('Network error while deleting ticket', 'error');
  }
}

/* ===== EDIT TICKET MODAL ===== */
function openEditTicketModal(id) {
  const t = state.tickets.find(x => x.id === id);
  if (!t) return;
  const body = `
    <form id="edit-form" onsubmit="handleEditTicketSubmit(event, '${id}')" class="space-y-4">
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Assigned To</label>
          <select class="form-select form-select-sm assignee-select" id="edit-assignee" size="1">
            <option value="">-- Unassigned --</option>
            ${state.assistants.filter(a => String(a.role).toLowerCase() !== 'admin' && a.status !== 'disabled').map(a => `<option value="${a.id}" ${t.assignee === a.id ? 'selected' : ''}>${esc(a.name)} (${esc(a.role)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-select form-select-sm" id="edit-status">
            ${['Pending', 'In Progress', 'Resolved'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea form-input-sm" id="edit-desc" rows="2">${esc(t.description)}</textarea></div>
      <div class="form-group"><label class="form-label">External Info</label><input class="form-input form-input-sm" id="edit-external" value="${esc(t.external || '')}"></div>
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Resolved Date</label><input type="date" class="form-input form-input-sm" id="edit-resolved-date" value="${t.resolvedDate || ''}"></div>
        <div class="form-group"><label class="form-label">Date Raised</label><input type="date" class="form-input form-input-sm" value="${t.date}" readonly style="background:var(--slate-100)"></div>
      </div>
    </form>
  `;
  openModal('Edit Ticket ' + id, body, `
    <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="document.getElementById('edit-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))">Save Changes</button>
  `);
}

async function handleEditTicketSubmit(e, id) {
  e.preventDefault();
  const updates = {
    assignee: document.getElementById('edit-assignee').value ? parseInt(document.getElementById('edit-assignee').value) : null,
    status: document.getElementById('edit-status').value,
    description: document.getElementById('edit-desc').value,
    external: document.getElementById('edit-external').value || null,
    resolvedDate: document.getElementById('edit-resolved-date').value || null
  };
  await editTicket(id, updates);
  closeModal();
}

async function editTicket(id, updates) {
  const t = state.tickets.find(x => x.id === id);
  if (!t) return;

  try {
    const res = await fetch('../api/tickets.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, updates })
    });
    if (res.ok) {
      const result = await res.json();
      if (!result.ticket) throw new Error('The server did not return the updated ticket.');
      upsertTicketInState(result.ticket);
      addToast('Ticket ' + id + ' updated');
      renderContent();
    } else {
      const data = await res.json();
      addToast(data.error || 'Failed to update ticket', 'error');
    }
  } catch (err) {
    console.error('Error updating ticket:', err);
    addToast('Network error while updating ticket', 'error');
  }
}

/* ===== PRINT PREVIEW ===== */
let printStampImage = null;
let printLogoImage = null;
let printLogoLocked = false;
let printStampPos = { x: 80, y: 70 };
let printDragging = false;
let printDragOffset = { x: 0, y: 0 };
const printHistoryExcludedTicketIds = new Set();

function isPrintHistoryIncluded(ticketId) {
  return !printHistoryExcludedTicketIds.has(String(ticketId));
}

function syncPrintHistoryControls() {
  const previewToggles = Array.from(document.querySelectorAll('#print-preview-container .print-history-toggle[data-ticket-id]'));
  const masterToggles = Array.from(document.querySelectorAll('#records-table .master-record-history-toggle[data-ticket-id]'));
  [...previewToggles, ...masterToggles].forEach(toggle => {
    const included = isPrintHistoryIncluded(toggle.dataset.ticketId);
    toggle.checked = included;
    toggle.closest('td')?.querySelector('.print-history-content')?.classList.toggle('is-excluded', !included);
  });
  const syncAllToggle = (selector, ticketIds) => {
    const allToggle = document.querySelector(selector);
    if (!allToggle) return;
    const includedCount = ticketIds.filter(ticketId => isPrintHistoryIncluded(ticketId)).length;
    allToggle.checked = ticketIds.length === includedCount;
    allToggle.indeterminate = includedCount > 0 && includedCount < ticketIds.length;
  };
  syncAllToggle('#master-record-history-all', (state.tickets || []).map(ticket => String(ticket.id)));
}

function setPrintHistoryForMasterRecords(included) {
  (state.tickets || []).forEach(ticket => {
    const ticketId = String(ticket.id);
    if (included) {
      printHistoryExcludedTicketIds.delete(ticketId);
    } else {
      printHistoryExcludedTicketIds.add(ticketId);
    }
  });
  syncPrintHistoryControls();
}

function togglePrintHistoryForTicket(ticketId, included) {
  if (included) {
    printHistoryExcludedTicketIds.delete(String(ticketId));
  } else {
    printHistoryExcludedTicketIds.add(String(ticketId));
  }
  syncPrintHistoryControls();
}

function openPrintPreview() {
  const tickets = getPrintTickets();
  const filterTitle = `${state.filter.type} Records (${state.filter.start} to ${state.filter.end})${state.filter.text ? `; search: ${state.filter.text}` : ''}`;
  const body = buildPrintPreviewHtml(tickets, filterTitle);
  openModal('Print Preview - Records Report', body, null, true);
  document.getElementById('modal')?.classList.add('print-preview-modal');
  setTimeout(() => {
    syncPrintHistoryControls();
    setupPrintDragHandlers();
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }, 100);
}

function getPrintTickets() {
  const filterText = String(state.filter.text || '').toLowerCase();
  const startDate = new Date(state.filter.start);
  const endDate = new Date(state.filter.end);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return (state.tickets || [])
    .filter(ticket => {
      const textMatch = String(ticket.id || '').toLowerCase().includes(filterText)
        || String(ticket.description || '').toLowerCase().includes(filterText);
      const typeMatch = state.filter.type === 'All' || ticket.type === state.filter.type;
      const ticketDate = new Date(ticket.date);
      return textMatch && typeMatch && ticketDate >= startDate && ticketDate <= endDate;
    })
    .sort((a, b) => {
      const aValue = a[state.sort.key] || '';
      const bValue = b[state.sort.key] || '';
      const comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      return state.sort.dir === 'asc' ? comparison : -comparison;
    });
}

function getPrintedVirtualSessionSigner(ticket) {
  if (ticket.type === 'P/COPYING') return String(ticket.staffDetails || '').trim() || '-';
  if (ticket.type !== 'Virtual Sessions') return '-';
  const description = String(ticket.description || '');
  const marker = description.lastIndexOf('Signed by:');
  return marker < 0 ? '-' : (description.slice(marker + 'Signed by:'.length).trim() || '-');
}

function getRepresentativeSignature(ticket) {
  return getPrintedVirtualSessionSigner(ticket);
}

function buildPrintPreviewHtml(tickets, filterTitle) {
  const printCrestUrl = new URL('../background.jpg', window.location.href).href;
  return `
    <div id="print-preview-container">
      <div class="print-toolbar">
        <div class="print-toolbar-right">
          <span class="print-toolbar-label">Stamp</span>
          <button class="btn btn-sm btn-outline" onclick="document.getElementById('print-stamp-input').click()"><i data-lucide="upload" style="width:14px;height:14px"></i> ${printStampImage ? 'Change Stamp' : 'Upload Stamp'}</button>
          ${printStampImage ? `<button class="btn btn-sm btn-outline" onclick="printStampImage=null;openPrintPreview()" style="color:var(--red-500)"><i data-lucide="x" style="width:14px;height:14px"></i></button>` : ''}
          <input type="file" id="print-stamp-input" accept="image/*" style="display:none" onchange="handlePrintStampUpload(event)">
          <button class="btn btn-primary btn-sm" onclick="handlePrintPDF()"><i data-lucide="printer" style="width:14px;height:14px"></i> Print / Save PDF</button>
        </div>
      </div>
      ${printStampImage ? `<p class="print-drag-hint"><i data-lucide="move" style="width:12px;height:12px"></i> Drag the stamp to position it anywhere on the document</p>` : ''}
      <div class="print-document" id="print-content-area">
        ${printStampImage ? `<div class="print-stamp-overlay" id="print-stamp" style="left:${printStampPos.x}%;top:${printStampPos.y}%"><img src="${printStampImage}" alt="Stamp" draggable="false"></div>` : ''}
        <div class="print-letterhead">
          <div class="print-letterhead-logo">
            <img src="${printCrestUrl}" alt="Judicial Service Commission crest" draggable="false">
          </div>
          <h2 class="print-org-name">JSC Labour IT Department</h2>
          <p class="print-org-subtitle">Information Technology Services</p>
        </div>
        <div class="print-report-header">
          <h3><i data-lucide="file-text" style="width:18px;height:18px"></i> IT Service Report</h3>
          <div class="print-report-meta">
            <span><strong>Period:</strong> ${esc(filterTitle)}</span>
            <span><strong>Generated:</strong> ${new Date().toLocaleDateString()}</span>
            <span><strong>Report ID:</strong> RPT-${Date.now().toString(36).toUpperCase()}</span>
          </div>
        </div>
        <div class="print-summary-strip">
          <span><strong>Total Records:</strong> ${tickets.length}</span>
          <span class="print-confidential-badge">Confidential</span>
        </div>
        ${tickets.length > 0 ? `
          <div class="print-table-wrap">
            <table class="print-table">
              <thead><tr>
                <th>Record</th>
                <th>Assignment</th>
                <th>Work Details</th>
                <th>Representative Signature</th>
                <th>Description</th>
                <th>Additional Details</th>
                <th>Status</th>
                <th>Change History</th>
              </tr></thead>
              <tbody>${tickets.map((t, i) => `
                <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
                  <td><strong class="print-id-cell">${esc(t.id || '-')}</strong><div class="print-field"><strong>Raised:</strong> ${esc(t.date || '-')}</div></td>
                  <td><strong class="print-assignee-cell">${esc(t.assignee_name || getAssistantName(t.assignee))}</strong><div class="print-field"><strong>Assigned:</strong> ${esc(t.assignedDate || '-')}</div></td>
                  <td><strong>${esc(t.type || '-')}</strong><div class="print-field"><strong>Category:</strong> ${esc(t.category || '-')}</div><div class="print-field"><strong>Quantity:</strong> ${esc(t.quantity ?? '-')}</div></td>
                  <td>${esc(getRepresentativeSignature(t))}</td>
                  <td class="print-desc-cell" title="${esc(t.description)}">${esc(t.description)}</td>
                  <td>${t.external ? `<div class="print-field"><strong>External:</strong> ${esc(t.external)}</div>` : ''}${t.externalCause ? `<div class="print-field"><strong>Cause:</strong> ${esc(t.externalCause)}</div>` : ''}${t.adminConstraint ? `<div class="print-field"><strong>Constraint:</strong> ${esc(t.adminConstraint)}</div>` : ''}${!t.external && !t.externalCause && !t.adminConstraint ? '-' : ''}</td>
                  <td>${statusBadgePrint(t.status)}<div class="print-field"><strong>Resolved:</strong> ${esc(t.resolvedDate || '-')}</div></td>
                  <td><label class="print-history-toggle"><input type="checkbox" data-ticket-id="${esc(t.id || '')}" onchange="togglePrintHistoryForTicket(this.dataset.ticketId, this.checked)" ${isPrintHistoryIncluded(t.id) ? 'checked' : ''}> Include</label><div class="print-history-content${isPrintHistoryIncluded(t.id) ? '' : ' is-excluded'}">${t.edited_by ? `<div class="print-field"><strong>Edited:</strong> ${esc(t.edited_by)}${t.edited_at ? ` (${esc(t.edited_at)})` : ''}</div>` : ''}${t.reassigned_by ? `<div class="print-field"><strong>Reassigned:</strong> ${esc(t.reassigned_by)}${t.reassigned_at ? ` (${esc(t.reassigned_at)})` : ''}</div>` : ''}${!t.edited_by && !t.reassigned_by ? '-' : ''}</div></td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>
        ` : `<div class="print-empty"><i data-lucide="inbox" style="width:40px;height:40px;color:var(--slate-300)"></i><p>No records found for the selected period</p></div>`}
        <div class="admin-report-signoff">
          <p class="admin-report-signoff-title">Authorized By</p>
          <p class="admin-report-signoff-detail">Name: _______________________</p>
          <p class="admin-report-signoff-detail">Date: _______________________</p>
        </div>
      </div>
    </div>
  `;
}

function togglePrintLogoLock() {
  printLogoLocked = !printLogoLocked;
  if (printLogoLocked && printLogoImage) {
    addToast('Logo locked! Use the logo URL field for persistence.');
  } else {
    addToast('Logo unlocked. You can now change or remove it.');
  }
  openPrintPreview();
}

function removePrintLogo() {
  printLogoImage = null;
  printLogoLocked = false;
  openPrintPreview();
}

async function handlePrintPDF() {
  const report = document.getElementById('print-content-area');
  if (!report) {
    addToast('The report is not ready to print. Close the preview and try again.', 'error');
    return;
  }
  const reportContainer = report.closest('#print-preview-container');
  if (!reportContainer) {
    addToast('The report container is missing. Close the preview and try again.', 'error');
    return;
  }

  // Open synchronously from the click so popup blockers allow the print window.
  const printWindow = window.open('', '_blank', 'width=1200,height=900');
  if (!printWindow) {
    addToast('Printing was blocked by your browser. Allow pop-ups for this site, then try again.', 'error');
    return;
  }

  printWindow.document.write('<!doctype html><html><head><title>IT Service Report</title><style>body{font-family:Arial,sans-serif;color:#0f172a}@page{size:landscape;margin:.35in}</style></head><body><p>Preparing report...</p></body></html>');
  printWindow.document.close();

  try {
    const stylesheetLink = document.querySelector('link[rel="stylesheet"]');
    if (!stylesheetLink?.href) {
      throw new Error('Dashboard stylesheet is unavailable.');
    }
    const stylesheetResponse = await fetch(stylesheetLink.href, { credentials: 'same-origin' });
    if (!stylesheetResponse.ok) {
      throw new Error(`Dashboard stylesheet request failed (${stylesheetResponse.status}).`);
    }
    const stylesheet = await stylesheetResponse.text();
    const reportHtml = reportContainer.cloneNode(true);
    reportHtml.classList.add('print-preview-modal');
    reportHtml.querySelectorAll('.print-toolbar, .print-drag-hint, .print-stamp-overlay').forEach(element => element.remove());
    const includeAnyHistory = Array.from(report.querySelectorAll('.print-history-toggle[data-ticket-id]'))
      .some(toggle => toggle.checked);
    if (!includeAnyHistory) {
      const historyHeader = Array.from(reportHtml.querySelectorAll('.print-table thead th'))
        .find(header => header.textContent.trim() === 'Change History');
      if (historyHeader?.parentElement) {
        const historyColumnIndex = Array.from(historyHeader.parentElement.cells).indexOf(historyHeader);
        reportHtml.querySelectorAll('.print-table tr').forEach(row => row.deleteCell(historyColumnIndex));
      }
    }
    if (reportHtml.querySelectorAll('.print-table tbody tr').length !== report.querySelectorAll('.print-table tbody tr').length) {
      throw new Error('The printable report does not contain all preview records.');
    }
    printWindow.document.head.insertAdjacentHTML('afterbegin', `<style>${stylesheet}</style>`);
    printWindow.document.head.insertAdjacentHTML('beforeend', `<style>
      @media print {
        .print-history-toggle { display: none !important; }
        .print-history-content.is-excluded { display: none !important; }
        body * { visibility: visible !important; }
        #print-preview-container, #print-content-area, .print-table-wrap {
          width: 100% !important;
          max-width: none !important;
          max-height: none !important;
          height: auto !important;
          overflow: visible !important;
        }
        .print-table { width: 100% !important; min-width: 0 !important; }
        .print-table thead { display: table-header-group !important; }
        #print-preview-container.print-preview-modal .print-table tbody tr {
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
      }
    </style>`);
    printWindow.document.body.innerHTML = reportHtml.outerHTML;
    await Promise.all(Array.from(printWindow.document.images, image => image.complete
      ? Promise.resolve()
      : new Promise(resolve => {
        image.onload = resolve;
        image.onerror = resolve;
        printWindow.setTimeout(resolve, 2000);
      })));
    if (printWindow.document.fonts?.ready) {
      await Promise.race([printWindow.document.fonts.ready, new Promise(resolve => printWindow.setTimeout(resolve, 2000))]);
    }
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    printWindow.print();
  } catch (error) {
    printWindow.close();
    console.error('Unable to prepare print report:', error);
    addToast('The report could not be prepared for printing. Please try again or contact support.', 'error');
  }
}

function handlePrintLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    printLogoImage = ev.target.result;
    openPrintPreview();
  };
  reader.readAsDataURL(file);
}

function handlePrintStampUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => { printStampImage = ev.target.result; openPrintPreview(); };
  reader.readAsDataURL(file);
}

function setupPrintDragHandlers() {
  const stamp = document.getElementById('print-stamp');
  const container = document.getElementById('print-content-area');
  if (!stamp || !container) return;
  stamp.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = stamp.getBoundingClientRect();
    printDragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    printDragging = true;
    stamp.style.cursor = 'grabbing';
  });
  container.addEventListener('mousemove', (e) => {
    if (!printDragging) return;
    const cr = container.getBoundingClientRect();
    const newX = ((e.clientX - cr.left - printDragOffset.x) / cr.width) * 100;
    const newY = ((e.clientY - cr.top - printDragOffset.y) / cr.height) * 100;
    printStampPos = { x: Math.max(0, Math.min(90, newX)), y: Math.max(0, Math.min(90, newY)) };
    stamp.style.left = printStampPos.x + '%';
    stamp.style.top = printStampPos.y + '%';
  });
  const stopDrag = () => { printDragging = false; if (stamp) stamp.style.cursor = 'grab'; };
  container.addEventListener('mouseup', stopDrag);
  container.addEventListener('mouseleave', stopDrag);
}

/* ===== NOTIFICATIONS VIEW ===== */
function renderNotifications(container) {
  const { notifications, notificationFilter } = state;
  const filtered = notifications.filter(n => {
    const d = new Date(n.createdAt);
    const s = new Date(notificationFilter.start); s.setHours(0, 0, 0, 0);
    const e = new Date(notificationFilter.end); e.setHours(23, 59, 59, 999);
    const dateOk = d >= s && d <= e;
    const typeOk = notificationFilter.type === 'All' || n.type === notificationFilter.type;
    const readOk = notificationFilter.readStatus === 'All' || (notificationFilter.readStatus === 'unread' && !n.read) || (notificationFilter.readStatus === 'read' && n.read);
    return dateOk && typeOk && readOk;
  });
  const unreadCount = notifications.filter(n => !n.read).length;
  const warningCount = notifications.filter(n => n.type === 'warning').length;
  const errorCount = notifications.filter(n => n.type === 'error').length;

  container.innerHTML = `
    <div class="max-w-5xl pb-12 space-y-8">
      <div class="notif-page-header">
        <div class="notif-page-header-bar"></div>
        <div class="notif-page-header-content">
          <div class="notif-page-header-left">
            <div class="notif-page-icon-wrap">
              <i data-lucide="bell" style="width:32px;height:32px;color:var(--slate-700)"></i>
              ${unreadCount > 0 ? '<span class="notif-page-icon-dot"></span>' : ''}
            </div>
            <div>
              <h1 class="notif-page-title">Notification Center</h1>
              <p class="notif-page-subtitle"><i data-lucide="inbox" style="width:14px;height:14px"></i> You have <span class="count">${unreadCount}</span> unread notifications</p>
            </div>
          </div>
          ${unreadCount > 0 ? `<button class="btn btn-outline" onclick="markAllNotificationsRead(this)"><i data-lucide="check-check" style="width:16px;height:16px"></i> Mark all as read</button>` : ''}
        </div>
      </div>
      <div class="notif-filters">
        <div class="notif-filter-card">
          <div class="notif-filter-label"><i data-lucide="filter" style="width:12px;height:12px"></i> Filter By Type</div>
          <div class="notif-filter-pills">
            ${['All', 'info', 'success', 'warning', 'error'].map(t => `
              <button class="notif-filter-pill ${notificationFilter.type === t ? 'active' : ''}" onclick="handleNotifFilterChange('type','${t}')">${t.charAt(0).toUpperCase() + t.slice(1)}</button>
            `).join('')}
          </div>
        </div>
        <div class="notif-filter-card">
          <div style="display:flex;flex-direction:column;gap:24px">
            <div style="flex:1">
              <div class="notif-filter-label"><i data-lucide="check-circle" style="width:12px;height:12px"></i> Status</div>
              <div class="notif-status-filter">
                ${['All', 'unread', 'read'].map(s => `
                  <button class="notif-status-btn ${notificationFilter.readStatus === s ? 'active' : ''}" onclick="handleNotifFilterChange('readStatus','${s}')">${s}</button>
                `).join('')}
              </div>
            </div>
            <div style="flex:1.5">
              <div class="notif-filter-label"><i data-lucide="calendar" style="width:12px;height:12px"></i> Date Range</div>
              <div class="notif-date-range">
                <input type="date" class="notif-date-input" value="${notificationFilter.start}" onchange="handleNotifFilterChange('start',this.value)">
                <span class="notif-date-sep">-</span>
                <input type="date" class="notif-date-input" value="${notificationFilter.end}" onchange="handleNotifFilterChange('end',this.value)">
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="notif-list">
        ${filtered.length > 0 ? filtered.map(n => notifItemHtml(n)).join('') : `
          <div class="notif-empty">
            <div class="notif-empty-icon">
              <i data-lucide="bell-off" style="width:40px;height:40px;color:var(--slate-300)"></i>
            </div>
            <h3>All caught up!</h3>
            <p>You have no notifications matching your current filters. Enjoy the silence.</p>
            <button class="btn btn-outline" style="margin-top:24px" onclick="handleNotifFilterChange('type','All');handleNotifFilterChange('readStatus','All')">Clear Filters</button>
          </div>
        `}
      </div>
      <div class="notif-summary">
        ${[
          { label: 'Total', value: notifications.length, color: 'var(--slate-600)', bg: 'var(--slate-100)' },
          { label: 'Unread', value: unreadCount, color: 'var(--emerald-600)', bg: 'var(--emerald-100)' },
          { label: 'Warnings', value: warningCount, color: 'var(--amber-600)', bg: 'var(--amber-100)' },
          { label: 'Errors', value: errorCount, color: 'var(--red-600)', bg: 'var(--red-100)' }
        ].map(s => `
          <div class="notif-summary-card">
            <span class="notif-summary-label">${s.label}</span>
            <span class="notif-summary-value" style="background:${s.bg};color:${s.color}">${s.value}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function notifItemHtml(n) {
  const config = getNotifConfig(n.type);
  return `
    <div class="notif-item ${n.read ? '' : 'unread'}">
      <div class="notif-item-bar" style="background:${!n.read ? config.barColor : 'transparent'}"></div>
      <div class="notif-item-inner">
        <div style="flex-shrink:0;padding-top:4px">
          <div class="notif-item-icon-wrap" style="background:${config.bg};color:${config.color}">
            <i data-lucide="${config.icon}" style="width:24px;height:24px"></i>
          </div>
        </div>
        <div class="notif-item-content">
          <div class="notif-item-top">
            <div class="notif-item-title-area">
              <div class="notif-item-title-row">
                <h3 class="notif-item-title ${n.read ? 'read' : 'unread'}">${esc(n.title)}</h3>
                ${!n.read ? '<span class="notif-unread-indicator"><span class="ping-dot"></span><span class="solid-dot"></span></span>' : ''}
              </div>
              <p class="notif-item-msg">${esc(n.message)}</p>
            </div>
            <div class="notif-item-actions">
              ${!n.read ? `<button class="notif-item-action-btn mark-read" onclick="markNotificationRead('${esc(String(n.id))}', this)" title="Mark as read"><i data-lucide="check-circle" style="width:20px;height:20px"></i></button>` : ''}
              <button class="notif-item-action-btn delete-notif" onclick="deleteNotification('${esc(String(n.id))}')" title="Delete"><i data-lucide="trash-2" style="width:20px;height:20px"></i></button>
            </div>
          </div>
          <div class="notif-item-footer">
            <span class="notif-item-time-badge"><i data-lucide="clock" style="width:14px;height:14px"></i> ${formatTimeAgo(n.createdAt)}</span>
            <span class="notif-item-type-badge" style="background:${config.bg};color:${config.color};border:1px solid ${config.borderColor}">${esc(n.type)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function handleNotifFilterChange(key, value) {
  state.notificationFilter[key] = value;
  renderContent();
}

/* ===== SETTINGS VIEW ===== */
function renderSettings(container) {
  if (!state.settingsTargetType) {
    state.settingsTargetType = 'user'; // 'user' or 'assistant'
  }
  if (state.settingsTargetType === 'user') {
    renderGeneralUserNationalIdLookup(container, true);
    return;
  }
  
  const allSettingsItems = state.settingsTargetType === 'user'
    ? (state.generalUsers || [])
    : (state.assistants || []);
  const searchTerm = String(state.settingsSearch || '').trim().toLowerCase();
  const list = allSettingsItems.filter(item => [item.full_name, item.name, item.email, item.role, item.phone, item.whatsapp]
    .some(value => String(value || '').toLowerCase().includes(searchTerm)));
  
  if (!state.settingsTargetId && list.length > 0) {
    state.settingsTargetId = list[0].id;
  } else if (state.settingsTargetId && !list.some(item => String(item.id) === String(state.settingsTargetId))) {
    state.settingsTargetId = list.length > 0 ? list[0].id : '';
  }
  
  const selectedItem = list.find(item => String(item.id) === String(state.settingsTargetId));
  const selectedUser = state.settingsTargetType === 'user'
    ? selectedItem
    : (state.users || []).find(user => String(user.email || '').toLowerCase() === String(selectedItem?.email || '').toLowerCase());
  const selectedPasskeys = (state.passkeys || []).filter(passkey =>
    selectedUser && String(passkey.email || '').toLowerCase() === String(selectedUser.email || '').toLowerCase()
  );
  const hasRegisteredPasskey = Boolean(selectedPasskeys.length || selectedUser?.passkey_present);
  const currentStatus = selectedItem ? (selectedItem.status || 'active') : '';
  const currentName = selectedItem
    ? (state.settingsTargetType === 'assistant'
      ? getAssistantDisplayName(selectedItem)
      : (selectedItem.full_name || selectedItem.name || selectedItem.email || ''))
    : '';
  const currentEmail = selectedItem ? selectedItem.email : '';

  container.innerHTML = `
    <div class="max-w-5xl pb-12 space-y-8" style="animation: fadeIn 0.3s ease-out;">
      <!-- Page Header -->
      <div class="notif-page-header" style="border-left: 4px solid var(--slate-600); margin-bottom: 24px;">
        <div class="notif-page-header-bar" style="background: var(--slate-600);"></div>
        <div class="notif-page-header-content">
          <div class="notif-page-header-left" style="display: flex; gap: 16px; align-items: center;">
            <div class="notif-page-icon-wrap" style="background: var(--slate-100); border-radius: 12px; padding: 10px; display: flex; align-items: center; justify-content: center;">
              <i data-lucide="settings" style="width:32px;height:32px;color:var(--slate-700)"></i>
            </div>
            <div>
              <h1 class="notif-page-title" style="font-size: 1.8rem; font-weight: 800; color: var(--slate-800); margin: 0 0 4px 0;">System Settings</h1>
              <p class="notif-page-subtitle" style="font-size: 0.9rem; color: var(--slate-500); margin: 0; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="shield-check" style="width:14px;height:14px"></i> Account, Cryptographic Credentials, and Lockout Administration
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Account Selection Panel -->
      <div style="background: white; border: 1px solid var(--slate-200); border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 20px;">
        ${state.generalUsersError ? `<div role="alert" style="padding:10px 14px;border:1px solid var(--red-200);border-radius:8px;background:var(--red-50);color:var(--red-800);font-size:13px;">Could not load General Users: ${esc(state.generalUsersError)}</div>` : ''}
        <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-between;">
          <div>
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--slate-800); margin: 0 0 4px 0;">${state.settingsTargetType === 'user' ? 'General Users' : 'Assistants'}</h3>
              <p style="font-size: 0.85rem; color: var(--slate-500); margin: 0;">${state.settingsTargetType === 'user' ? 'Registered users and their password and passkey credentials.' : 'Overall assistant directory, contact details, workload, and availability.'}</p>
          </div>
          
          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <input id="settings-search-input" class="form-input" type="search" placeholder="Search name, email, role..." value="${esc(state.settingsSearch || '')}" oninput="setSettingsSearch(this.value)" autocomplete="off" spellcheck="false" style="min-width: 240px;">
            <!-- Target Type Toggle -->
            <div style="display: flex; background: var(--slate-100); padding: 4px; border-radius: 8px; border: 1px solid var(--slate-200);">
              <button class="settings-type-btn" onclick="setSettingsTargetType('user')" style="padding: 6px 16px; font-size: 13px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; background: ${state.settingsTargetType === 'user' ? 'white' : 'transparent'}; color: ${state.settingsTargetType === 'user' ? 'var(--slate-800)' : 'var(--slate-500)'}; box-shadow: ${state.settingsTargetType === 'user' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">
                General Users (<span id="settings-user-count">${state.generalUsers.length}</span>)
              </button>
              <button class="settings-type-btn" onclick="setSettingsTargetType('assistant')" style="padding: 6px 16px; font-size: 13px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; background: ${state.settingsTargetType === 'assistant' ? 'white' : 'transparent'}; color: ${state.settingsTargetType === 'assistant' ? 'var(--slate-800)' : 'var(--slate-500)'}; box-shadow: ${state.settingsTargetType === 'assistant' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">
                Assistants (<span id="settings-assistant-count">${state.assistants.length}</span>)
              </button>
            </div>

            <!-- Target Dropdown -->
            <select id="settings-account-select" onchange="setSettingsTargetId(this.value)" style="padding: 8px 16px; font-size: 14px; font-weight: 500; border-radius: 8px; border: 1px solid var(--slate-300); background: white; color: var(--slate-700); min-width: 250px; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); cursor: pointer;">
              ${list.length === 0 ? `<option value="">No ${state.settingsTargetType === 'user' ? 'General Users' : 'Assistants'} Available</option>` : list.map(item => `
                <option value="${item.id}" ${String(item.id) === String(state.settingsTargetId) ? 'selected' : ''}>
                  ${esc(state.settingsTargetType === 'assistant'
                    ? getAssistantDisplayName(item)
                    : (item.full_name || item.name || item.email))} [ID: ${item.id}]
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        ${selectedItem ? `
          <!-- Selection Detail Badge -->
          <div style="background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: 8px; padding: 14px 20px; display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--slate-200); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--slate-700); font-size: 15px;">
                ${getInitials(currentName)}
              </div>
              <div>
                <div style="font-weight: 700; color: var(--slate-800); font-size: 14px;">${esc(currentName)}</div>
                <div style="font-size: 12px; color: var(--slate-500);">${esc(currentEmail)}</div>
              </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="text-align: right;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--slate-400); font-weight: 600;">Account Status</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${currentStatus === 'blocked' ? 'var(--red-500)' : currentStatus === 'suspended' ? 'var(--amber-500)' : 'var(--emerald-500)'}; display: inline-block;"></span>
                  <span style="font-size: 13px; font-weight: 700; text-transform: capitalize; color: ${currentStatus === 'blocked' ? 'var(--red-600)' : currentStatus === 'suspended' ? 'var(--amber-600)' : 'var(--emerald-600)'};">
                    ${currentStatus}
                  </span>
                </div>
              </div>
              
              <div style="border-left: 1px solid var(--slate-200); height: 32px;"></div>
              
              <div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--slate-400); font-weight: 600;">Account Type</div>
                <div style="font-size: 13px; font-weight: 700; color: var(--slate-700); margin-top: 2px; text-transform: capitalize;">
                  ${state.settingsTargetType === 'user' ? 'General User' : 'Assistant'}
                </div>
              </div>
            </div>
          </div>
        ` : `
          <div style="text-align: center; padding: 40px 20px; color: var(--slate-400); font-size: 13px; border: 1px dashed var(--slate-200); border-radius: 8px;">
            <i data-lucide="users" style="width: 32px; height: 32px; color: var(--slate-300); margin-bottom: 12px; display: inline-block;"></i>
            <p style="margin: 0;">No ${state.settingsTargetType === 'user' ? 'general users' : 'assistants'} found in the database directory.</p>
          </div>
        `}
      </div>

      ${selectedItem ? `
        <div class="settings-account-details">
          <strong>${state.settingsTargetType === 'user' ? 'General User Information' : 'Assistant Information'}</strong>
          <div><small>${state.settingsTargetType === 'user' ? 'User ID' : 'Assistant ID'}</small><span>${esc(selectedItem.id)}</span></div>
          <div><small>Name</small><span>${esc(currentName)}</span></div>
          <div><small>Email</small><span>${esc(currentEmail)}</span></div>
          <div><small>Role</small><span>${esc(selectedItem.role || state.settingsTargetType)}</span></div>
          <div><small>Phone</small><span>${esc(selectedItem.phone || '-')}</span></div>
          <div><small>WhatsApp</small><span>${esc(selectedItem.whatsapp || '-')}</span></div>
          <div><small>Last login</small><span>${esc(selectedItem.last_login || '-')}</span></div>
          <div><small>${state.settingsTargetType === 'user' ? 'Account status' : 'Availability'}</small><span>${esc(state.settingsTargetType === 'user' ? (selectedUser?.status || '-') : (selectedItem.status || '-'))}</span></div>
          <div><small>Blocked until</small><span>${esc(state.settingsTargetType === 'user' ? (selectedUser?.blocked_until || '-') : '-')}</span></div>
          <div><small>Password</small><span style="display:flex;align-items:center;gap:8px;">${selectedUser?.password_set ? 'Password configured' : selectedUser ? 'Not set' : 'No linked login account'}${selectedUser ? `<button type="button" class="btn btn-outline" onclick="openSettingsPasswordModal()" title="Change password" aria-label="Change password" style="padding:5px 8px;"><i data-lucide="key-round" style="width:15px;height:15px"></i></button>` : ''}</span></div>
          ${selectedUser ? `
            <div><small>Passkey</small><span>${hasRegisteredPasskey ? 'Registered' : 'Not registered'}</span></div>
            <div><small>Last password change</small><span>${esc(selectedUser?.last_password_change || '-')}</span></div>
            <div><small>Created</small><span>${esc(selectedUser?.created_at || '-')}</span></div>
            <div><small>Updated</small><span>${esc(selectedUser?.updated_at || '-')}</span></div>
            <div><small>Failed attempts</small><span>${esc(selectedUser?.failed_attempts ?? '-')}</span></div>
          ` : `
            <div><small>Completed tasks</small><span>${esc(selectedItem.completed ?? 0)}</span></div>
            <div><small>Pending tasks</small><span>${esc(selectedItem.pending ?? 0)}</span></div>
            <div><small>Last seen</small><span>${esc(selectedItem.last_seen || '-')}</span></div>
            <div><small>Availability</small><span>${esc(selectedItem.status || '-')}</span></div>
            <div><small>Disabled since</small><span>${esc(selectedItem.disabledAt || '-')}</span></div>
            <div><small>Disable reason</small><span>${esc(selectedItem.disableReason || '-')}</span></div>
          `}
        </div>

        <!-- Sections Grid -->
        <div style="display: grid; grid-template-columns: 1fr; gap: 24px;">
          
          ${selectedUser ? `
          <!-- SECTION 1: PASSKEY MANAGEMENT -->
          <div style="background: white; border: 1px solid var(--slate-200); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
            <div style="border-bottom: 1px solid var(--slate-100); padding: 18px 24px; display: flex; align-items: center; gap: 10px;">
              <i data-lucide="fingerprint" style="width:18px;height:18px;color:var(--slate-600)"></i>
              <h3 style="font-size: 1rem; font-weight: 700; color: var(--slate-800); margin: 0;">Biometric & Passkey Reset</h3>
            </div>
            <div style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
              <p style="font-size: 13px; color: var(--slate-500); margin: 0; line-height: 1.5;">
                Passkeys are device credentials, not passwords that can be typed or copied into this form. The current passkey cannot be displayed or saved as text. This action revokes the registered device credentials; the account holder must then register a new passkey from their profile using the device prompt.
              </p>
              
              <div style="display: flex; align-items: center; justify-content: space-between; background: var(--red-50); border: 1px solid var(--red-100); border-radius: 8px; padding: 16px 20px; flex-wrap: wrap; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <i data-lucide="shield-alert" style="width:20px;height:20px;color:var(--red-600)"></i>
                  <div>
                    <div style="font-weight: 700; font-size: 13.5px; color: var(--red-800);">Revoke Credentials</div>
                    <div style="font-size: 12px; color: var(--red-600); margin-top: 1px;">This action cannot be undone. Users must register their biometric factors again in their profile tab.</div>
                  </div>
                </div>
                
                ${hasRegisteredPasskey ? `
                  <button onclick="submitPasskeyReset()" class="btn" style="background: var(--red-600); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="trash-2" style="width:16px;height:16px"></i> Reset Passkey
                  </button>
                ` : `
                  <div role="alert" style="padding:10px 14px;border:1px solid var(--amber-200);border-radius:8px;background:var(--amber-50);color:var(--amber-800);font-size:13px;">No passkey is registered. Register a passkey first, then you can reset it here.</div>
                `}
              </div>
            </div>
          </div>
          ` : ''}

          ${state.settingsTargetType === 'assistant' ? `
          <!-- SECTION 3: SUSPENSION & BLOCKING -->
          <div style="background: white; border: 1px solid var(--slate-200); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
            <div style="border-bottom: 1px solid var(--slate-100); padding: 18px 24px; display: flex; align-items: center; gap: 10px;">
              <i data-lucide="shield" style="width:18px;height:18px;color:var(--slate-600)"></i>
              <h3 style="font-size: 1rem; font-weight: 700; color: var(--slate-800); margin: 0;">Status Control & Account Lockout</h3>
            </div>
            <div style="padding: 24px;">
              <p style="font-size: 13px; color: var(--slate-500); margin: 0 0 20px 0; line-height: 1.5;">
                Temporarily suspend access or completely block this ${state.settingsTargetType === 'user' ? 'user' : 'assistant'} from entering the system. Blocked and suspended accounts are barred from performing authentication or registering tickets.
              </p>
              
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button onclick="submitStatusAction('unblock')" class="btn" style="border: 1px solid var(--emerald-200); color: var(--emerald-700); background: var(--emerald-50); font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer;" ${currentStatus === 'active' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                  <i data-lucide="unlock" style="width:16px;height:16px"></i> Activate / Unblock Account
                </button>
                
                <button onclick="submitStatusAction('suspend')" class="btn" style="border: 1px solid var(--amber-200); color: var(--amber-700); background: var(--amber-50); font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer;" ${currentStatus === 'suspended' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                  <i data-lucide="pause-circle" style="width:16px;height:16px"></i> Suspend Account
                </button>
                
                <button onclick="submitStatusAction('block')" class="btn" style="border: 1px solid var(--red-200); color: var(--red-700); background: var(--red-50); font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer;" ${currentStatus === 'blocked' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                  <i data-lucide="ban" style="width:16px;height:16px"></i> Block Account
                </button>
              </div>
            </div>
          </div>
          ` : ''}

          ${state.settingsTargetType === 'assistant' && !selectedUser ? `
          <div style="padding: 16px 20px; border: 1px solid var(--amber-200); border-radius: 8px; background: var(--amber-50); color: var(--amber-800); font-size: 13px;">
            No login account is linked to this assistant email, so password and passkey resets are unavailable.
          </div>
          ` : ''}

          <!-- SECTION 4: DELETION (DANGER ZONE) -->
          <div style="background: var(--slate-50); border: 1px dashed var(--red-300); border-radius: 12px; overflow: hidden;">
            <div style="border-bottom: 1px solid var(--red-100); background: var(--red-50); padding: 18px 24px; display: flex; align-items: center; gap: 10px;">
              <i data-lucide="alert-triangle" style="width:18px;height:18px;color:var(--red-600)"></i>
              <h3 style="font-size: 1rem; font-weight: 700; color: var(--red-800); margin: 0;">Danger Zone (Permanent Deletion)</h3>
            </div>
            <div style="padding: 24px; display: flex; flex-direction: column; gap: 20px;">
              <p style="font-size: 13px; color: var(--slate-600); margin: 0; line-height: 1.5;">
                Permanently purge this account and its associated ${state.settingsTargetType === 'user' ? 'cryptographic passkeys, registered biometrics, permissions, and profile' : 'assistant directory profile'} from the secure central MySQL database. <strong>This action is absolute, immediate, and irreversible.</strong>
              </p>
              
              <div style="display: flex; flex-direction: column; gap: 12px; padding: 16px; background: white; border: 1px solid var(--red-200); border-radius: 8px;">
                <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; user-select: none;">
                  <input type="checkbox" id="settings-confirm-delete" style="margin-top: 3px; cursor: pointer;">
                  <span style="font-size: 13px; font-weight: 600; color: var(--red-700);">
                    I understand that this will permanently erase this account${state.settingsTargetType === 'user' ? ' and revoke all FIDO2/WebAuthn credentials associated with it' : ''}.
                  </span>
                </label>
                
                <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
                  <button onclick="submitAccountDeletion()" class="btn" style="background: var(--red-600); color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="trash-2" style="width:16px;height:16px"></i> Delete Account
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      ` : ''}

    </div>
  `;
}

function renderGeneralUserNationalIdLookup(container, canReset) {
  const user = state.generalUserLookupResult;
  const fields = user ? [
    ['Account ID', user.id],
    ['Full name', user.full_name],
    ['National ID', user.national_id],
    ['Email', user.email],
    ['Phone', user.phone],
    ['WhatsApp', user.whatsapp],
    ['Status', user.status],
    ['Failed attempts', user.failed_attempts],
    ['Blocked until', user.blocked_until],
    ['Last login', user.last_login],
    ['Last logout', user.last_logout],
    ['Created', user.created_at],
    ['Updated', user.updated_at]
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '') : [];
  container.innerHTML = `
    <div class="max-w-5xl pb-12 space-y-6" style="animation:fadeIn .3s ease-out;">
      <div class="notif-page-header" style="border-left:4px solid var(--slate-600);margin-bottom:24px;">
        <div class="notif-page-header-bar" style="background:var(--slate-600);"></div>
        <div class="notif-page-header-content"><div>
          <h1 class="notif-page-title" style="font-size:1.8rem;font-weight:800;color:var(--slate-800);margin:0 0 4px;">General User Account Lookup</h1>
          <p class="notif-page-subtitle" style="font-size:.9rem;color:var(--slate-500);margin:0;">Verify the National ID to view or manage the matching General User account.</p>
        </div></div>
      </div>
      <section style="background:white;border:1px solid var(--slate-200);border-radius:12px;padding:24px;display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;justify-content:flex-end;">
          <button type="button" class="btn btn-outline" onclick="setSettingsTargetType('assistant')">Assistant settings</button>
        </div>
        <label class="form-label" for="settings-general-user-national-id">National ID</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <input id="settings-general-user-national-id" class="form-input" type="text" maxlength="14" minlength="8" pattern="[A-Za-z0-9]{8,14}" autocomplete="off" value="${esc(state.generalUserLookupId || '')}" placeholder="e.g. 12345678A12" oninput="clearGeneralUserLookup()" style="max-width:420px;">
          <button type="button" class="btn btn-primary" onclick="lookupGeneralUserByNationalId()">Find account</button>
        </div>
        ${state.generalUserLookupError ? `<div role="alert" style="padding:10px 14px;border:1px solid var(--red-200);border-radius:8px;background:var(--red-50);color:var(--red-800);font-size:13px;">${esc(state.generalUserLookupError)}</div>` : ''}
        ${user ? `<div id="general-user-details">
          <div class="settings-account-details">
            <strong>General User account</strong>
            ${fields.map(([label, value]) => `<div><small>${esc(label)}</small><span>${esc(value ?? '-')}</span></div>`).join('')}
          </div>
          ${canReset ? `
            <div style="border:1px solid var(--slate-200);border-radius:10px;padding:20px;">
              <h3 style="margin:0 0 14px;color:var(--slate-800);font-size:1rem;">Reset account password</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
                <div class="form-group"><label class="form-label" for="settings-general-user-new-password">New password</label><input id="settings-general-user-new-password" type="password" class="form-input" autocomplete="new-password" minlength="8"></div>
                <div class="form-group"><label class="form-label" for="settings-general-user-confirm-password">Confirm new password</label><input id="settings-general-user-confirm-password" type="password" class="form-input" autocomplete="new-password" minlength="8"></div>
              </div>
              <button type="button" class="btn btn-primary" onclick="resetGeneralUserPasswordByNationalId()">Update password</button>
            </div>
          ` : ''}
        </div>` : ''}
      </section>
    </div>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function clearGeneralUserLookup() {
  state.generalUserLookupId = document.getElementById('settings-general-user-national-id')?.value || '';
  state.generalUserLookupResult = null;
  state.generalUserLookupError = '';
  document.getElementById('general-user-details')?.remove();
}

async function lookupGeneralUserByNationalId() {
  const nationalId = document.getElementById('settings-general-user-national-id')?.value.trim() || '';
  state.generalUserLookupId = nationalId;
  state.generalUserLookupResult = null;
  state.generalUserLookupError = '';
  if (!isValidNationalIdInput(nationalId)) {
    state.generalUserLookupError = 'Enter a valid National ID with 8 to 14 letters and numbers, including at least one letter and one number.';
    renderContent();
    return;
  }
  try {
    const response = await fetch(`../api/general-users.php?action=lookup&national_id=${encodeURIComponent(nationalId)}`, { credentials: 'include' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to find the account.');
    state.generalUserLookupResult = result.user;
  } catch (error) {
    state.generalUserLookupError = error.message || 'Unable to find the account.';
  }
  renderContent();
}

async function resetGeneralUserPasswordByNationalId() {
  const user = state.generalUserLookupResult;
  const nationalId = state.generalUserLookupId.trim();
  const password = document.getElementById('settings-general-user-new-password')?.value || '';
  const confirmation = document.getElementById('settings-general-user-confirm-password')?.value || '';
  if (!user || !nationalId) {
    showToast('Look up a General User by National ID first.', 'error');
    return;
  }
  if (password.length < 8) {
    showToast('New password must be at least 8 characters.', 'error');
    return;
  }
  if (password !== confirmation) {
    showToast('The passwords do not match.', 'error');
    return;
  }
  try {
    const response = await fetch('../api/general-users.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: user.id, national_id: nationalId, action: 'reset-password', new_password: password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to reset the password.');
    showToast(result.message || 'Password updated successfully.', 'success');
    state.generalUserLookupResult = null;
    await lookupGeneralUserByNationalId();
  } catch (error) {
    showToast(error.message || 'Unable to reset the password.', 'error');
  }
}

function setSettingsTargetType(type) {
  state.settingsTargetType = type;
  state.settingsTargetId = '';
  state.generalUserLookupResult = null;
  state.generalUserLookupError = '';
  renderContent();
}

function setSettingsSearch(value) {
  state.settingsSearch = value;
  const isAssistant = state.settingsTargetType === 'assistant';
  const items = isAssistant ? (state.assistants || []) : (state.generalUsers || []);
  const term = value.trim().toLowerCase();
  const matches = items.filter(item => [item.full_name, item.name, item.email, item.role, item.phone, item.whatsapp]
    .some(field => String(field || '').toLowerCase().includes(term)));
  const select = document.getElementById('settings-account-select');
  if (select) {
    const selectedId = String(state.settingsTargetId || '');
    const selectionMatches = matches.some(item => String(item.id) === selectedId);
    const options = matches.map(item => `
      <option value="${esc(item.id)}" ${selectionMatches && String(item.id) === selectedId ? 'selected' : ''}>
        ${esc(isAssistant ? getAssistantDisplayName(item) : (item.full_name || item.name || item.email))} [ID: ${esc(item.id)}]
      </option>
    `).join('');
    select.innerHTML = selectionMatches || !selectedId
      ? (options || `<option value="">No ${isAssistant ? 'Assistants' : 'General Users'} Available</option>`)
      : `<option value="">Select a matching ${isAssistant ? 'assistant' : 'general user'}</option>${options}`;
  }
  const count = document.getElementById(isAssistant ? 'settings-assistant-count' : 'settings-user-count');
  if (count) count.textContent = `${matches.length} of ${items.length}`;
}

function setSettingsTargetId(id) {
  state.settingsTargetId = id;
  renderContent();
}

async function submitPasswordReset() {
  const passwordInput = document.getElementById('settings-new-password');
  const confirmationInput = document.getElementById('settings-confirm-password');
  if (!passwordInput || !confirmationInput || !passwordInput.value || !confirmationInput.value) {
    showToast('Enter and confirm the new password', 'error');
    return;
  }
  if (passwordInput.value !== confirmationInput.value) {
    showToast('The passwords do not match', 'error');
    return;
  }
  if (passwordInput.value.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }
  
  const id = state.settingsTargetId;
  const target_type = state.settingsTargetType;
  const new_password = passwordInput.value;
  
  try {
    const isGeneralUser = target_type === 'user';
    const res = await fetch(isGeneralUser ? '../api/general-users.php' : '../api/users.php?action=reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isGeneralUser
        ? { id, action: 'reset-password', new_password }
        : { id, target_type, new_password })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Password reset successfully', 'success');
      closeModal();
      await refreshSettingsCredentialData();
    } else {
      showToast(data.error || 'Failed to reset password', 'error');
    }
  } catch (err) {
    showToast('Network error while resetting password', 'error');
  }
}

function openSettingsPasswordModal() {
  const body = `
    <div class="change-password-section">
      <p style="margin:0 0 16px;color:var(--slate-500);font-size:13px;">Set a new password for the selected account. Existing passwords cannot be viewed.</p>
      <div class="form-group">
        <label class="form-label" for="settings-new-password">New Password</label>
        <div style="position:relative;">
          <input type="password" class="form-input form-input-sm" id="settings-new-password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters" style="padding-right:42px;">
          <button type="button" onclick="togglePasswordVisibility('settings-new-password', 'settings-new-password-eye')" aria-label="Show password" title="Show password" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--slate-500);cursor:pointer;padding:5px;display:flex;align-items:center;"><i id="settings-new-password-eye" data-lucide="eye" style="width:17px;height:17px"></i></button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="settings-confirm-password">Confirm New Password</label>
        <div style="position:relative;">
          <input type="password" class="form-input form-input-sm" id="settings-confirm-password" autocomplete="new-password" minlength="8" placeholder="Confirm new password" style="padding-right:42px;">
          <button type="button" onclick="togglePasswordVisibility('settings-confirm-password', 'settings-confirm-password-eye')" aria-label="Show password" title="Show password" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--slate-500);cursor:pointer;padding:5px;display:flex;align-items:center;"><i id="settings-confirm-password-eye" data-lucide="eye" style="width:17px;height:17px"></i></button>
        </div>
      </div>
    </div>`;
  openModal('Change Password', body, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitPasswordReset()">Update Password</button>`);
  document.getElementById('modal')?.classList.add('profile-modal', 'change-password-modal');
  document.getElementById('settings-new-password')?.focus();
}

async function submitPasskeyReset() {
  if (!confirm('Are you sure you want to revoke all registered biometric/FIDO2 passkeys for this account?')) return;
  
  const id = state.settingsTargetId;
  const target_type = state.settingsTargetType;
  
  try {
    const res = await fetch(target_type === 'user' ? '../api/general-users.php' : '../api/users.php?action=reset-passkey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target_type === 'user' ? { id, action: 'reset-passkey' } : { id, target_type })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Passkeys reset successfully', 'success');
      await refreshSettingsCredentialData();
    } else {
      showToast(data.error || 'Failed to reset passkeys', 'error');
    }
  } catch (err) {
    showToast('Network error while resetting passkeys', 'error');
  }
}

async function refreshSettingsCredentialData() {
  try {
    const response = await fetch('../api/users.php', { credentials: 'include' });
    if (response.ok) state.users = await response.json();
  } catch (err) {
    console.warn('Failed to refresh account credentials:', err);
  }
  await loadPasskeys();
  renderContent();
}

async function submitStatusAction(action) {
  const id = state.settingsTargetId;
  const target_type = state.settingsTargetType;
  
  try {
    const res = await fetch(target_type === 'user' ? '../api/general-users.php' : '../api/users.php?action=status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target_type === 'user'
        ? { id, action: 'status', status: action === 'unblock' ? 'active' : action === 'suspend' ? 'suspended' : 'blocked' }
        : { id, target_type, action })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Account status updated', 'success');
      
      const newStatus = action === 'block' ? 'blocked' : action === 'suspend' ? 'suspended' : 'active';
      if (target_type === 'user') {
        const u = state.generalUsers.find(x => String(x.id) === String(id));
        if (u) u.status = newStatus;
      } else {
        const a = state.assistants.find(x => String(x.id) === String(id));
        if (a) a.status = newStatus;
      }
      renderContent();
    } else {
      showToast(data.error || 'Failed to update status', 'error');
    }
  } catch (err) {
    showToast('Network error while updating status', 'error');
  }
}

async function submitAccountDeletion() {
  const confirmBox = document.getElementById('settings-confirm-delete');
  if (!confirmBox || !confirmBox.checked) {
    showToast('Please check the confirmation box to authorize deletion', 'error');
    return;
  }
  
  const id = state.settingsTargetId;
  const target_type = state.settingsTargetType;
  
  if (!confirm(`CRITICAL WARNING: Are you absolutely certain you want to permanently delete this ${target_type} account? This will wipe all data and revoke all access.`)) return;
  
  try {
    const res = await fetch(target_type === 'user' ? '../api/general-users.php' : '../api/users.php?action=delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target_type === 'user' ? { id, action: 'delete' } : { id, target_type })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Account successfully deleted', 'success');
      
      if (target_type === 'user') {
        state.generalUsers = state.generalUsers.filter(x => String(x.id) !== String(id));
      } else {
        state.assistants = state.assistants.filter(x => String(x.id) !== String(id));
      }
      state.settingsTargetId = '';
      renderContent();
    } else {
      showToast(data.error || 'Failed to delete account', 'error');
    }
  } catch (err) {
    showToast('Network error while deleting account', 'error');
  }
}

/* ===== HELPERS ===== */
function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function getAssistantName(id) {
  if (!id) return 'Unassigned';
  const a = state.assistants.find(x => x.id === id);
  return a ? a.name : 'Unassigned';
}

function statusBadge(status) {
  const normalizedStatus = ['Pending', 'In Progress', 'Resolved'].includes(status) ? status : 'Pending';
  const cls = normalizedStatus === 'Resolved' ? 'resolved' : normalizedStatus === 'Pending' ? 'pending' : 'in-progress';
  return `<span class="status-badge ${cls}">${esc(normalizedStatus)}</span>`;
}

function statusBadgePrint(status) {
  const normalizedStatus = ['Pending', 'In Progress', 'Resolved'].includes(status) ? status : 'Pending';
  const bg = normalizedStatus === 'Resolved' ? 'var(--green-100)' : normalizedStatus === 'In Progress' ? 'var(--blue-100)' : 'var(--amber-100)';
  const color = normalizedStatus === 'Resolved' ? 'var(--green-800)' : normalizedStatus === 'In Progress' ? 'var(--blue-800)' : 'var(--amber-800)';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:${bg};color:${color}">${esc(normalizedStatus)}</span>`;
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return diffMins + 'm ago';
  if (diffHours < 24) return diffHours + 'h ago';
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString();
}

function getNotifIconSmall(type) {
  switch (type) {
    case 'success': return '<i data-lucide="check-circle" style="width:16px;height:16px;color:var(--green-500)"></i>';
    case 'warning': return '<i data-lucide="alert-circle" style="width:16px;height:16px;color:var(--amber-500)"></i>';
    case 'error': return '<i data-lucide="alert-circle" style="width:16px;height:16px;color:var(--red-500)"></i>';
    default: return '<i data-lucide="info" style="width:16px;height:16px;color:var(--blue-500)"></i>';
  }
}

function getNotifConfig(type) {
  switch (type) {
    case 'success': return { icon: 'check-circle', color: 'var(--emerald-500)', bg: 'var(--emerald-50)', barColor: 'var(--emerald-500)', borderColor: 'rgba(16,185,129,.2)' };
    case 'warning': return { icon: 'alert-circle', color: 'var(--amber-500)', bg: 'var(--amber-50)', barColor: 'var(--amber-500)', borderColor: 'rgba(245,158,11,.2)' };
    case 'error': return { icon: 'alert-circle', color: 'var(--red-500)', bg: 'var(--red-50)', barColor: 'var(--red-500)', borderColor: 'rgba(239,68,68,.2)' };
    default: return { icon: 'info', color: 'var(--blue-500)', bg: 'var(--blue-50)', barColor: 'var(--blue-500)', borderColor: 'rgba(59,130,246,.2)' };
  }
}

function getAssistantRemainingTime(a) {
  if (a.status !== 'disabled' || !a.disabledAt || !a.disableDuration) return null;
  const start = new Date(a.disabledAt);
  const days = parseInt(a.disableDuration) || 0;
  const end = new Date(start);
  end.setDate(start.getDate() + days);
  const diff = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  return diff <= 0 ? 'Expired' : diff + ' days left';
}

function getDisableInfo(a) {
  if (a.status !== 'disabled' || !a.disabledAt || !a.disableDuration) return null;
  const start = new Date(a.disabledAt);
  const days = parseInt(a.disableDuration) || 0;
  const end = new Date(start);
  end.setDate(start.getDate() + days);
  const diff = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  return { total: a.disableDuration, remaining: diff > 0 ? diff + ' days' : 'Expired', reason: a.disableReason, date: start.toLocaleDateString() };
}
