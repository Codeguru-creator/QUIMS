<?php
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
header('Pragma: no-cache');
header('Expires: 0');

require_once __DIR__ . '/../db.php';

if (!empty($_SESSION['user_id'])) {
    try {
        $userTable = ($_SESSION['user_type'] ?? 'staff') === 'general' ? 'general_users' : 'users';
        $stmt = $pdo->prepare("UPDATE {$userTable} SET last_logout = NOW() WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);

        if ($userTable === 'users') {
            $assistantStmt = $pdo->prepare(
                'UPDATE assistants a
                 INNER JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email))
                 SET a.status = "offline"
                 WHERE u.id = ?'
            );
            $assistantStmt->execute([$_SESSION['user_id']]);
        }
    } catch (PDOException $e) {
        error_log('Failed to record logout time: ' . $e->getMessage());
    }
}

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'],
        $params['secure'],
        $params['httponly']
    );
}

session_destroy();

http_response_code(200);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['success' => true]);
