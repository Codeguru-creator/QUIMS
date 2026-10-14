/* ===== IECMS ADMIN DASHBOARD - LOADER/INDEX ===== */
/* Imports all modules and exposes functions to global scope */

/* This file must be loaded AFTER:
   1. app-core.js
   2. app-api.js
   3. app-ui.js
   4. app-views.js (or app-views-partial.js + inline view functions)
*/

// Expose core functions to window for onclick handlers in HTML
window.state = state;
window.toasts = toasts;
window.chartInstances = chartInstances;

// API functions
window.loadCurrentUserProfileWithRetry = loadCurrentUserProfileWithRetry;
window.loadInitialData = loadInitialData;
window.loadPasskeys = loadPasskeys;
window.refreshAssistantsForDrilldown = refreshAssistantsForDrilldown;
window.loadNotifications = loadNotifications;
window.markNotificationRead = markNotificationRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.deleteNotification = deleteNotification;
window.confirmDeleteNotification = confirmDeleteNotification;

// UI functions
window.renderSidebar = renderSidebar;
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.updateSidebarState = updateSidebarState;
window.updateNotifBadge = updateNotifBadge;
window.showNotifPreview = showNotifPreview;
window.hideNotifPreview = hideNotifPreview;
window.handleBellClick = handleBellClick;
window.toggleContactMenu = toggleContactMenu;
window.renderContactMenu = renderContactMenu;
window.setContactType = setContactType;
window.setupOutsideClicks = setupOutsideClicks;
window.openModal = openModal;
window.closeModal = closeModal;
window.openProfileModal = openProfileModal;
window.handleProfilePicUpload = handleProfilePicUpload;
window.toggleChangePassword = toggleChangePassword;
window.handleChangePassword = handleChangePassword;

// Core functions
window.renderContent = renderContent;
window.normalizeRole = normalizeRole;
window.getInitials = getInitials;
window.getAssistantDisplayName = getAssistantDisplayName;
window.getCurrentProfileUser = getCurrentProfileUser;
window.getSafeProfileDisplayName = getSafeProfileDisplayName;
window.formatLastSeen = formatLastSeen;
window.getPresenceLabel = getPresenceLabel;
window.loadProfilePicture = loadProfilePicture;
window.updateProfileHeader = updateProfileHeader;
window.loadSidebarLogo = loadSidebarLogo;
window.setSidebarLogo = setSidebarLogo;
window.startClock = startClock;
window.addToast = addToast;
window.showToast = showToast;
window.removeToast = removeToast;
window.renderToasts = renderToasts;
window.openSignOutModal = openSignOutModal;
window.handleSignOut = handleSignOut;
window.esc = esc;

// View functions - Dashboard
window.renderDashboard = renderDashboard;
window.metricCardHtml = metricCardHtml;
window.toggleDrillDown = toggleDrillDown;
window.updateDashFilter = updateDashFilter;
window.renderDrillDown = renderDrillDown;
window.renderCategoryChart = renderCategoryChart;
window.renderResolvedChart = renderResolvedChart;
window.selectDrilldownAssistant = selectDrilldownAssistant;
window.clearDrilldownAssistantSelection = clearDrilldownAssistantSelection;

// View functions - Team (stub - full implementation in app-views.js)
window.renderTeam = renderTeam || (() => {});
window.assistantCardHtml = assistantCardHtml || (() => '');
window.selectAssistant = selectAssistant || (() => {});
window.assignmentPanelHtml = assignmentPanelHtml || (() => '');

// View functions - Register (stub)
window.renderRegister = renderRegister || (() => {});
window.onRegTypeChange = onRegTypeChange || (() => {});
window.onPCopyingDescChange = onPCopyingDescChange || (() => {});
window.onRegAssigneeChange = onRegAssigneeChange || (() => {});
window.onRegExternalChange = onRegExternalChange || (() => {});
window.onVsCommentChange = onVsCommentChange || (() => {});
window.updateVsCommentCount = updateVsCommentCount || (() => {});
window.updateRegSubmitBtn = updateRegSubmitBtn || (() => {});
window.handleAIGenerate = handleAIGenerate || (() => {});
window.onRegFTUChange = onRegFTUChange || (() => {});
window.openFTUModal = openFTUModal || (() => {});
window.onFTUNameModeChange = onFTUNameModeChange || (() => {});
window.validateStaffDetailsInput = validateStaffDetailsInput || (() => {});
window.validateVsSignatureInput = validateVsSignatureInput || (() => {});
window.validateFTU = validateFTU || (() => {});
window.togglePasswordVisibility = togglePasswordVisibility || (() => {});
window.cancelFTU = cancelFTU || (() => {});
window.confirmFTU = confirmFTU || (() => {});
window.showDisappearingFtuMessage = showDisappearingFtuMessage || (() => {});
window.verifyPasskey = verifyPasskey || (() => {});
window.validateVerificationPasskey = validateVerificationPasskey || (() => {});
window.submitPasskeyVerification = submitPasskeyVerification || (() => {});
window.showPasskeyPassScreen = showPasskeyPassScreen || (() => {});
window.approveSignature = approveSignature || (() => {});
window.handleRegisterSubmit = handleRegisterSubmit || (() => {});

