<?php
require_once __DIR__ . '/helpers.php';

function normalizeSignerName($name) {
    return strtolower((string)preg_replace('/\s+/', ' ', trim((string)$name)));
}

function ensurePasskeyStorageSchema(PDO $db) {
    $stmt = $db->query(
        "SELECT COLUMN_NAME, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'general_users'
           AND COLUMN_NAME IN ('email', 'password_hash', 'passkey_hash')"
    );
    $columns = [];
    foreach ($stmt->fetchAll() as $column) {
        $columns[$column['COLUMN_NAME']] = $column['IS_NULLABLE'];
    }

    if (!isset($columns['email']) || !isset($columns['password_hash'])) {
        throw new RuntimeException('The general_users table is missing required account columns.');
    }
    if (!isset($columns['passkey_hash'])) {
        $db->exec('ALTER TABLE general_users ADD COLUMN passkey_hash varchar(255) DEFAULT NULL AFTER password_hash');
    }
    ensureGeneralUserNationalIdSchema($db);
    if ($columns['email'] !== 'YES') {
        $db->exec('ALTER TABLE general_users MODIFY COLUMN email varchar(150) NULL');
    }
    if ($columns['password_hash'] !== 'YES') {
        $db->exec('ALTER TABLE general_users MODIFY COLUMN password_hash varchar(255) NULL');
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAuth();
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $data['action'] ?? 'register';
    $name = trim((string)($data['name'] ?? ''));
    $nationalId = strtoupper(trim((string)($data['national_id'] ?? '')));
    $password = (string)($data['password'] ?? '');

    if ($action === 'lookup') {
        if ($name === '') {
            http_response_code(400);
            sendJson(['error' => 'Signature name is required']);
        }
        try {
            $stmt = $db->prepare(
                "SELECT full_name, (passkey_hash IS NOT NULL AND passkey_hash <> '') AS passkey_present
                 FROM general_users
                 WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))
                 ORDER BY passkey_present DESC, id ASC
                 LIMIT 1"
            );
            $stmt->execute([$name]);
            $signer = $stmt->fetch();
        } catch (PDOException $e) {
            error_log('Passkey signer lookup failed: ' . $e->getMessage());
            http_response_code(500);
            sendJson(['error' => 'Signature lookup is unavailable. Ask an administrator to verify the general-users table.']);
        }
        sendJson([
            'exists' => (bool)$signer,
            'passkey_registered' => $signer ? (bool)$signer['passkey_present'] : false,
            'name' => $signer['full_name'] ?? null
        ]);
    }

    if ($action === 'verify') {
        if ($name === '' || $password === '') {
            http_response_code(400);
            sendJson(['error' => 'Name and passkey are required']);
        }
        $stmt = $db->prepare(
            "SELECT full_name, passkey_hash
             FROM general_users
             WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))
               AND passkey_hash IS NOT NULL AND passkey_hash <> ''
             ORDER BY id ASC"
        );
        $stmt->execute([$name]);
        $signers = $stmt->fetchAll();
        $verifiedSigner = null;
        foreach ($signers as $signer) {
            $storedPasskey = (string)$signer['passkey_hash'];
            if (password_verify($password, $storedPasskey)) {
                $verifiedSigner = $signer;
                break;
            }
        }
        if (!$verifiedSigner) {
            http_response_code(401);
            sendJson(['error' => 'Incorrect passkey']);
        }
        sendJson(['success' => true, 'name' => $verifiedSigner['full_name']]);
    }

    $currentUser = getCurrentUser();
    $mode = strtolower(trim((string)($data['mode'] ?? 'current')));
    if (!$currentUser || $password === '' || !isValidNationalId($nationalId) || !in_array($mode, ['current', 'custom'], true)) {
        http_response_code(400);
        sendJson(['error' => 'Enter a valid National ID with 8 to 14 letters and numbers, including at least one letter and one number.']);
    }
    if ($mode === 'current') {
        $name = trim((string)($currentUser['full_name'] ?? ''));
        if ($name === '') {
            $name = trim((string)($currentUser['name'] ?? ''));
        }
    } else {
        $name = trim($name);
    }
    if ($name === '') {
        http_response_code(400);
        sendJson(['error' => 'Enter a signer name']);
    }
    try {
        ensurePasskeyStorageSchema($db);
        $passkeyHash = password_hash($password, PASSWORD_DEFAULT);
        if ($passkeyHash === false) {
            throw new RuntimeException('Passkey encryption failed.');
        }

        $db->beginTransaction();
        $currentAccountSigner = null;
        if ($mode === 'current' && strtolower((string)($currentUser['role'] ?? '')) === 'general_user' && !empty($currentUser['email'])) {
            $account = $db->prepare('SELECT id, full_name, national_id FROM general_users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 2 FOR UPDATE');
            $account->execute([$currentUser['email']]);
            $accountMatches = $account->fetchAll();
            if (count($accountMatches) > 1) {
                $db->rollBack();
                http_response_code(409);
                sendJson(['error' => 'This account email is linked to multiple General User records. Contact an administrator before registering a passkey.']);
            }
            $currentAccountSigner = $accountMatches[0] ?? null;
            if ($currentAccountSigner && !empty($currentAccountSigner['national_id']) && strtoupper(trim((string)$currentAccountSigner['national_id'])) !== $nationalId) {
                $db->rollBack();
                http_response_code(409);
                sendJson(['error' => 'The National ID does not match the signed-in General User account.']);
            }
        }
        $find = $db->prepare('SELECT id, full_name, national_id FROM general_users WHERE UPPER(TRIM(national_id)) = ? LIMIT 2 FOR UPDATE');
        $find->execute([$nationalId]);
        $matchingSigners = $find->fetchAll();
        if (count($matchingSigners) > 1) {
            $db->rollBack();
            http_response_code(409);
            sendJson(['error' => 'More than one General User account has this National ID. Contact an administrator to resolve the duplicate safely.']);
        }
        $existingSigner = $matchingSigners[0] ?? null;
        if ($currentAccountSigner && $existingSigner && (string)$currentAccountSigner['id'] !== (string)$existingSigner['id']) {
            $db->rollBack();
            http_response_code(409);
            sendJson(['error' => 'The National ID belongs to a different General User account than the signed-in account.']);
        }
        if (!$existingSigner && $currentAccountSigner) {
            $existingSigner = $currentAccountSigner;
        }
        $signerId = $existingSigner['id'] ?? false;
        if ($signerId !== false) {
            if (normalizeSignerName($existingSigner['full_name']) !== normalizeSignerName($name)) {
                $db->rollBack();
                http_response_code(409);
                sendJson(['error' => 'This National ID is already linked to a different signer name. Verify the ID or contact an administrator.']);
            }
            $save = $db->prepare('UPDATE general_users SET national_id = ?, passkey_hash = ?, updated_at = NOW() WHERE id = ?');
            $save->execute([$nationalId, $passkeyHash, $signerId]);
        } else {
            $legacy = $db->query(
                "SELECT id, full_name FROM general_users
                 WHERE national_id IS NULL OR TRIM(national_id) = ''
                 FOR UPDATE"
            );
            $legacySigners = array_values(array_filter(
                $legacy->fetchAll(),
                static function ($candidate) use ($name) {
                    return normalizeSignerName($candidate['full_name']) === normalizeSignerName($name);
                }
            ));
            if (count($legacySigners) > 1) {
                $db->rollBack();
                http_response_code(409);
                sendJson(['error' => 'Multiple General User records have this name but no National ID. Contact an administrator to identify the correct account.']);
            }
            if ($legacySigners) {
                $signerId = $legacySigners[0]['id'];
                $save = $db->prepare('UPDATE general_users SET national_id = ?, passkey_hash = ?, updated_at = NOW() WHERE id = ?');
                $save->execute([$nationalId, $passkeyHash, $signerId]);
            } else {
                $save = $db->prepare(
                    'INSERT INTO general_users (full_name, national_id, email, password_hash, passkey_hash, status, created_at, updated_at)
                     VALUES (?, ?, NULL, NULL, ?, \'active\', NOW(), NOW())'
                );
                $save->execute([$name, $nationalId, $passkeyHash]);
            }
        }
        $db->commit();
        sendJson(['success' => true, 'name' => $name]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Passkey registration failed: ' . $e->getMessage());
        http_response_code(500);
        sendJson(['error' => 'The signer could not be saved to General Users. Please check the database migration and try again.']);
    }
}

if (currentRole() === 'assistant') {
    requireAuth();
    try {
        $stmt = $db->query(
            "SELECT full_name, email, updated_at, 'general_user' AS credential_type
             FROM general_users WHERE passkey_hash IS NOT NULL AND passkey_hash <> ''
             ORDER BY full_name ASC"
        );
        sendJson($stmt->fetchAll());
    } catch (PDOException $e) {
        http_response_code(500);
        sendJson(['error' => 'Failed to load verification credentials']);
    }
}

requireAdminOrSupervisor();

try {
    $stmt = $db->query(
         "SELECT full_name, email, updated_at, 'general_user' AS credential_type
         FROM general_users WHERE passkey_hash IS NOT NULL AND passkey_hash <> ''
         ORDER BY full_name ASC"
    );
    $passkeys = $stmt->fetchAll();
    sendJson($passkeys);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to load passkeys']);
}
