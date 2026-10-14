<?php
require_once __DIR__ . '/helpers.php';

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$action = $_GET['action'] ?? '';

if (strpos($path, '/current') !== false || $action === 'current') {
    requireAuth();
    $user = getCurrentUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    sendJson($user);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    requireAdminOrSupervisor();
    try {
        $stmt = $db->query("SELECT id, full_name, email, role, phone, whatsapp, is_permanent_block, blocked_until, last_login,
            failed_attempts, last_login_alert, last_password_change, created_at, updated_at,
            (password_hash IS NOT NULL AND password_hash <> '') AS password_set,
            EXISTS (
                SELECT 1 FROM general_users g
                WHERE LOWER(TRIM(g.full_name)) = LOWER(TRIM(users.full_name))
                  AND g.passkey_hash IS NOT NULL AND g.passkey_hash <> ''
            ) AS passkey_present,
            CASE WHEN is_permanent_block = 1 THEN 'blocked'
                 WHEN blocked_until IS NOT NULL AND blocked_until > NOW() THEN 'suspended'
                 ELSE 'active' END AS status
            FROM users
            " . (currentRole() === 'supervisor' ? "WHERE LOWER(role) <> 'admin'" : "") . "
            ORDER BY full_name ASC");
        $users = $stmt->fetchAll();
        sendJson($users);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to load users']);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($action === 'reset-own-passkey') {
        requireRole(['assistant']);
        $accountStmt = $db->prepare("SELECT id, full_name FROM users WHERE id = ? AND LOWER(role) = 'assistant' LIMIT 1");
        $accountStmt->execute([$_SESSION['user_id']]);
        $account = $accountStmt->fetch();
        if (!$account) {
            http_response_code(404);
            sendJson(['error' => 'Assistant account not found']);
        }

        $db->beginTransaction();
        $resetStmt = $db->prepare('UPDATE general_users SET passkey_hash = NULL, updated_at = NOW() WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))');
        $resetStmt->execute([$account['full_name']]);
        $db->commit();
        sendJson(['success' => true, 'message' => 'Your signature passkey was reset. Register a new FTU passkey to sign again.']);
    }

    if ($action === 'change-own-password') {
        requireRole(['assistant']);
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $currentPassword = (string)($data['current_password'] ?? '');
        $newPassword = (string)($data['new_password'] ?? '');
        if ($currentPassword === '' || strlen($newPassword) < 8) {
            http_response_code(400);
            sendJson(['error' => 'Enter your current password and a new password with at least 8 characters']);
        }

        $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ? AND LOWER(role) = \'assistant\' LIMIT 1');
        $stmt->execute([$_SESSION['user_id']]);
        $currentHash = $stmt->fetchColumn();
        if (!$currentHash || !password_verify($currentPassword, (string)$currentHash)) {
            http_response_code(403);
            sendJson(['error' => 'Current password is incorrect']);
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $update = $db->prepare('UPDATE users SET password_hash = ?, last_password_change = NOW(), updated_at = NOW() WHERE id = ?');
        $update->execute([$newHash, $_SESSION['user_id']]);
        sendJson(['success' => true, 'message' => 'Password changed successfully']);
    }

    if (strpos($path, '/reset-password') !== false || $action === 'reset-password') {
        requireAdminOrSupervisor();
        $data = json_decode(file_get_contents('php://input'), true);
        $userId = $data['id'] ?? null;
        $targetType = strtolower((string)($data['target_type'] ?? 'user'));
        $newPassword = (string)($data['new_password'] ?? '');
        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'User ID required']);
            exit;
        }
        if (strlen($newPassword) < 8) {
            http_response_code(400);
            echo json_encode(['error' => 'New password must be at least 8 characters']);
            exit;
        }
        try {
            if ($targetType === 'assistant') {
                $targetStmt = $db->prepare('SELECT u.id, u.role, u.full_name FROM assistants a INNER JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email)) WHERE a.id = ? LIMIT 1');
            } else {
                $targetStmt = $db->prepare('SELECT id, role, full_name FROM users WHERE id = ? LIMIT 1');
            }
            $targetStmt->execute([$userId]);
            $target = $targetStmt->fetch();
            if (!$target) {
                http_response_code(404);
                echo json_encode(['error' => 'Account not found']);
                exit;
            }
            if (currentRole() === 'supervisor' && strtolower((string)$target['role']) === 'admin') {
                http_response_code(403);
                echo json_encode(['error' => 'Supervisors cannot reset admin passwords']);
                exit;
            }
            $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
            $stmt = $db->prepare('UPDATE users SET password_hash = ?, last_password_change = NOW(), updated_at = NOW() WHERE id = ?');
            $stmt->execute([$newHash, $target['id']]);
            sendJson(['success' => true, 'message' => 'Password updated successfully']);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to reset password']);
        }
        exit;
    }

    if (strpos($path, '/reset-passkey') !== false || $action === 'reset-passkey') {
        requireAdminOrSupervisor();
        $data = json_decode(file_get_contents('php://input'), true);
        $userId = $data['id'] ?? null;
        $targetType = strtolower((string)($data['target_type'] ?? 'user'));
        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'User ID required']);
            exit;
        }
        try {
            if ($targetType === 'assistant') {
                $targetStmt = $db->prepare('SELECT u.id, u.role, u.full_name FROM assistants a INNER JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email)) WHERE a.id = ? LIMIT 1');
            } else {
                $targetStmt = $db->prepare('SELECT id, role, full_name FROM users WHERE id = ? LIMIT 1');
            }
            $targetStmt->execute([$userId]);
            $target = $targetStmt->fetch();
            if (!$target) {
                http_response_code(404);
                echo json_encode(['error' => 'Account not found']);
                exit;
            }
            if (currentRole() === 'supervisor' && strtolower((string)$target['role']) === 'admin') {
                http_response_code(403);
                echo json_encode(['error' => 'Supervisors cannot reset admin passkeys']);
                exit;
            }
            $db->beginTransaction();
            $stmt = $db->prepare('UPDATE general_users SET passkey_hash = NULL, updated_at = NOW() WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))');
            $stmt->execute([$target['full_name']]);
            $db->commit();
            sendJson(['success' => true, 'message' => 'Signature passkey reset. The account name remains unchanged.']);
        } catch (PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode(['error' => 'Failed to reset passkey']);
        }
        exit;
    }

    if (strpos($path, '/status') !== false || $action === 'status') {
        requireAdmin();
        $data = json_decode(file_get_contents('php://input'), true);
        $userId = $data['id'] ?? null;
        $status = $data['status'] ?? ($data['action'] ?? null);
        $targetType = strtolower((string)($data['target_type'] ?? 'user'));
        if (!$userId || !$status) {
            http_response_code(400);
            echo json_encode(['error' => 'User ID and status required']);
            exit;
        }
        try {
            if ($targetType === 'assistant') {
                $lookup = $db->prepare('SELECT email FROM assistants WHERE id = ? LIMIT 1');
                $lookup->execute([$userId]);
                $email = $lookup->fetchColumn();
                if (!$email) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Assistant account not found']);
                    exit;
                }
                $userIdStmt = $db->prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1');
                $userIdStmt->execute([$email]);
                $userId = $userIdStmt->fetchColumn();
                if (!$userId) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Linked user account not found']);
                    exit;
                }
            }
            if ($status === 'block') {
                $stmt = $db->prepare('UPDATE users SET is_permanent_block = 1, blocked_until = NULL, updated_at = NOW() WHERE id = ?');
            } elseif ($status === 'suspend') {
                $stmt = $db->prepare('UPDATE users SET is_permanent_block = 0, blocked_until = DATE_ADD(NOW(), INTERVAL 1 DAY), updated_at = NOW() WHERE id = ?');
            } elseif ($status === 'unblock') {
                $stmt = $db->prepare('UPDATE users SET is_permanent_block = 0, blocked_until = NULL, updated_at = NOW() WHERE id = ?');
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid account status action']);
                exit;
            }
            $stmt->execute([$userId]);
            if ($targetType === 'assistant') {
                $assistantStatus = $status === 'unblock' ? 'offline' : 'disabled';
                $assistantStmt = $db->prepare('UPDATE assistants SET status = ? WHERE id = ?');
                $assistantStmt->execute([$assistantStatus, $data['id']]);
            }
            sendJson(['success' => true]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update status']);
        }
        exit;
    }

    if (strpos($path, '/delete') !== false || $action === 'delete') {
        requireAdmin();
        $data = json_decode(file_get_contents('php://input'), true);
        $userId = $data['id'] ?? null;
        $targetType = strtolower((string)($data['target_type'] ?? 'user'));
        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'User ID required']);
            exit;
        }
        try {
            if ($targetType === 'assistant') {
                $lookup = $db->prepare('SELECT email FROM assistants WHERE id = ? LIMIT 1');
                $lookup->execute([$userId]);
                $email = $lookup->fetchColumn();
                if (!$email) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Assistant account not found']);
                    exit;
                }
                $db->beginTransaction();
                $assistantDelete = $db->prepare('DELETE FROM assistants WHERE id = ?');
                $assistantDelete->execute([$userId]);
                $stmt = $db->prepare('DELETE FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND role <> "admin"');
                $stmt->execute([$email]);
                $db->commit();
                sendJson(['success' => true]);
            }
            $emailStmt = $db->prepare('SELECT email FROM users WHERE id = ? LIMIT 1');
            $emailStmt->execute([$userId]);
            $email = $emailStmt->fetchColumn();
            $db->beginTransaction();
            if ($email) {
                $assistantDelete = $db->prepare('DELETE FROM assistants WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))');
                $assistantDelete->execute([$email]);
            }
            $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
            $stmt->execute([$userId]);
            $db->commit();
            sendJson(['success' => true]);
        } catch (PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete user']);
        }
        exit;
    }
}

http_response_code(404);
echo json_encode(['error' => 'Endpoint not found']);
