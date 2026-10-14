<?php
// Ensure secure session cookie params before starting session
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
} else {
    session_set_cookie_params(0, '/', '', $secure, true);
}
session_start();
header('Content-Type: application/json');


$host = '127.0.0.1';
$db   = 'iecms';
$user = 'root';
$pass = '';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (PDOException $e) {
    echo json_encode(['error' => 'Database connection failed.']);
    exit;
}


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['error' => 'Invalid request method']);
    exit;
}



$email = strtolower(trim($_POST['identifier'] ?? ''));
$password = trim($_POST['password'] ?? '');

if ($email === '' || $password === '') {
    echo json_encode(['error' => 'Please provide both email and password']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['error' => 'Please enter a valid email address']);
    exit;
}

try {



    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        $generalStmt = $pdo->prepare("SELECT * FROM general_users WHERE email = ? LIMIT 1");
        $generalStmt->execute([$email]);
        $generalUser = $generalStmt->fetch();
        if (!$generalUser) {
            echo json_encode(['error' => 'Invalid password or email address ']);
            exit;
        }
        if (($generalUser['status'] ?? 'active') !== 'active') {
            echo json_encode(['error' => 'This account is not active. Please contact an administrator.']);
            exit;
        }
        if (!password_verify($password, $generalUser['password_hash'])) {
            echo json_encode(['error' => 'Wrong password. Try again.']);
            exit;
        }
        $pdo->prepare("UPDATE general_users SET failed_attempts = 0, blocked_until = NULL, last_login = NOW() WHERE id = ?")
            ->execute([$generalUser['id']]);
        session_regenerate_id(true);
        $_SESSION['user_id'] = $generalUser['id'];
        $_SESSION['user_type'] = 'general';
        $_SESSION['user_name'] = $generalUser['full_name'];
        $_SESSION['role'] = 'general_user';
        echo json_encode([
            'greeting' => "Welcome, {$generalUser['full_name']}!",
            'redirect' => 'user-dashboard.php'
        ]);
        exit;
    }



    if ((int)$user['is_permanent_block'] === 1) {
        echo json_encode([
            'permanent' => true,
            'role'      => strtoupper($user['role']),
            'userName'  => $user['full_name']
        ]);
        exit;
    }



    if (!empty($user['blocked_until'])) {
        $blockedUntil = strtotime($user['blocked_until']);
        $now = time();

        if ($blockedUntil > $now) {
            echo json_encode([
                'error' => 'Too many attempts. Try again later.',
                'blockTime' => $blockedUntil - $now,
                'userName' => $user['full_name']
            ]);
            exit;
        } else {

            $pdo->prepare("UPDATE users SET failed_attempts = 0, blocked_until = NULL WHERE id = ?")
                ->execute([$user['id']]);
        }
    }


    if (!password_verify($password, $user['password_hash'])) {

        $attempts = (int)$user['failed_attempts'] + 1;


        if ($attempts >= 3 && $attempts < 6) {
            $pdo->prepare("
                UPDATE users 
                SET failed_attempts = ?, 
                    blocked_until = DATE_ADD(NOW(), INTERVAL 1 MINUTE) 
                WHERE id = ?
            ")->execute([$attempts, $user['id']]);

            echo json_encode([
                'error' => 'Wrong password. Try again in 60 seconds.',
                'blockTime' => 60,
                'userName' => $user['full_name']
            ]);
            exit;
        }


        if ($attempts >= 6) {
            $pdo->prepare("UPDATE users SET is_permanent_block = 1 WHERE id = ?")
                ->execute([$user['id']]);

            echo json_encode([
                'permanent' => true,
                'role' => strtoupper($user['role']),
                'userName' => $user['full_name']
            ]);
            exit;
        }

        $pdo->prepare("UPDATE users SET failed_attempts = ? WHERE id = ?")
            ->execute([$attempts, $user['id']]);

        echo json_encode([
            'error' => 'Wrong password. Try again.',
            'userName' => $user['full_name']
        ]);
        exit;
    }


    $pdo->prepare("
        UPDATE users 
        SET failed_attempts = 0, 
            blocked_until = NULL, 
            last_login = NOW(),
            last_activity = NOW()
        WHERE id = ?
    ")->execute([$user['id']]);

    $pdo->prepare('UPDATE assistants SET status = "online" WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))')
        ->execute([$user['email']]);

    $_SESSION['user_id']   = $user['id'];
    $_SESSION['user_type'] = 'staff';
    $_SESSION['user_name'] = $user['full_name'];
    $_SESSION['role']      = $user['role'];

    // prevent session fixation
    session_regenerate_id(true);



    $hour = (int)date('H');

    if ($hour < 12) {
        $greeting = "Good morning, {$user['full_name']}!";
    } elseif ($hour < 18) {
        $greeting = "Good afternoon, {$user['full_name']}!";
    } else {
        $greeting = "Good evening, {$user['full_name']}!";
    }



    switch (strtolower($user['role'])) {
        case 'admin':
            $redirect = 'admin/index.php';
            break;
        case 'supervisor':
            $redirect = 'supervisor/supervisor-dashboard.php';
            break;
        case 'assistant':
            $redirect = 'assistant/assistant-dashboard.php';
            break;
        default:
            $redirect = 'user-dashboard.php';
            break;
    }
    if (
        ($_POST['returnTo'] ?? '') === 'vsp/index.php'
        && in_array(strtolower((string)$user['role']), ['admin', 'supervisor', 'assistant'], true)
    ) {
        $redirect = 'vsp/index.php';
    }

    echo json_encode([
        'greeting' => $greeting,
        'redirect' => $redirect
    ]);
    exit;
} catch (Exception $e) {
    echo json_encode(['error' => 'Server error occurred.']);
    exit;
}