// View functions - Records (stub)
window.renderRecords = renderRecords || (() => {});
window.updateRecordsFilter = updateRecordsFilter || (() => {});
window.handleRecordsSort = handleRecordsSort || (() => {});
window.confirmDeleteTicket = confirmDeleteTicket || (() => {});
window.deleteTicket = deleteTicket || (() => {});
window.openEditTicketModal = openEditTicketModal || (() => {});
window.handleEditTicketSubmit = handleEditTicketSubmit || (() => {});
window.editTicket = editTicket || (() => {});
window.openPrintPreview = openPrintPreview || (() => {});
window.buildPrintPreviewHtml = buildPrintPreviewHtml || (() => '');
window.setPrintHistoryForMasterRecords = setPrintHistoryForMasterRecords || (() => {});
window.togglePrintHistoryForTicket = togglePrintHistoryForTicket || (() => {});
window.togglePrintLogoLock = togglePrintLogoLock || (() => {});
window.removePrintLogo = removePrintLogo || (() => {});
window.handlePrintPDF = handlePrintPDF || (() => {});
window.handlePrintLogoUpload = handlePrintLogoUpload || (() => {});
window.handlePrintStampUpload = handlePrintStampUpload || (() => {});
window.setupPrintDragHandlers = setupPrintDragHandlers || (() => {});

// View functions - Notifications (stub)
window.renderNotifications = renderNotifications || (() => {});
window.notifItemHtml = notifItemHtml || (() => '');
window.handleNotifFilterChange = handleNotifFilterChange || (() => {});

// View functions - Settings (stub)
window.renderSettings = renderSettings || (() => {});
window.setSettingsTargetType = setSettingsTargetType || (() => {});
window.setSettingsTargetId = setSettingsTargetId || (() => {});
window.submitPasswordReset = submitPasswordReset || (() => {});
window.openSettingsPasswordModal = openSettingsPasswordModal || (() => {});
window.submitPasskeyReset = submitPasskeyReset || (() => {});
window.submitStatusAction = submitStatusAction || (() => {});
window.submitAccountDeletion = submitAccountDeletion || (() => {});
window.setSettingsSearch = setSettingsSearch || (() => {});

// Team view functions (stubs)
window.openAddAssistantModal = openAddAssistantModal || (() => {});
window.togglePasswordField = togglePasswordField || (() => {});
window.handleAddAssistant = handleAddAssistant || (() => {});
window.openAssignModal = openAssignModal || (() => {});
window.switchAssignMode = switchAssignMode || (() => {});
window.renderAssignModeContent = renderAssignModeContent || (() => {});
window.onAssignTypeChange = onAssignTypeChange || (() => {});
window.handleAssignSubmit = handleAssignSubmit || (() => {});
window.openManageModal = openManageModal || (() => {});
window.handleDisableAssistant = handleDisableAssistant || (() => {});
window.enableAssistant = enableAssistant || (() => {});
window.handleDeleteAssistant = handleDeleteAssistant || (() => {});

// Helper functions
window.getAssistantName = getAssistantName || (() => '');
window.statusBadge = statusBadge || (() => '');
window.statusBadgePrint = statusBadgePrint || (() => '');
window.formatTimeAgo = formatTimeAgo || (() => '');
window.getNotifIconSmall = getNotifIconSmall || (() => '');
window.getNotifConfig = getNotifConfig || (() => ({}));
window.getAssistantRemainingTime = getAssistantRemainingTime || (() => null);
window.getDisableInfo = getDisableInfo || (() => null);

console.log('✓ IECMS Admin Dashboard Modules Loaded Successfully');
console.log('  - app-core.js (State, Helpers, Core Functions)');
console.log('  - app-api.js (Data Loading & API Calls)');
console.log('  - app-ui.js (UI Components & Interactions)');
console.log('  - app-views.js (View Renderers & Business Logic)');
console.log('  - app-loader.js (Module Integration)');
