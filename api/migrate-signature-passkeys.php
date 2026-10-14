<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/helpers.php';

function normalizeMigratedPasskey($value) {
    $value = (string)$value;
    if (preg_match('/^\$(2y|argon2i|argon2id)\$/', $value)) {
        return $value;
    }
    return password_hash($value, PASSWORD_DEFAULT);
}

function hasDatabaseColumn(PDO $db, $table, $column) {
    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
    );
    $stmt->execute([$table, $column]);
    return (int)$stmt->fetchColumn() > 0;
}

try {
    if (!hasDatabaseColumn($db, 'general_users', 'passkey_hash')) {
        $db->exec('ALTER TABLE general_users ADD COLUMN passkey_hash varchar(255) DEFAULT NULL AFTER password_hash');
    }
    $db->exec('ALTER TABLE general_users MODIFY COLUMN email varchar(150) NULL, MODIFY COLUMN password_hash varchar(255) NULL');

    $credentials = [];
    if (hasDatabaseColumn($db, 'users', 'passkey')) {
        $staffRows = $db->query(
            "SELECT full_name, passkey AS passkey_value
             FROM users WHERE full_name IS NOT NULL AND TRIM(full_name) <> ''
               AND passkey IS NOT NULL AND passkey <> ''"
        )->fetchAll();
        $credentials = array_merge($credentials, $staffRows);
    }
    if ($db->query("SHOW TABLES LIKE 'passkeys'")->fetchColumn()) {
        $legacyRows = $db->query(
            "SELECT name AS full_name, password AS passkey_value
             FROM passkeys WHERE name IS NOT NULL AND TRIM(name) <> ''
               AND password IS NOT NULL AND password <> ''"
        )->fetchAll();
        $credentials = array_merge($credentials, $legacyRows);
    }

    $db->beginTransaction();
    $find = $db->prepare(
        'SELECT id, passkey_hash FROM general_users
         WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))
         ORDER BY (passkey_hash IS NOT NULL AND passkey_hash <> \'\') DESC, id ASC LIMIT 1'
    );
    $insert = $db->prepare(
        "INSERT INTO general_users (full_name, email, password_hash, passkey_hash, status)
         VALUES (?, NULL, NULL, ?, 'active')"
    );
    $update = $db->prepare(
        'UPDATE general_users SET passkey_hash = ?, updated_at = NOW() WHERE id = ?'
    );
    $migrated = 0;

    foreach ($credentials as $credential) {
        $name = trim((string)$credential['full_name']);
        $passkey = (string)$credential['passkey_value'];
        if ($name === '' || $passkey === '') {
            continue;
        }
        $find->execute([$name]);
        $signer = $find->fetch();
        if ($signer) {
            if (empty($signer['passkey_hash'])) {
                $update->execute([normalizeMigratedPasskey($passkey), $signer['id']]);
                $migrated++;
            }
            continue;
        }
        $insert->execute([$name, normalizeMigratedPasskey($passkey)]);
        $migrated++;
    }
    $db->commit();

    if (hasDatabaseColumn($db, 'users', 'passkey')) {
        $db->exec('ALTER TABLE users DROP COLUMN passkey');
    }
    if ($db->query("SHOW TABLES LIKE 'passkeys'")->fetchColumn()) {
        $db->exec('DROP TABLE passkeys');
    }
    echo "Centralized signer credentials in general_users. Migrated {$migrated} credential(s); removed legacy credential storage." . PHP_EOL;
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDOUT, 'Signature credential migration failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
