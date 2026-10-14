/* ===== IECMS ADMIN DASHBOARD - VIEWS MODULE ===== */
/* All content views, renderers, and view-related functions */

/* ===== CONTENT DISPATCHER ===== */
function renderContent() {
  // Destroy old charts
  Object.values(chartInstances).forEach(c => {
    if (c && typeof c.destroy === 'function') c.destroy();
  });
  chartInstances = {};

  const content = document.getElementById('content');
  if (!content) return;
  if (isLoading) {
    content.innerHTML = `<div class="loading-container"><div class="spinner"></div><p class="loading-text">Loading data...</p></div>`;
    return;
  }
  switch (state.activeTab) {
    case 'dashboard': renderDashboard(content); break;
    case 'team': renderTeam(content); break;
    case 'assignments': renderAssignments(content); break;
    case 'register': renderRegister(content); break;
    case 'records': renderRecords(content); break;
    case 'notifications': renderNotifications(content); break;
    case 'settings': renderSettings(content); break;
    default: content.innerHTML = '';
  }
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/* ===== DASHBOARD ===== */
function renderDashboard(container) {
  const startDate = new Date(state.dashFilter.start);
  const endDate = new Date(state.dashFilter.end);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  const dashTickets = state.tickets.filter(t => {
    const d = new Date(t.date);
    return d >= startDate && d <= endDate;
  });
  const total = dashTickets.length;
  const pending = dashTickets.filter(t => String(t.status).toLowerCase() !== 'resolved').length;
  const isAssistant = String(state.currentUserRole || '').toLowerCase() === 'assistant';
  const online = state.assistants.filter(a => a.status === 'online' && (!isAssistant || String(a.role).toLowerCase() === 'assistant')).length;
  const cats = {};
  dashTickets.forEach(t => { const cat = t.category || 'N/A'; cats[cat] = (cats[cat] || 0) + 1; });
  const dominant = Object.keys(cats).length ? Object.keys(cats).reduce((a, b) => cats[b] > (cats[a] || 0) ? b : a) : 'N/A';

  container.innerHTML = `
    <div class="space-y-8">
      <div class="dash-controls">
        <h2><i data-lucide="layers" style="width:20px;height:20px;color:var(--emerald-600)"></i> Analytics Overview</h2>
        <div class="dash-range">
          <label>Range:</label>
          <input type="date" id="dash-start" value="${state.dashFilter.start}" onchange="updateDashFilter('start', this.value)">
          <span class="dash-range-sep">-</span>
          <input type="date" id="dash-end" value="${state.dashFilter.end}" onchange="updateDashFilter('end', this.value)">
        </div>
      </div>
      <div class="metrics-grid">
        ${metricCardHtml(isAssistant ? 'My Tasks' : 'Total Issues', total, 'layers', 'emerald', 'total')}
        ${metricCardHtml(isAssistant ? 'Other Assistants Online' : 'Staff Online', online, 'user-check', 'green', 'active')}
        ${metricCardHtml('Dominant Issue', dominant, 'alert-circle', 'amber', 'dominant')}
        ${metricCardHtml('Pending Tasks', pending, 'clock', 'rose', 'pending')}
      </div>
      <div id="drilldown-container"></div>
      <div class="charts-grid">
        <div class="chart-card"><h3>Category Distribution</h3><div class="chart-wrapper"><canvas id="category-chart"></canvas></div></div>
            <div class="chart-card"><h3>${isAssistant ? 'My Completed and Pending Tasks' : 'Completed and Pending by Assistant'}</h3><div class="chart-wrapper"><canvas id="resolved-chart"></canvas></div></div>
      </div>
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (state.drillDown) renderDrillDown(dashTickets, dominant);
  renderCategoryChart(cats);
  renderResolvedChart(dashTickets);
}

function metricCardHtml(title, value, icon, color, type) {
  const active = state.drillDown === type;
  return `
    <div class="metric-card ${active ? 'active' : ''}" onclick="toggleDrillDown('${type}')">
      <div class="metric-card-inner">
        <div><p class="metric-card-label">${title}</p><h3 class="metric-card-value">${esc(String(value))}</h3></div>
        <div class="metric-card-icon ${color}"><i data-lucide="${icon}" style="width:24px;height:24px"></i></div>
      </div>
    </div>
  `;
}

function toggleDrillDown(type) {
  state.drillDown = state.drillDown === type ? null : type;
  renderContent();
  if (state.drillDown === 'active' && typeof refreshAssistantsForDrilldown === 'function') {
    refreshAssistantsForDrilldown();
  }
}

function updateDashFilter(key, value) {
  state.dashFilter[key] = value;
  renderContent();
}

function renderDrillDown(dashTickets, dominant) {
  const container = document.getElementById('drilldown-container');
  if (!container) return;
  if (!state.drillDown) { container.innerHTML = ''; return; }
  let bodyHtml = '';
  if (state.drillDown === 'active') {
    if (String(state.currentUserRole || '').toLowerCase() === 'assistant') {
      const otherAssistants = state.assistants.filter(a => String(a.role).toLowerCase() === 'assistant');
      bodyHtml = otherAssistants.length > 0
        ? `<div class="drilldown-staff-grid">${otherAssistants.map(a => `
            <div class="drilldown-staff-item" style="cursor:default">
              <span class="drilldown-staff-name"><span class="status-dot ${a.status === 'online' ? 'online' : 'offline'}"></span>${esc(a.name)}</span>
              <span class="drilldown-staff-role">${a.status === 'online' ? 'Online' : 'Offline'}</span>
            </div>`).join('')}</div>`
        : '<p class="contact-empty">No other assistant profiles are available.</p>';
    } else if (state.selectedDrilldownAssistantId) {
      const a = state.assistants.find(as => as.id === state.selectedDrilldownAssistantId);
      if (a) {
        const assistantTickets = state.tickets.filter(t => Number(t.assignee) === Number(a.id));
        const totalAssigned = assistantTickets.length;
        const resolvedCount = assistantTickets.filter(t => String(t.status).toLowerCase() === 'resolved').length;
        const pendingCount = assistantTickets.filter(t => String(t.status).toLowerCase() !== 'resolved').length;
        const tableRows = assistantTickets.length > 0 ? assistantTickets.map(t => `
          <tr><td style="font-family:monospace;font-size:.75rem;font-weight:700;color:var(--emerald-700)">${esc(t.id)}</td>
          <td style="color:var(--slate-600);white-space:nowrap">${esc(t.date)}</td>
          <td style="color:var(--slate-600);white-space:nowrap">${esc(t.type)}</td>
          <td style="color:var(--slate-500)">${esc(t.category || '-')}</td>
          <td style="color:var(--slate-600);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.description)}">${esc(t.description)}</td>
          <td>${statusBadge(t.status)}</td></tr>
        `).join('') : `<tr><td colspan="6" class="empty-row" style="text-align:center;padding:32px;color:var(--slate-400)">No tickets assigned to this assistant.</td></tr>`;
        bodyHtml = `<div class="drilldown-assistant-details-view" style="animation: fadeIn 0.3s ease-out;">
          <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <button class="btn btn-sm" onclick="clearDrilldownAssistantSelection()" style="background:var(--slate-100);color:var(--slate-700);border:1px solid var(--slate-200);display:flex;align-items:center;gap:6px;font-weight:600;padding:6px 12px;border-radius:6px;font-size:12px;">
              <i data-lucide="arrow-left" style="width:14px;height:14px;"></i> Back
            </button></div>
          <div class="drilldown-details-layout">
            <div class="assistant-details-card">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <div style="width:48px;height:48px;border-radius:50%;background:var(--emerald-100);color:var(--emerald-800);font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:1.1rem;border:1px solid var(--emerald-200);">
                  ${esc(getInitials(a.name))}</div>
                <div><h4 style="font-weight:700;color:var(--slate-800);font-size:1.05rem;line-height:1.2;">${esc(a.name)}</h4>
                  <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--emerald-700);background:var(--emerald-50);padding:2px 6px;border-radius:4px;display:inline-block;margin-top:2px;">${esc(a.role)}</span></div>
              </div>
              <div style="font-size:12.5px;color:var(--slate-600);display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--slate-200);padding-bottom:14px;margin-bottom:14px;">
                <div style="display:flex;align-items:center;gap:8px;"><i data-lucide="mail" style="width:14px;height:14px;color:var(--slate-400);"></i><span>${esc(a.email)}</span></div>
                <div style="display:flex;align-items:center;gap:8px;"><i data-lucide="phone" style="width:14px;height:14px;color:var(--slate-400);"></i><span>${esc(a.phone || 'Not set')}</span></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;">
                <div style="background:#fff;padding:8px;border-radius:6px;border:1px solid var(--slate-200);">
                  <span style="display:block;font-size:1.2rem;font-weight:700;color:var(--emerald-600);">${resolvedCount}</span>
                  <span style="font-size:9px;color:var(--slate-400);text-transform:uppercase;font-weight:700;">Resolved</span>
                </div>
                <div style="background:#fff;padding:8px;border-radius:6px;border:1px solid var(--slate-200);">
                  <span style="display:block;font-size:1.2rem;font-weight:700;color:var(--amber-500);">${pendingCount}</span>
                  <span style="font-size:9px;color:var(--slate-400);text-transform:uppercase;font-weight:700;">Pending</span>
                </div>
              </div>
            </div>
            <div class="drilldown-bug-container">
              <div style="background:var(--slate-50);padding:10px 16px;border-bottom:1px solid var(--slate-200);"><h4 style="font-weight:700;color:var(--slate-700);font-size:0.95rem;display:flex;align-items:center;gap:6px;margin:0;">
                <i data-lucide="bug" style="width:16px;height:16px;color:var(--red-500);"></i> Assigned Tickets (${totalAssigned})</h4>
              </div>
              <div class="table-wrapper" style="max-height:190px;overflow-y:auto;flex:1;">
                <table><thead><tr><th>ID</th><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Status</th></tr></thead>
                  <tbody>${tableRows}</tbody></table></div></div></div></div>`;
      } else {
        state.selectedDrilldownAssistantId = null;
      }
    }
    if (String(state.currentUserRole || '').toLowerCase() !== 'assistant' && !state.selectedDrilldownAssistantId) {
      bodyHtml = `<div class="drilldown-staff-grid">${state.assistants.map(a => `
        <div class="drilldown-staff-item" onclick="selectDrilldownAssistant(${a.id})">
          <span class="drilldown-staff-name" title="${esc(getPresenceLabel(a))}"><span class="status-dot ${a.status === 'online' ? 'online' : 'offline'}" title="${esc(getPresenceLabel(a))}"></span>${esc(a.name)}</span>
          <span class="drilldown-staff-role">${esc(a.role)}</span></div>`).join('')}</div>`;
    }
  } else {
    let filtered = dashTickets;
    if (state.drillDown === 'pending') filtered = dashTickets.filter(t => String(t.status).toLowerCase() !== 'resolved');
    if (state.drillDown === 'dominant') filtered = dashTickets.filter(t => t.category === dominant);
    const columns = ['id', 'date', 'type', 'category', 'description', 'status'];
    const bodyRows = filtered.length > 0 ? filtered.map(t => `<tr>
      <td class="mono">${esc(t.id)}</td><td>${esc(t.date)}</td><td>${esc(t.type)}</td>
      <td>${esc(t.category || '-')}</td><td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;">${esc(t.description)}</td>
      <td>${statusBadge(t.status)}</td></tr>`).join('') : `<tr><td colspan="6" class="empty-row">No tickets found</td></tr>`;
    bodyHtml = `<div class="table-wrapper"><table><thead><tr><th>ID</th><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Status</th></tr></thead>
      <tbody>${bodyRows}</tbody></table></div>`;
  }
  container.innerHTML = `<div class="drilldown-panel"><div class="drilldown-header">
    <h3><span class="drilldown-bar"></span> ${state.drillDown.replace('-', ' ')} Drill-Down</h3>
    <button class="drilldown-close" onclick="toggleDrillDown('${state.drillDown}')"><i data-lucide="x" style="width:20px;height:20px"></i></button>
  </div><div class="drilldown-body">${bodyHtml}</div></div>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderCategoryChart(cats) {
  const canvas = document.getElementById('category-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  const labels = Object.keys(cats);
  const values = Object.values(cats);
  const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#6366f1'];
  if (labels.length === 0) { labels.push('No Data'); values.push(1); }
  chartInstances.category = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: labels[0] === 'No Data' ? ['#e2e8f0'] : COLORS.slice(0, labels.length), borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '55%' }
  });
}

