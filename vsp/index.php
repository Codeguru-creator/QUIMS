<?php
require_once __DIR__ . '/../api/helpers.php';
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
header('Pragma: no-cache');
header('Expires: 0');

if (empty($_SESSION['user_id'])) {
    header('Location: ../index.html?returnTo=' . rawurlencode('vsp/index.php'));
    exit;
}

$role = currentRole();
if (!in_array($role, ['admin', 'supervisor', 'assistant'], true)) {
    if (($_SESSION['user_type'] ?? '') === 'general') {
        header('Location: ../user-dashboard.php');
    } else {
        header('Location: ../index.html');
    }
    exit;
}

header('Content-Type: text/html; charset=utf-8');
$dashboardFile = $role === 'admin'
    ? 'index.php'
    : ($role === 'supervisor' ? 'supervisor-dashboard.php' : 'assistant-dashboard.php');
$stylesheetFile = $role === 'assistant' ? 'style.css' : 'styles.css';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register Virtual Session or P/COPYING Task</title>
    <base href="../<?= htmlspecialchars($role, ENT_QUOTES, 'UTF-8') ?>/">
    <link rel="stylesheet" href="<?= htmlspecialchars($stylesheetFile, ENT_QUOTES, 'UTF-8') ?>">
    <script src="lucide.js"></script>
</head>
<body>
    <div id="toast-container" style="position:fixed;bottom:16px;right:16px;z-index:1200;display:flex;flex-direction:column;gap:8px;pointer-events:none;"></div>
    <div id="modal-backdrop" class="modal-backdrop hidden" onclick="closeModal()"></div>
    <div id="modal" class="modal hidden">
        <div class="modal-header">
            <h3 id="modal-title">Modal</h3>
            <button class="modal-close-btn" onclick="closeModal()"><i data-lucide="x" style="width:20px;height:20px"></i></button>
        </div>
        <div id="modal-body" class="modal-body"></div>
        <div id="modal-footer" class="modal-footer"></div>
    </div>
    <div id="notif-preview" class="notif-preview hidden"></div>

    <main class="main-area">
        <header class="header">
            <div class="nav-left">
                <div class="header-clock">
                    <span id="header-time" class="header-time">--:--:--</span>
                    <span id="header-date" class="header-date">---</span>
                </div>
            </div>
            <div class="header-right">
                <a class="btn btn-outline" href="<?= htmlspecialchars($dashboardFile, ENT_QUOTES, 'UTF-8') ?>">Back to Dashboard</a>
                <div class="profile-header">
                    <div class="profile-avatar"></div>
                    <div class="profile-info">
                        <span class="profile-name"></span>
                        <span class="profile-role"></span>
                    </div>
                </div>
            </div>
        </header>
        <div id="content" class="page-content">
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="loading-text">Loading registration form...</p>
            </div>
        </div>
    </main>

    <script src="app-core.js?v=20261008-vsp-1"></script>
    <script>
        state.activeTab = 'register';
        window.VSP_STANDALONE = true;
    </script>
    <script src="app-api.js?v=20261008-vsp-1"></script>
    <script src="app-ui.js"></script>
    <script src="app-views-partial.js"></script>
    <script src="app-views.js?v=20261008-vsp-2"></script>
    <script src="app-loader.js"></script>
    <script>
        const renderFullRegisterForm = window.renderRegister;
        const vspTaskTypes = ['P/COPYING', 'Virtual Sessions'];

        window.renderRegister = function (container) {
            renderFullRegisterForm(container);
            const typeSelect = document.getElementById('reg-type');
            if (!typeSelect) return;

            Array.from(typeSelect.options).forEach(option => {
                if (!vspTaskTypes.includes(option.value)) option.remove();
            });
            if (!vspTaskTypes.includes(typeSelect.value)) {
                typeSelect.value = 'Virtual Sessions';
            }
            window.onRegTypeChange();
        };
    </script>
</body>
</html>
