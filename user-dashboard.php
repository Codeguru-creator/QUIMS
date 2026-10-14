<?php
require_once __DIR__ . '/db.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
header('Pragma: no-cache');
header('Expires: 0');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (($_SESSION['user_type'] ?? '') !== 'general' || empty($_SESSION['user_id'])) {
    header('Location: index.html');
    exit;
}

$stmt = $pdo->prepare('SELECT full_name, email, phone, whatsapp, last_login, created_at, status, passkey_hash FROM general_users WHERE id = ? LIMIT 1');
$stmt->execute([$_SESSION['user_id']]);
$user = $stmt->fetch();
if (!$user) {
    session_destroy();
    header('Location: index.html');
    exit;
}

function e($value) {
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES, 'UTF-8');
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IECMS User Portal</title>
  <style>
    :root { font-family: Inter, system-ui, sans-serif; color: #102a43; background: #f4f7f6; }
    body { margin: 0; min-height: 100vh; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 6vw; background: #064e3b; color: white; }
    main { width: min(880px, 90vw); margin: 42px auto; }
    section { background: white; border: 1px solid #d7e2de; border-radius: 12px; padding: 24px; box-shadow: 0 8px 24px rgba(6, 78, 59, .08); }
    h1, h2 { margin-top: 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .field { padding: 14px; background: #f7faf9; border-radius: 8px; }
    .label { display: block; color: #627d98; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 5px; }
    .value { font-weight: 600; overflow-wrap: anywhere; }
    button { border: 0; border-radius: 7px; padding: 9px 14px; cursor: pointer; font-weight: 700; }
    #logout { background: #d64545; color: white; }
    #passkey-message { width: min(100%, 420px); padding: 10px 12px; border: 2px solid #cbd5e1; border-left-width: 4px; border-radius: 8px; background: #fff; line-height: 1.45; overflow-wrap: anywhere; }
    #passkey-message.success { color: #047857; border-color: #059669; }
    #passkey-message.error { color: #be123c; border-color: #dc2626; }
    @media (max-width: 620px) { header { align-items: flex-start; flex-direction: column; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div><strong>IECMS</strong><div>User Portal</div></div>
    <button id="logout" type="button">Sign out</button>
  </header>
  <main>
    <section>
      <h1>Welcome, <?= e($user['full_name']) ?></h1>
      <p>Your account is ready for printing and virtual court services.</p>
      <div class="grid">
        <div class="field"><span class="label">Email</span><span class="value"><?= e($user['email']) ?></span></div>
        <div class="field"><span class="label">Account status</span><span class="value"><?= e(ucfirst($user['status'])) ?></span></div>
        <div class="field"><span class="label">Last login</span><span class="value"><?= e($user['last_login'] ?: 'Not available') ?></span></div>
        <div class="field"><span class="label">Registered</span><span class="value"><?= e($user['created_at']) ?></span></div>
        <div class="field"><span class="label">Passkey</span><span class="value"><?= $user['passkey_hash'] ? 'Registered' : 'Not registered' ?></span></div>
        <div class="field"><span class="label">Phone</span><span class="value"><?= e($user['phone'] ?: 'Not provided') ?></span></div>
      </div>
    </section>
    <section style="margin-top:20px">
      <h2>Passkey</h2>
      <p id="passkey-message" class="<?= $user['passkey_hash'] ? 'success' : '' ?>" role="status" aria-live="polite">Your passkey is <?= $user['passkey_hash'] ? 'registered.' : 'not registered.' ?></p>
      <form id="passkey-form" style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="passkey" type="password" minlength="6" required placeholder="Create a passkey" style="flex:1;min-width:220px;padding:10px;border:1px solid #c9d8d2;border-radius:7px">
        <button type="submit" style="background:#0f766e;color:white">Save Passkey</button>
      </form>
    </section>
  </main>
  <script>
    window.addEventListener('pageshow', async (event) => {
      if (!event.persisted) return;
      try {
        const response = await fetch('api/users.php?action=current', { credentials: 'include', cache: 'no-store' });
        const user = response.ok ? await response.json() : null;
        if (!user || String(user.role).toLowerCase() !== 'general_user') {
          window.location.replace('index.html');
        }
      } catch (error) {
        window.location.replace('index.html');
      }
    });

    document.getElementById('logout').addEventListener('click', async () => {
      try {
        await fetch('api/logout.php', { method: 'POST', credentials: 'include', cache: 'no-store' });
      } finally {
        window.location.replace('index.html');
      }
    });
    document.getElementById('passkey-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const response = await fetch('api/passkeys.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({name: <?= json_encode($user['full_name']) ?>, password: document.getElementById('passkey').value})
      });
      const result = await response.json();
      const message = document.getElementById('passkey-message');
      message.className = result.success ? 'success' : 'error';
      message.textContent = result.success ? 'Passkey registered.' : (result.error || 'Unable to save passkey.');
      if (result.success) document.getElementById('passkey').value = '';
    });
  </script>
</body>
</html>
