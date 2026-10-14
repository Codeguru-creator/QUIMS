<?php
require_once __DIR__ . '/helpers.php';
requireAuth();
$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (strpos($_SERVER['REQUEST_URI'], '/mark-all-read') !== false || $action === 'mark-all-read') {
        try {
            $stmt = $db->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?');
            $stmt->execute([$_SESSION['user_id']]);
            sendJson(['success' => true]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to mark all notifications read']);
        }
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'PATCH' || $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (strpos($_SERVER['REQUEST_URI'], '/mark-read') !== false || $action === 'mark-read') {
        $data = json_decode(file_get_contents('php://input'), true);
        $notificationId = $data['id'] ?? null;
        if (!$notificationId) {
            http_response_code(400);
            echo json_encode(['error' => 'Notification ID required']);
            exit;
        }
        try {
            $stmt = $db->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?');
            $stmt->execute([$notificationId, $_SESSION['user_id']]);
            sendJson(['success' => true]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to mark notification read']);
        }
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $notificationId = $_GET['id'] ?? null;
    if (!$notificationId) {
        http_response_code(400);
        echo json_encode(['error' => 'Notification ID required']);
        exit;
    }
    $stmt = $db->prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?');
    $stmt->execute([$notificationId, $_SESSION['user_id']]);
    sendJson(['success' => true]);
    exit;
}

try {
    $stmt = $db->prepare('SELECT id, title, message, type, is_read, is_read AS `read`, created_at, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$_SESSION['user_id']]);
    $notifications = $stmt->fetchAll();
    sendJson($notifications);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to load notifications']);
}
