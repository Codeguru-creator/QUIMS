<?php
require_once __DIR__ . '/helpers.php';

if (!empty($_SESSION['user_id']) && ($_SESSION['user_type'] ?? 'staff') === 'staff') {
    try {
        $roleStmt = $db->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
        $roleStmt->execute([$_SESSION['user_id']]);
        $accountRole = $roleStmt->fetchColumn();
        $_SESSION['role'] = $accountRole === false ? '' : strtolower(trim((string)$accountRole));
    } catch (PDOException $e) {
        http_response_code(500);
        sendJson(['error' => 'Unable to verify account permissions']);
        exit;
    }
}

$assistantPresenceRequest = $_SERVER['REQUEST_METHOD'] === 'GET' && currentRole() === 'assistant';
if (!$assistantPresenceRequest) {
    requireAdminOrSupervisor();
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        if ($assistantPresenceRequest) {
            $owner = getAssistantForUser($_SESSION['user_id']);
            if (!$owner) {
                sendJson([]);
            }

            $columnStmt = $db->prepare(
                "SELECT column_name FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'users'
                   AND column_name IN ('last_activity', 'last_logout', 'last_login')"
            );
            $columnStmt->execute();
            $columns = $columnStmt->fetchAll(PDO::FETCH_COLUMN);
            $lastLoginExpression = in_array('last_login', $columns, true) ? 'u.`last_login`' : 'NULL';
            $lastLogoutExpression = in_array('last_logout', $columns, true) ? 'u.`last_logout`' : 'NULL';
            $lastActivityExpression = in_array('last_activity', $columns, true) ? 'u.`last_activity`' : $lastLoginExpression;
            $presenceStmt = $db->prepare(
                "SELECT a.id, a.name,
                    LOWER(COALESCE(u.role, a.role)) AS role,
                    CASE WHEN a.status = 'disabled' THEN 'disabled'
                         WHEN {$lastActivityExpression} IS NOT NULL
                          AND {$lastActivityExpression} > COALESCE({$lastLogoutExpression}, '1970-01-01')
                          AND {$lastActivityExpression} >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
                         THEN 'online' ELSE 'offline' END AS status,
                    CASE WHEN LOWER(COALESCE(u.role, a.role)) IN ('admin', 'supervisor') THEN a.phone ELSE NULL END AS phone,
                    CASE WHEN LOWER(COALESCE(u.role, a.role)) IN ('admin', 'supervisor') THEN a.whatsapp ELSE NULL END AS whatsapp
                 FROM assistants a
                 LEFT JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email))
                 WHERE a.id <> ?
                 ORDER BY FIELD(LOWER(COALESCE(u.role, a.role)), 'admin', 'supervisor', 'assistant'), a.name ASC"
            );
            $presenceStmt->execute([(int)$owner['id']]);
            $presence = $presenceStmt->fetchAll();
            foreach ($presence as &$person) {
                $person['id'] = (int)$person['id'];
                $person['role'] = strtolower((string)$person['role']);
            }
            unset($person);
            sendJson($presence);
        }

        $columnStmt = $db->prepare(
            "SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = 'users'
               AND column_name IN ('last_activity', 'last_logout', 'last_login')
                                                 ORDER BY FIELD(column_name, 'last_activity', 'last_logout', 'last_login')"
        );
        $columnStmt->execute();
        $columns = $columnStmt->fetchAll(PDO::FETCH_COLUMN);
        $lastLoginExpression = in_array('last_login', $columns, true) ? 'u.`last_login`' : 'NULL';
        $lastLogoutExpression = in_array('last_logout', $columns, true) ? 'u.`last_logout`' : 'NULL';
        $lastActivityExpression = in_array('last_activity', $columns, true) ? 'u.`last_activity`' : $lastLoginExpression;

        $stmt = $db->query(
            "SELECT a.id, a.name, a.email,
                LOWER(COALESCE((SELECT u2.role FROM users u2 WHERE LOWER(TRIM(u2.email)) = LOWER(TRIM(a.email)) LIMIT 1), a.role)) AS role,
                CASE WHEN a.status = 'disabled' THEN 'disabled'
                WHEN {$lastActivityExpression} IS NOT NULL
                    AND {$lastActivityExpression} > COALESCE({$lastLogoutExpression}, '1970-01-01')
                    AND {$lastActivityExpression} >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
                    THEN 'online' ELSE 'offline' END AS status,
                {$lastLoginExpression} AS last_login,
                {$lastLogoutExpression} AS last_logout,
                GREATEST(COALESCE({$lastLogoutExpression}, '1970-01-01'), COALESCE({$lastActivityExpression}, '1970-01-01')) AS last_seen,
                COALESCE(SUM(CASE WHEN t.status = 'Resolved' THEN 1 ELSE 0 END), 0) AS completed,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL AND LOWER(t.status) <> 'resolved' THEN 1 ELSE 0 END), 0) AS pending,
                a.phone, a.whatsapp, a.disabledAt, a.disableDuration, a.disableReason
             FROM assistants a
             LEFT JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email))
             LEFT JOIN tickets t ON t.assignee = a.id
             GROUP BY a.id, a.name, a.email, u.role, a.role, {$lastLoginExpression}, {$lastLogoutExpression}, {$lastActivityExpression}, a.phone, a.whatsapp, a.disabledAt, a.disableDuration, a.disableReason
             ORDER BY FIELD(LOWER(COALESCE(u.role, a.role)), 'admin', 'supervisor', 'assistant'), a.name ASC"
        );
        $assistants = $stmt->fetchAll();
        $assistants = array_map(function ($assistant) {
            $assistant['role'] = strtolower((string)($assistant['role'] ?? 'assistant'));
            $assistant['id'] = (int)$assistant['id'];
            $assistant['completed'] = (int)$assistant['completed'];
            $assistant['pending'] = (int)$assistant['pending'];
            return $assistant;
        }, $assistants);
        sendJson($assistants);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to load assistants']);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = $data['id'] ?? null;
    $updates = $data['updates'] ?? [];
    if (currentRole() === 'supervisor') {
        unset($updates['role']);
    }
    $allowed = ['status', 'disabledAt', 'disableDuration', 'disableReason', 'phone', 'whatsapp', 'role', 'completed', 'pending'];
    $sets = [];
    $values = [];
    foreach ($allowed as $column) {
        if (array_key_exists($column, $updates)) {
            $sets[] = "`$column` = ?";
            $values[] = $updates[$column];
        }
    }
    if (!$id || !$sets) {
        http_response_code(400);
        sendJson(['error' => 'Assistant ID and updates are required']);
    }
    if (array_key_exists('role', $updates)) {
        $roleInput = strtolower(trim((string)$updates['role']));
        if (!in_array($roleInput, ['admin', 'supervisor', 'assistant'], true)) {
            http_response_code(400);
            sendJson(['error' => 'Invalid staff role']);
        }
        $updates['role'] = $roleInput;
    }
    $emailStmt = $db->prepare('SELECT email FROM assistants WHERE id = ? LIMIT 1');
    $emailStmt->execute([$id]);
    $assistantEmail = $emailStmt->fetchColumn();
    $values[] = $id;
    $stmt = $db->prepare('UPDATE assistants SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->execute($values);
    if ($assistantEmail && array_key_exists('status', $updates)) {
        if (strtolower((string)$updates['status']) === 'disabled') {
            $durationText = strtolower(trim((string)($updates['disableDuration'] ?? '')));
            preg_match('/(\d+)/', $durationText, $durationMatch);
            $durationDays = max(1, (int)($durationMatch[1] ?? 1));
            $userStmt = $db->prepare("UPDATE users SET is_permanent_block = 0, blocked_until = DATE_ADD(NOW(), INTERVAL {$durationDays} DAY), updated_at = NOW() WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))");
            $userStmt->execute([$assistantEmail]);
        } elseif (strtolower((string)$updates['status']) !== 'disabled') {
            $userStmt = $db->prepare('UPDATE users SET is_permanent_block = 0, blocked_until = NULL, updated_at = NOW() WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))');
            $userStmt->execute([$assistantEmail]);
        }
    }
    if ($assistantEmail && array_key_exists('role', $updates)) {
        $userStmt = $db->prepare('UPDATE users SET role = ?, updated_at = NOW() WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND role <> "admin"');
        $userStmt->execute([$updates['role'], $assistantEmail]);
    }
    sendJson(['success' => true]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    requireAdminOrSupervisor();
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    if (empty($data['id'])) {
        http_response_code(400);
        sendJson(['error' => 'Assistant ID is required']);
    }
    $targetStmt = $db->prepare('SELECT LOWER(role) AS role FROM assistants WHERE id = ? LIMIT 1');
    $targetStmt->execute([$data['id']]);
    $targetRole = $targetStmt->fetchColumn();
    if (!$targetRole) {
        http_response_code(404);
        sendJson(['error' => 'Assistant not found']);
    }
    if (currentRole() === 'supervisor' && $targetRole !== 'assistant') {
        http_response_code(403);
        sendJson(['error' => 'Supervisors can only delete assistants']);
    }
    try {
        $emailStmt = $db->prepare('SELECT email FROM assistants WHERE id = ? LIMIT 1');
        $emailStmt->execute([$data['id']]);
        $assistantEmail = $emailStmt->fetchColumn();

        $db->beginTransaction();
        $stmt = $db->prepare('DELETE FROM assistants WHERE id = ?');
        $stmt->execute([$data['id']]);
        if ($assistantEmail) {
            $userStmt = $db->prepare('DELETE FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND role <> "admin"');
            $userStmt->execute([$assistantEmail]);
        }
        $db->commit();
        sendJson(['success' => true]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        http_response_code(500);
        sendJson(['error' => 'Failed to delete assistant']);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAdminOrSupervisor();
    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid request body']);
        exit;
    }

    $name = trim((string)($data['name'] ?? $data['full_name'] ?? ''));
    $email = strtolower(trim((string)($data['email'] ?? '')));
    $phone = trim((string)($data['phone'] ?? ''));
    $whatsapp = trim((string)($data['whatsapp'] ?? ''));
    $roleInput = strtolower(trim((string)($data['role'] ?? 'assistant')));

    if (!in_array($roleInput, ['assistant', 'supervisor', 'admin'], true)) {
        $roleInput = 'assistant';
    }
    if (currentRole() === 'supervisor' && $roleInput === 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Supervisors cannot create admin accounts']);
        exit;
    }

    if ($name === '' || $email === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Name and email are required']);
        exit;
    }

    if (
        !filter_var($email, FILTER_VALIDATE_EMAIL)
        || !preg_match('/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,63}$/D', $email)
    ) {
        http_response_code(400);
        echo json_encode(['error' => 'Enter a valid email address with a complete domain']);
        exit;
    }

    if (!preg_match('/^[0-9]{10}$/D', $phone)) {
        http_response_code(400);
        echo json_encode(['error' => 'Phone number must contain exactly 10 digits']);
        exit;
    }

    if (!preg_match('/^[0-9]{10}$/D', $whatsapp)) {
        http_response_code(400);
        echo json_encode(['error' => 'WhatsApp number must contain exactly 10 digits']);
        exit;
    }

    try {
        $checkStmt = $db->prepare('SELECT id FROM assistants WHERE email = ? LIMIT 1');
        $checkStmt->execute([$email]);
        if ($checkStmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'An assistant with this email already exists']);
            exit;
        }

        $userCheckStmt = $db->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $userCheckStmt->execute([$email]);
        if ($userCheckStmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'A user account with this email already exists']);
            exit;
        }

        $password = (string)($data['password'] ?? '');
        if (strlen($password) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 6 characters']);
            exit;
        }

        $db->beginTransaction();
        $insertStmt = $db->prepare(
            'INSERT INTO assistants (name, email, role, status, completed, pending, phone, whatsapp, disabledAt, disableDuration, disableReason) VALUES (?, ?, ?, "offline", 0, 0, ?, ?, NULL, NULL, NULL)'
        );
        $insertStmt->execute([$name, $email, $roleInput, $phone, $whatsapp]);

        $assistantId = $db->lastInsertId();

        $userStmt = $db->prepare(
            'INSERT INTO users (full_name, email, password_hash, role, phone, whatsapp) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $userStmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $roleInput, $phone, $whatsapp]);
        $userId = $db->lastInsertId();

        $fetchStmt = $db->prepare(
            "SELECT id, name, email, LOWER(role) AS role, status, completed, pending, phone, whatsapp, disabledAt, disableDuration, disableReason FROM assistants WHERE id = ? LIMIT 1"
        );
        $fetchStmt->execute([$assistantId]);
        $assistant = $fetchStmt->fetch();
        if ($assistant) {
            $assistant['role'] = strtolower((string)($assistant['role'] ?? 'assistant'));
        }
        $userFetchStmt = $db->prepare(
            "SELECT id, full_name, email, role, phone, whatsapp, is_permanent_block, blocked_until, last_login,
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
             FROM users WHERE id = ? LIMIT 1"
        );
        $userFetchStmt->execute([$userId]);
        $user = $userFetchStmt->fetch();

        $db->commit();

        sendJson([
            'success' => true,
            'id' => $assistantId,
            'assistant' => $assistant,
            'user' => $user
        ]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Failed to create assistant and user account: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create assistant']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
