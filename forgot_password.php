<?php
use PHPMailer\PHPMailer\PHPMailer;

header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/db.php';

require __DIR__ . '/phpmailer/src/PHPMailer.php';
require __DIR__ . '/phpmailer/src/SMTP.php';
require __DIR__ . '/phpmailer/src/Exception.php';

function sendPasswordResetResponse($status, array $payload) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendPasswordResetResponse(405, ['message' => 'Method not allowed']);
}

$email = strtolower(trim((string)($_POST['email'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendPasswordResetResponse(400, ['message' => 'Enter a valid email address.']);
}

$genericResponse = ['message' => 'If the email exists, a reset link has been sent.'];

try {
    $stmt = $pdo->prepare('SELECT id, full_name, email FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        sendPasswordResetResponse(200, $genericResponse);
    }

    $smtpUsername = getenv('IECMS_SMTP_USER') ?: ($_ENV['IECMS_SMTP_USER'] ?? getenv('SMTP_USER') ?: ($_ENV['SMTP_USER'] ?? ''));
    $smtpPassword = getenv('IECMS_SMTP_PASSWORD') ?: ($_ENV['IECMS_SMTP_PASSWORD'] ?? getenv('SMTP_PASSWORD') ?: ($_ENV['SMTP_PASSWORD'] ?? ''));
    if ($smtpUsername === '' || $smtpPassword === '') {
        error_log('Password reset email is not configured: IECMS_SMTP_USER and IECMS_SMTP_PASSWORD are required.');
        sendPasswordResetResponse(503, ['message' => 'Password reset email is temporarily unavailable. Please contact an administrator.']);
    }

    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $expiresAt = (new DateTimeImmutable('+5 minutes'))->format('Y-m-d H:i:s');

    $update = $pdo->prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?');
    $update->execute([$tokenHash, $expiresAt, $user['id']]);

    $configuredBaseUrl = trim((string)(getenv('IECMS_BASE_URL') ?: ($_ENV['IECMS_BASE_URL'] ?? '')));
    if ($configuredBaseUrl !== '') {
        $baseUrl = rtrim($configuredBaseUrl, '/');
        if (!filter_var($baseUrl, FILTER_VALIDATE_URL) || !in_array(strtolower((string)parse_url($baseUrl, PHP_URL_SCHEME)), ['http', 'https'], true)) {
            throw new RuntimeException('IECMS_BASE_URL must be a valid http or https URL.');
        }
    } else {
        $host = (string)($_SERVER['HTTP_HOST'] ?? '');
        if ($host === '' || !preg_match('/^[A-Za-z0-9.-]+(?::\d{1,5})?$/D', $host)) {
            throw new RuntimeException('Set IECMS_BASE_URL to the browser-accessible application URL.');
        }
        $isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        $scheme = $isHttps ? 'https' : 'http';
        $directory = str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/')));
        $basePath = $directory === '/' || $directory === '.' ? '' : rtrim($directory, '/');
        $baseUrl = $scheme . '://' . $host . $basePath;
    }
    $resetLink = $baseUrl . '/reset_password.html?token=' . rawurlencode($token);

    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = getenv('IECMS_SMTP_HOST') ?: ($_ENV['IECMS_SMTP_HOST'] ?? getenv('SMTP_HOST') ?: ($_ENV['SMTP_HOST'] ?? 'smtp.gmail.com'));
    $mail->SMTPAuth = true;
    $mail->Timeout = 15;
    $mail->Username = $smtpUsername;
    $mail->Password = $smtpPassword;
    $mail->SMTPSecure = getenv('IECMS_SMTP_ENCRYPTION') ?: ($_ENV['IECMS_SMTP_ENCRYPTION'] ?? getenv('SMTP_ENCRYPTION') ?: ($_ENV['SMTP_ENCRYPTION'] ?? PHPMailer::ENCRYPTION_STARTTLS));
    $mail->Port = (int)(getenv('IECMS_SMTP_PORT') ?: ($_ENV['IECMS_SMTP_PORT'] ?? getenv('SMTP_PORT') ?: ($_ENV['SMTP_PORT'] ?? 587)));
    $mail->setFrom(
        getenv('IECMS_MAIL_FROM_EMAIL') ?: ($_ENV['IECMS_MAIL_FROM_EMAIL'] ?? getenv('MAIL_FROM_EMAIL') ?: ($_ENV['MAIL_FROM_EMAIL'] ?? $smtpUsername)),
        getenv('IECMS_MAIL_FROM_NAME') ?: ($_ENV['IECMS_MAIL_FROM_NAME'] ?? getenv('MAIL_FROM_NAME') ?: ($_ENV['MAIL_FROM_NAME'] ?? 'IECMS'))
    );
    $mail->addAddress($user['email'], (string)$user['full_name']);
    $mail->isHTML(true);
    $mail->Subject = 'IECMS password reset';
    $safeName = htmlspecialchars((string)$user['full_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $safeLink = htmlspecialchars($resetLink, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $mail->Body = '<div style="font-family:Arial,sans-serif">'
        . '<h2>Password Reset Request</h2><p>Hello ' . $safeName . ',</p>'
        . '<p>We received a request to reset your password. Use the link below within 5 minutes:</p>'
        . '<p><a href="' . $safeLink . '" style="background:#0f766e;color:#fff;padding:12px 18px;text-decoration:none;border-radius:8px;display:inline-block">Reset Password</a></p>'
        . '<p>If you did not request this, you can ignore this email.</p></div>';
    $mail->AltBody = 'Use this link within 5 minutes to reset your IECMS password: ' . $resetLink;
    $mail->send();

    sendPasswordResetResponse(200, $genericResponse);
} catch (Throwable $exception) {
    if (isset($user['id'], $tokenHash)) {
        try {
            $clear = $pdo->prepare('UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = ? AND reset_token = ?');
            $clear->execute([$user['id'], $tokenHash]);
        } catch (Throwable $cleanupException) {
            error_log('Failed to clear an unsent password reset token: ' . $cleanupException->getMessage());
        }
    }
    error_log('Password reset request failed: ' . $exception->getMessage());
    sendPasswordResetResponse(500, ['message' => 'Unable to send a password reset email right now. Please try again later.']);
}