function renderResolvedChart(dashTickets) {
  const canvas = document.getElementById('resolved-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  const isAssistant = String(state.currentUserRole || '').toLowerCase() === 'assistant';
  const data = isAssistant ? [{
    name: 'My Tasks',
    completed: dashTickets.filter(t => String(t.status).toLowerCase() === 'resolved').length,
    pending: dashTickets.filter(t => String(t.status).toLowerCase() !== 'resolved').length
  }] : state.assistants.map(a => {
    const assistantTickets = dashTickets.filter(t => Number(t.assignee) === Number(a.id));
    return {
      name: a.name,
      completed: assistantTickets.filter(t => String(t.status).toLowerCase() === 'resolved').length,
      pending: assistantTickets.filter(t => String(t.status).toLowerCase() !== 'resolved').length
    };
  });
  chartInstances.resolved = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name),
      datasets: [
        { label: 'Completed (green)', data: data.map(d => d.completed), backgroundColor: '#059669', borderColor: '#047857', borderWidth: 1, borderRadius: 4, barThickness: 40 },
        { label: 'Pending (orange)', data: data.map(d => d.pending), backgroundColor: '#f59e0b', borderColor: '#d97706', borderWidth: 1, borderRadius: 4, barThickness: 40 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      scales: { x: { stacked: true, ticks: { color: '#64748b', font: { size: 11 } }, grid: { display: false }, border: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: '#64748b', font: { size: 12 } }, grid: { color: '#f1f5f9' }, border: { display: false } } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#475569', padding: 14, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 11, weight: '600' } }
        },
        tooltip: {
          enabled: true,
          callbacks: {
            title: items => items[0]?.label || '',
            label: context => `${context.dataset.label}: ${context.parsed.y}`
          }
        }
      }
    }
  });
}

