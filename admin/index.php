<?php
require_once __DIR__ . '/../api/helpers.php';
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
header('Pragma: no-cache');
header('Expires: 0');
requireAuth();

$role = currentRole();
header('Content-Type: text/html; charset=utf-8');
if ($role !== 'admin') {
    if ($role === 'supervisor') {
        header('Location: ../supervisor/supervisor-dashboard.php');
    } elseif ($role === 'assistant') {
        header('Location: ../assistant/assistant-dashboard.php');
    } elseif (($_SESSION['user_type'] ?? '') === 'general') {
        header('Location: ../user-dashboard.php');
    } else {
        header('Location: ../index.html');
    }
    exit;
}

header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/index.html');
