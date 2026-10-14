<?php
require_once __DIR__ . '/api/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    sendJson(['error' => 'Method not allowed']);
}

$data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$name = trim((string)($data['fullName'] ?? $data['full_name'] ?? ''));
$email = strtolower(trim((string)($data['email'] ?? '')));
$password = (string)($data['password'] ?? '');
$phone = trim((string)($data['phone'] ?? ''));
$whatsapp = trim((string)($data['whatsapp'] ?? ''));
$nationalId = strtoupper(trim((string)($data['nationalId'] ?? $data['national_id'] ?? '')));
$requestedRole = strtolower(trim((string)($data['role'] ?? 'user')));

if ($requestedRole !== 'user') {
    http_response_code(403);
    sendJson(['error' => 'Staff accounts must be created by an administrator']);
}

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6 || !isValidNationalId($nationalId)) {
    http_response_code(400);
    sendJson(['error' => 'Enter a valid National ID with 8 to 14 letters and numbers, including at least one letter and one number.']);
}

try {
    ensureGeneralUserNationalIdSchema($db);
    $existing = $db->prepare('SELECT id FROM general_users WHERE LOWER(email) = LOWER(?) UNION SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1');
    $existing->execute([$email, $email]);
    if ($existing->fetch()) {
        http_response_code(409);
        sendJson(['error' => 'An account with this email already exists']);
    }
    $nationalIdCheck = $db->prepare('SELECT id FROM general_users WHERE UPPER(TRIM(national_id)) = ? LIMIT 1');
    $nationalIdCheck->execute([$nationalId]);
    if ($nationalIdCheck->fetch()) {
        http_response_code(409);
        sendJson(['error' => 'An account with this National ID already exists']);
    }

    $stmt = $db->prepare(
        'INSERT INTO general_users (full_name, national_id, email, password_hash, phone, whatsapp) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$name, $nationalId, $email, password_hash($password, PASSWORD_DEFAULT), $phone ?: null, $whatsapp ?: null]);

    sendJson(['success' => true, 'message' => 'Account created successfully']);
} catch (PDOException $exception) {
    http_response_code(500);
    sendJson(['error' => 'Unable to create account']);
}
