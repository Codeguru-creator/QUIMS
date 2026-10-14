<?php
/* API helpers: DB connection, session hardening, auth helpers */

// set secure session cookie params before starting session
if (session_status() === PHP_SESSION_NONE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $cookieParams = [
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax'
    ];
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params($cookieParams);
    } else {
        session_set_cookie_params(0, '/', '', $secure, true);
    }
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$host = '127.0.0.1';
$dbname   = 'iecms';
$user = 'root';
$pass = '';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$dbname;charset=$charset";

$pdoOptions = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $db = new PDO($dsn, $user, $pass, $pdoOptions);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

function requireAuth() {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

function requireAdmin() {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    if (empty($_SESSION['role']) || strtolower($_SESSION['role']) !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
}

function currentRole() {
    return strtolower(trim((string)($_SESSION['role'] ?? '')));
}

function isValidNationalId($nationalId) {
    $nationalId = strtoupper(trim((string)$nationalId));
    return preg_match('/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{8,14}$/', $nationalId) === 1;
}

function ensureGeneralUserNationalIdSchema(PDO $db) {
    $columnStmt = $db->prepare(
        'SELECT COUNT(*)
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND column_name = ?'
    );
    $columnStmt->execute(['general_users', 'national_id']);
    if ((int)$columnStmt->fetchColumn() === 0) {
        $db->exec('ALTER TABLE general_users ADD COLUMN national_id varchar(50) DEFAULT NULL AFTER full_name');
    }

    $indexStmt = $db->prepare(
        'SELECT COUNT(*)
         FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND index_name = ?'
    );
    $indexStmt->execute(['general_users', 'uq_general_users_national_id']);
    if ((int)$indexStmt->fetchColumn() === 0) {
        $db->exec('ALTER TABLE general_users ADD UNIQUE INDEX uq_general_users_national_id (national_id)');
    }
}

function requireAdminOrSupervisor() {
    requireAuth();
    if (!in_array(currentRole(), ['admin', 'supervisor'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
}

function requireRole($roles) {
    requireAuth();
    $allowedRoles = array_map('strtolower', (array)$roles);
    if (!in_array(currentRole(), $allowedRoles, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
}

function getAssistantForUser($userId) {
    global $db;
    $stmt = $db->prepare('SELECT a.id, a.role FROM assistants a INNER JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email)) WHERE u.id = ? LIMIT 1');
    $stmt->execute([$userId]);
    return $stmt->fetch() ?: null;
}

function validateAssignmentTarget($assigneeId) {
    global $db;
    if ($assigneeId === null || $assigneeId === '') {
        return;
    }

    $stmt = $db->prepare('SELECT LOWER(a.role) AS role FROM assistants a WHERE a.id = ? LIMIT 1');
    $stmt->execute([$assigneeId]);
    $targetRole = $stmt->fetchColumn();
    if (!$targetRole) {
        http_response_code(400);
        sendJson(['error' => 'Invalid assignment target']);
    }

    $actorRole = currentRole();
    if ($targetRole === 'admin' || ($actorRole === 'supervisor' && $targetRole !== 'assistant')) {
        http_response_code(403);
        sendJson(['error' => 'Assignment does not follow the staff hierarchy']);
    }
}

function notifyTicketAssignee($assigneeId, $ticketId) {
    global $db;
    if ($assigneeId === null || $assigneeId === '') {
        return;
    }
    $userStmt = $db->prepare('SELECT u.id, u.email, COALESCE(NULLIF(u.full_name, ""), a.name, u.email) AS name FROM assistants a INNER JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email)) WHERE a.id = ? LIMIT 1');
    $userStmt->execute([$assigneeId]);
    $recipient = $userStmt->fetch();
    if (!$recipient) {
        return;
    }
    $notificationId = 'ticket_' . $ticketId . '_assigned_' . bin2hex(random_bytes(3));
    $stmt = $db->prepare('INSERT INTO notifications (id, title, message, user_id, type) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$notificationId, 'New ticket assignment', 'Ticket ' . $ticketId . ' has been assigned to you.', $recipient['id'], 'info']);
    sendAssignmentEmail($recipient['email'], $recipient['name'], $ticketId);
}

function sendAssignmentEmail($email, $name, $ticketId) {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        error_log('IECMS assignment email skipped: assignee has no valid email address.');
        return;
    }
    $smtpUser = getenv('IECMS_SMTP_USER') ?: '';
    $smtpPassword = getenv('IECMS_SMTP_PASSWORD') ?: '';
    if ($smtpUser === '' || $smtpPassword === '') {
        error_log('IECMS assignment email skipped: SMTP credentials are not configured.');
        return;
    }
    if (!is_file(__DIR__ . '/../phpmailer/src/PHPMailer.php')) {
        error_log('IECMS assignment email skipped: PHPMailer is not installed.');
        return;
    }

    require_once __DIR__ . '/../phpmailer/src/Exception.php';
    require_once __DIR__ . '/../phpmailer/src/PHPMailer.php';
    require_once __DIR__ . '/../phpmailer/src/SMTP.php';

    try {
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = getenv('IECMS_SMTP_HOST') ?: 'smtp.gmail.com';
        $mail->SMTPAuth = true;
        $mail->Username = $smtpUser;
        $mail->Password = $smtpPassword;
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = (int)(getenv('IECMS_SMTP_PORT') ?: 587);
        $mail->setFrom($smtpUser, 'IECMS Assignments');
        $mail->addAddress($email, $name);
        $mail->isHTML(true);
        $mail->Subject = 'IECMS task assigned: ' . $ticketId;
        $mail->Body = '<p>Hello ' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . ',</p>'
            . '<p>Task <strong>' . htmlspecialchars($ticketId, ENT_QUOTES, 'UTF-8') . '</strong> has been assigned to you.</p>'
            . '<p>Sign in to IECMS to review and update it.</p>';
        $mail->AltBody = 'Task ' . $ticketId . ' has been assigned to you. Sign in to IECMS to review it.';
        $mail->send();
    } catch (\Throwable $exception) {
        error_log('IECMS assignment email failed: ' . $exception->getMessage());
    }
}

function currentUserDisplayName() {
    global $db;
    if (empty($_SESSION['user_id'])) {
        return 'Unknown user';
    }
    $table = ($_SESSION['user_type'] ?? 'staff') === 'general' ? 'general_users' : 'users';
    $stmt = $db->prepare("SELECT COALESCE(NULLIF(full_name, ''), email) FROM {$table} WHERE id = ? LIMIT 1");
    $stmt->execute([$_SESSION['user_id']]);
    return (string)($stmt->fetchColumn() ?: 'Unknown user');
}

function getCurrentUser() {
    global $db;
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    if (($_SESSION['user_type'] ?? 'staff') === 'general') {
        $userStmt = $db->prepare(
            "SELECT id, full_name, email, 'general_user' AS role, phone, whatsapp,
                    status, last_login, last_logout, created_at, updated_at,
                    NULL AS assistant_id, NULL AS assistant_name,
                    0 AS completed, 0 AS pending,
                    NULL AS disabledAt, NULL AS disableDuration, NULL AS disableReason
             FROM general_users
             WHERE id = ?
             LIMIT 1"
        );
        $userStmt->execute([$_SESSION['user_id']]);
        $user = $userStmt->fetch();
        if (!$user) {
            return null;
        }
        $user['name'] = $user['full_name'] ?: $user['email'];
        return $user;
    }

    $userStmt = $db->prepare(
        "SELECT
            u.id,
            u.full_name,
            u.email,
            u.role,
            u.last_activity,
            a.id AS assistant_id,
            COALESCE(NULLIF(u.phone, ''), a.phone, '') AS phone,
            COALESCE(NULLIF(u.whatsapp, ''), a.whatsapp, '') AS whatsapp,
            COALESCE(a.name, u.full_name) AS assistant_name,
            CASE
                WHEN COALESCE(a.status, 'offline') = 'disabled' THEN 'disabled'
                WHEN u.is_permanent_block = 1
                    OR (u.blocked_until IS NOT NULL AND u.blocked_until > NOW()) THEN 'offline'
                ELSE 'online'
            END AS status,
            COALESCE((SELECT COUNT(*) FROM tickets t WHERE t.assignee = a.id AND LOWER(t.status) = 'resolved'), 0) AS completed,
            COALESCE((SELECT COUNT(*) FROM tickets t WHERE t.assignee = a.id AND LOWER(t.status) <> 'resolved'), 0) AS pending,
            a.disabledAt,
            a.disableDuration,
            a.disableReason
         FROM users u
         LEFT JOIN assistants a ON LOWER(TRIM(a.email)) = LOWER(TRIM(u.email))
         WHERE u.id = ?
         LIMIT 1"
    );
    $userStmt->execute([$_SESSION['user_id']]);
    $user = $userStmt->fetch();
    if (!$user) {
        return null;
    }

    // A successful authenticated request is a presence heartbeat. Keep the
    // linked staff profile online without changing the user's last-login time.
    if (!empty($user['assistant_id']) && $user['status'] === 'online') {
        $activityStmt = $db->prepare('UPDATE users SET last_activity = NOW() WHERE id = ?');
        $activityStmt->execute([(int)$user['id']]);
        $presenceStmt = $db->prepare(
            "UPDATE assistants
             SET status = 'online'
             WHERE id = ? AND status <> 'disabled'"
        );
        $presenceStmt->execute([(int)$user['assistant_id']]);
        $user['last_activity'] = date('Y-m-d H:i:s');
    }

    $user['name'] = $user['full_name'] ?: ($user['assistant_name'] ?: $user['email']);
    return $user;
}

function sendJson($payload) {
    echo json_encode($payload);
    exit;
}
