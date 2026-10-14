<?php
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/db.php';

function sendResetPasswordResponse($status, array $payload) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResetPasswordResponse(405, ['success' => false, 'message' => 'Method not allowed']);
}

$data = json_decode(file_get_contents('php://input'), true);
$token = (string)($data['token'] ?? '');
$password = (string)($data['password'] ?? '');

if (!preg_match('/^[a-f0-9]{64}$/D', $token) || $password === '') {
    sendResetPasswordResponse(400, ['success' => false, 'message' => 'Invalid or expired reset link']);
}
if (strlen($password) < 8) {
    sendResetPasswordResponse(400, ['success' => false, 'message' => 'Password must be at least 8 characters']);
}

try {
    $tokenHash = hash('sha256', $token);
    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        'SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW() LIMIT 1 FOR UPDATE'
    );
    $stmt->execute([$tokenHash]);
    $userId = $stmt->fetchColumn();
    if (!$userId) {
        $pdo->rollBack();
        sendResetPasswordResponse(400, ['success' => false, 'message' => 'Invalid or expired reset link']);
    }

    $update = $pdo->prepare(
        'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL, last_password_change = NOW(), updated_at = NOW() WHERE id = ?'
    );
    $update->execute([password_hash($password, PASSWORD_DEFAULT), $userId]);
    $pdo->commit();
    sendResetPasswordResponse(200, ['success' => true, 'message' => 'Password updated successfully']);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Password reset completion failed: ' . $exception->getMessage());
    sendResetPasswordResponse(500, ['success' => false, 'message' => 'Unable to reset the password right now. Please try again.']);
}
