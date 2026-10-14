<?php
require_once __DIR__ . '/helpers.php';
requireAuth();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    requireRole(['admin', 'supervisor']);
    try {
        ensureGeneralUserNationalIdSchema($db);
        $columnStmt = $db->prepare(
            'SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ?'
        );
        $columnStmt->execute(['general_users']);
        $columns = array_flip($columnStmt->fetchAll(PDO::FETCH_COLUMN));
        $selectFields = ['id', 'full_name'];
        foreach ([
            'national_id', 'email', 'phone', 'whatsapp', 'status',
            'failed_attempts', 'blocked_until', 'last_login', 'last_logout',
            'created_at', 'updated_at'
        ] as $column) {
            $selectFields[] = isset($columns[$column]) ? "`$column`" : "NULL AS `$column`";
        }
        $selectFields[] = isset($columns['password_hash'])
            ? "(password_hash IS NOT NULL AND password_hash <> '') AS password_set"
            : '0 AS password_set';
        $selectFields[] = isset($columns['passkey_hash'])
            ? "(passkey_hash IS NOT NULL AND passkey_hash <> '') AS passkey_present"
            : '0 AS passkey_present';
        $selectFields = implode(', ', $selectFields);
        if (strtolower(trim((string)($_GET['action'] ?? ''))) === 'lookup') {
            $nationalId = strtoupper(trim((string)($_GET['national_id'] ?? '')));
            if (!isValidNationalId($nationalId)) {
                http_response_code(400);
                sendJson(['error' => 'Enter a valid National ID with 8 to 14 letters and numbers, including at least one letter and one number.']);
            }
            $stmt = $db->prepare(
                "SELECT $selectFields
                 FROM general_users
                 WHERE UPPER(TRIM(national_id)) = ?
                 LIMIT 2"
            );
            $stmt->execute([$nationalId]);
            $matches = $stmt->fetchAll();
            if (count($matches) > 1) {
                http_response_code(409);
                sendJson(['error' => 'More than one account has this National ID. Contact an administrator to resolve the duplicate safely.']);
            }
            if (!$matches) {
                http_response_code(404);
                sendJson(['error' => 'No General User account was found for that National ID']);
            }
            sendJson(['success' => true, 'user' => $matches[0]]);
        }
        $stmt = $db->query("SELECT $selectFields FROM general_users ORDER BY full_name ASC");
        sendJson($stmt->fetchAll());
    } catch (PDOException $exception) {
        error_log('Failed to load general users: ' . $exception->getMessage());
        http_response_code(500);
        sendJson(['error' => 'Failed to load general users']);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    sendJson(['error' => 'Method not allowed']);
}

requireAdmin();

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$id = $data['id'] ?? null;
$action = strtolower((string)($data['action'] ?? ''));
if (!$id) {
    http_response_code(400);
    sendJson(['error' => 'General user ID is required']);
}

try {
    if ($action === 'reset-password') {
        $nationalId = strtoupper(trim((string)($data['national_id'] ?? '')));
        if (empty($id) || !isValidNationalId($nationalId)) {
            http_response_code(400);
            sendJson(['error' => 'Look up the account using a valid National ID with 8 to 14 letters and numbers before resetting its password.']);
        }
        $newPassword = (string)($data['new_password'] ?? '');
        if (strlen($newPassword) < 8) {
            http_response_code(400);
            sendJson(['error' => 'New password must be at least 8 characters']);
        }
        $stmt = $db->prepare('UPDATE general_users SET password_hash = ?, updated_at = NOW() WHERE id = ? AND UPPER(TRIM(national_id)) = ?');
        $stmt->execute([password_hash($newPassword, PASSWORD_DEFAULT), $id, $nationalId]);
        if ($stmt->rowCount() === 0) {
            $verify = $db->prepare('SELECT id FROM general_users WHERE id = ? AND UPPER(TRIM(national_id)) = ? LIMIT 1');
            $verify->execute([$id, $nationalId]);
            if (!$verify->fetchColumn()) {
                http_response_code(404);
                sendJson(['error' => 'The National ID no longer matches this General User account']);
            }
        }
        sendJson(['success' => true, 'message' => 'Password updated successfully']);
    }

    if ($action === 'reset-passkey') {
        $nameStmt = $db->prepare('SELECT full_name FROM general_users WHERE id = ? LIMIT 1');
        $nameStmt->execute([$id]);
        $fullName = $nameStmt->fetchColumn();
        if ($fullName === false) {
            http_response_code(404);
            sendJson(['error' => 'General user not found']);
        }

        $db->beginTransaction();
        $resetStmt = $db->prepare('UPDATE general_users SET passkey_hash = NULL, updated_at = NOW() WHERE id = ?');
        $resetStmt->execute([$id]);
        $db->commit();
        sendJson(['success' => true, 'message' => 'Signature passkey reset. The account name remains unchanged.']);
    }

    if ($action === 'delete') {
        $stmt = $db->prepare('DELETE FROM general_users WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(['success' => true, 'message' => 'General user deleted successfully']);
    }

    if ($action === 'status') {
        $status = strtolower((string)($data['status'] ?? ''));
        if (!in_array($status, ['active', 'suspended', 'blocked'], true)) {
            http_response_code(400);
            sendJson(['error' => 'Invalid general user status']);
        }
        $stmt = $db->prepare('UPDATE general_users SET status = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([$status, $id]);
        sendJson(['success' => true, 'message' => 'General user status updated']);
    }

    http_response_code(400);
    sendJson(['error' => 'Unsupported general user action']);
} catch (PDOException $exception) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    sendJson(['error' => 'Failed to update general user']);
}
