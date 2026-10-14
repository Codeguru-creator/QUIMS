<?php
require_once __DIR__ . '/helpers.php';

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$action = $_GET['action'] ?? '';
$isGenerateRequest = $_SERVER['REQUEST_METHOD'] === 'POST'
    && (strpos($path, '/generate') !== false || $action === 'generate');
if ($isGenerateRequest) {
    requireRole(['admin', 'supervisor', 'assistant']);
} else {
    requireAdminOrSupervisor();
}

// Minimal Gemini/AI endpoint stub. For production, replace this with
// an integration to the AI service (OpenAI, Google Gemini, etc.).
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (strpos($path, '/generate') !== false || $action === 'generate') {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $prompt = $data['prompt'] ?? ($data['message'] ?? null);

        if (!is_string($prompt) || trim($prompt) === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Missing prompt in request body']);
            exit;
        }

        $apiKey = getenv('GEMINI_API_KEY') ?: ($_ENV['GEMINI_API_KEY'] ?? '');
        if (!$apiKey) {
            http_response_code(503);
            echo json_encode(['error' => 'Gemini is not configured on the server']);
            exit;
        }

        if (!function_exists('curl_init')) {
            http_response_code(500);
            echo json_encode(['error' => 'PHP cURL is not enabled. Enable extension=curl in php.ini and restart Apache.']);
            exit;
        }

        $model = getenv('GEMINI_MODEL') ?: ($_ENV['GEMINI_MODEL'] ?? 'gemini-2.5-flash');
        $model = preg_replace('/^models\//', '', trim($model));
        if (!$model) {
            $model = 'gemini-2.5-flash';
        }
        $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($apiKey);
        $fullPrompt = "Answer the user's request completely and directly. Include all necessary explanation and actionable steps. Do not impose an arbitrary line limit, omit important details, or stop mid-sentence. Use headings or alternatives only when they help answer the request.\n\nUser request:\n" . trim($prompt);
        $payload = json_encode([
            'contents' => [[
                'parts' => [['text' => $fullPrompt]]
            ]],
            'generationConfig' => [
                'temperature' => 0.2,
                'maxOutputTokens' => 4096
            ]
        ]);

        $curl = curl_init($endpoint);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30
        ]);
        $responseBody = curl_exec($curl);
        $curlError = curl_error($curl);
        $httpStatus = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        if ($responseBody === false || $curlError) {
            http_response_code(502);
            echo json_encode(['error' => 'Unable to reach Gemini: ' . ($curlError ?: 'unknown network error')]);
            exit;
        }

        $response = json_decode($responseBody, true);
        if ($httpStatus < 200 || $httpStatus >= 300) {
            http_response_code(502);
            echo json_encode(['error' => ($response['error']['message'] ?? 'Gemini request failed') . ' Model: ' . $model]);
            exit;
        }

        $candidate = $response['candidates'][0] ?? [];
        if (($candidate['finishReason'] ?? '') === 'MAX_TOKENS') {
            http_response_code(502);
            echo json_encode(['error' => 'Gemini reached its response limit before completing the answer. Please shorten the request and try again.']);
            exit;
        }
        $parts = $candidate['content']['parts'] ?? [];
        $text = implode('', array_map(
            static function ($part) {
                return is_string($part['text'] ?? null) ? $part['text'] : '';
            },
            $parts
        ));
        if ($text === '') {
            http_response_code(502);
            echo json_encode(['error' => 'Gemini returned an empty response']);
            exit;
        }
        echo json_encode([
            'id' => uniqid('g_', true),
            'model' => $model,
            'text' => $text,
            'createdAt' => date('c')
        ]);
        exit;
    }
}

http_response_code(404);
echo json_encode(['error' => 'Endpoint not found']);