function selectDrilldownAssistant(id) {
  state.selectedDrilldownAssistantId = id;
  renderContent();
}

function clearDrilldownAssistantSelection() {
  state.selectedDrilldownAssistantId = null;
  renderContent();
}

/* ===== HELPER UTILITIES ===== */
function getAssistantName(id) {
  const a = state.assistants.find(x => x.id === id);
  return a ? a.name : 'Unassigned';
}

function statusBadge(status) {
  const colors = {
    'Resolved': { bg: '#d1fae5', color: '#065f46', border: '#a7f3d0' },
    'In Progress': { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
    'Pending': { bg: '#fecaca', color: '#7c2d12', border: '#fca5a5' }
  };
  const s = colors[status] || colors.Pending;
  return `<span style="background:${s.bg};color:${s.color};padding:4px 8px;border-radius:4px;font-weight:600;font-size:11px;border:1px solid ${s.border}">${status}</span>`;
}

function statusBadgePrint(status) {
  return `<span style="font-weight:700;font-size:10px;text-transform:uppercase;padding:2px 6px;border-radius:3px;${status === 'Resolved' ? 'background:#d1fae5;color:#065f46' : status === 'In Progress' ? 'background:#dbeafe;color:#1e40af' : 'background:#fef3c7;color:#78350f'}">${status}</span>`;
}

function formatTimeAgo(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function getNotifIconSmall(type) {
  const config = getNotifConfig(type);
  return `<div style="width:32px;height:32px;border-radius:6px;background:${config.bg};color:${config.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
    <i data-lucide="${config.icon}" style="width:16px;height:16px"></i></div>`;
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
