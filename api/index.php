<?php
// Simple router for /api/* requests - maps first path segment to a PHP file in this folder
// Example: /api/users/current -> api/users.php, /api/notifications/mark-read -> api/notifications.php

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Normalize to remove trailing slash and leading /api
$path = preg_replace('#^/api#', '', $uri);
$path = trim($path, "\\/");
$segments = explode('/', $path);
$first = $segments[0] ?? '';

if ($first === '' || $first === 'index.php') {
    // optionally show available endpoints
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['endpoints' => ['me','assistants','general-users','tickets','notifications','users','passkeys']]);
    exit;
}

// only allow safe filenames
if (!preg_match('/^[a-z0-9_\-]+$/i', $first)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Bad request']);
    exit;
}

$target = __DIR__ . '/' . $first . '.php';
if (file_exists($target)) {
    // let the specific script handle the rest (it can inspect $_SERVER['REQUEST_URI'])
    require $target;
    exit;
}

http_response_code(404);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['error' => 'Not found']);
