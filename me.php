<?php
require_once __DIR__ . '/api_helpers.php';

$user = getCurrentUser();
if (!$user) {
    http_response_code(401);
    jsonResponse(['error' => 'Unauthorized'], 401);
}

jsonResponse([
    'id' => (int) $user['id'],
    'fullName' => $user['full_name'],
    'email' => $user['email'],
    'role' => $user['role']
]);
