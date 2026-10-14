<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/phpmailer/src/Exception.php';
require_once __DIR__ . '/phpmailer/src/PHPMailer.php';
require_once __DIR__ . '/phpmailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;

date_default_timezone_set('Africa/Harare');
header('Content-Type: application/json; charset=utf-8');

if (PHP_SAPI !== 'cli') {
    $reportKey = getenv('IECMS_REPORT_KEY') ?: '';
    if ($reportKey === '' || !hash_equals($reportKey, (string)($_GET['key'] ?? ''))) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
}

function reportOutput($payload, $statusCode = 200) {
    if (PHP_SAPI !== 'cli') {
        http_response_code($statusCode);
    }
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
}

function lastWeekdayOfMonth(DateTimeImmutable $date) {
    $lastDay = $date->modify('last day of this month');
    if ((int)$lastDay->format('N') === 6) {
        return $lastDay->modify('-1 day');
    }
    if ((int)$lastDay->format('N') === 7) {
        return $lastDay->modify('-2 days');
    }
    return $lastDay;
}

function reportPeriodDates($period, DateTimeImmutable $reference) {
    $day = $reference->setTime(0, 0);
    if ($period === 'daily') {
        return [$day, $day];
    }
    if ($period === 'weekly') {
        $monday = $day->modify('monday this week');
        return [$monday, $monday->modify('+4 days')];
    }
    if ($period === 'monthly') {
        return [$day->modify('first day of this month'), $day->modify('last day of this month')];
    }
    if ($period === 'yearly') {
        return [$day->setDate((int)$day->format('Y'), 1, 1), $day->setDate((int)$day->format('Y'), 12, 31)];
    }
    throw new InvalidArgumentException('Period must be daily, weekly, monthly, or yearly.');
}

function reportPeriodLabel($period, DateTimeImmutable $start, DateTimeImmutable $end) {
    if ($period === 'daily') {
        return $start->format('l, F j, Y');
    }
    if ($period === 'weekly') {
        return $start->format('F j') . ' - ' . $end->format('F j, Y');
    }
    if ($period === 'monthly') {
        return $start->format('F Y');
    }
    return $start->format('Y');
}

function sendPeriodReport(PDO $pdo, $period, DateTimeImmutable $start, DateTimeImmutable $end) {
    $startDate = $start->format('Y-m-d');
    $endDate = $end->format('Y-m-d');
    $reportKey = hash('sha256', $period . ':' . $startDate);
    $lockName = 'iecms_report_' . substr($reportKey, 0, 48);
    $lockStmt = $pdo->prepare('SELECT GET_LOCK(?, 5)');
    $lockStmt->execute([$lockName]);
    if ((int)$lockStmt->fetchColumn() !== 1) {
        return ['period' => $period, 'start' => $startDate, 'busy' => true];
    }

    try {
        $check = $pdo->prepare('SELECT report_key FROM scheduled_reports WHERE report_key = ? LIMIT 1');
        $check->execute([$reportKey]);
        if ($check->fetchColumn()) {
            return ['period' => $period, 'start' => $startDate, 'already_sent' => true];
        }

        $managerStmt = $pdo->query("SELECT email, full_name, role FROM users WHERE role IN ('admin', 'supervisor') AND email <> '' ORDER BY FIELD(role, 'admin', 'supervisor'), id ASC");
        $managers = $managerStmt->fetchAll(PDO::FETCH_ASSOC);
        $assistantStmt = $pdo->query(
            "SELECT u.email, COALESCE(NULLIF(u.full_name, ''), a.name, u.email) AS full_name, a.id AS assistant_id
             FROM users u
             INNER JOIN assistants a ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email))
             WHERE u.role = 'assistant' AND u.email <> ''
             ORDER BY a.name ASC, u.id ASC"
        );
        $assistantRecipients = $assistantStmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$managers && !$assistantRecipients) {
            throw new RuntimeException('No admin, supervisor, or assistant email address is configured.');
        }

        $summaryStmt = $pdo->prepare(
            "SELECT
                COUNT(*) AS registered,
                COALESCE(SUM(CASE WHEN LOWER(status) = 'resolved' AND DATE(COALESCE(NULLIF(resolvedDate, ''), date)) BETWEEN ? AND ? THEN 1 ELSE 0 END), 0) AS resolved,
                COALESCE(SUM(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
                COALESCE(SUM(CASE WHEN LOWER(status) = 'in progress' THEN 1 ELSE 0 END), 0) AS in_progress
             FROM tickets
             WHERE DATE(date) BETWEEN ? AND ?"
        );
        $summaryStmt->execute([$startDate, $endDate, $startDate, $endDate]);
        $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $dominantStmt = $pdo->prepare(
            "SELECT COALESCE(NULLIF(category, ''), type, 'Uncategorized') AS issue, COUNT(*) AS total
             FROM tickets
             WHERE DATE(date) BETWEEN ? AND ?
             GROUP BY COALESCE(NULLIF(category, ''), type, 'Uncategorized')
             ORDER BY total DESC, issue ASC
             LIMIT 1"
        );
        $dominantStmt->execute([$startDate, $endDate]);
        $dominant = $dominantStmt->fetch(PDO::FETCH_ASSOC) ?: ['issue' => 'None recorded', 'total' => 0];

        $staffStmt = $pdo->prepare(
            "SELECT a.id AS assistant_id, a.name, LOWER(COALESCE(u.role, a.role)) AS role,
                SUM(CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END) AS registered,
                SUM(CASE WHEN t.id IS NOT NULL AND LOWER(t.status) = 'resolved' AND DATE(COALESCE(NULLIF(t.resolvedDate, ''), t.date)) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS resolved,
                SUM(CASE WHEN t.id IS NOT NULL AND LOWER(t.status) = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN t.id IS NOT NULL AND LOWER(t.status) = 'in progress' THEN 1 ELSE 0 END) AS in_progress
             FROM assistants a
             LEFT JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email))
             LEFT JOIN tickets t ON t.assignee = a.id AND DATE(t.date) BETWEEN ? AND ?
             GROUP BY a.id, a.name, u.role, a.role
             ORDER BY FIELD(LOWER(COALESCE(u.role, a.role)), 'admin', 'supervisor', 'assistant'), a.name ASC"
        );
        $staffStmt->execute([$startDate, $endDate, $startDate, $endDate]);
        $staff = $staffStmt->fetchAll(PDO::FETCH_ASSOC);

        $periodLabel = reportPeriodLabel($period, $start, $end);
        $heading = 'QUIMS ' . ucfirst($period) . ' Issues Report: ' . $periodLabel;
        $html = '<h2>' . htmlspecialchars($heading, ENT_QUOTES, 'UTF-8') . '</h2>';
        $html .= '<p><strong>Total issues registered:</strong> ' . (int)($summary['registered'] ?? 0) . '<br>';
        $html .= '<strong>Total resolved:</strong> ' . (int)($summary['resolved'] ?? 0) . '<br>';
        $html .= '<strong>Total pending:</strong> ' . (int)($summary['pending'] ?? 0) . '<br>';
        $html .= '<strong>Total in progress:</strong> ' . (int)($summary['in_progress'] ?? 0) . '<br>';
        $html .= '<strong>Dominant issue:</strong> ' . htmlspecialchars((string)$dominant['issue'], ENT_QUOTES, 'UTF-8') . ' (' . (int)$dominant['total'] . ')</p>';
        $html .= '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Assistant / staff member</th><th>Role</th><th>Issues assigned</th><th>Resolved</th><th>Pending</th><th>In progress</th></tr></thead><tbody>';
        foreach ($staff as $member) {
            $html .= '<tr><td>' . htmlspecialchars((string)$member['name'], ENT_QUOTES, 'UTF-8') . '</td><td>' . htmlspecialchars(ucfirst((string)$member['role']), ENT_QUOTES, 'UTF-8') . '</td><td>' . (int)$member['registered'] . '</td><td>' . (int)$member['resolved'] . '</td><td>' . (int)$member['pending'] . '</td><td>' . (int)$member['in_progress'] . '</td></tr>';
        }
        $html .= '</tbody></table>';

        $smtpUser = getenv('IECMS_SMTP_USER') ?: '';
        $smtpPassword = getenv('IECMS_SMTP_PASSWORD') ?: '';
        if ($smtpUser === '' || $smtpPassword === '') {
            throw new RuntimeException('SMTP credentials are not configured. Set IECMS_SMTP_USER and IECMS_SMTP_PASSWORD.');
        }
        $sendReportEmail = static function ($recipient, $subject, $body) use ($smtpUser, $smtpPassword) {
            $mail = new PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = getenv('IECMS_SMTP_HOST') ?: 'smtp.gmail.com';
            $mail->SMTPAuth = true;
            $mail->Username = $smtpUser;
            $mail->Password = $smtpPassword;
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port = (int)(getenv('IECMS_SMTP_PORT') ?: 587);
            $mail->setFrom($smtpUser, 'QUIMS Reports');
            $mail->addAddress($recipient['email'], $recipient['full_name'] ?: 'QUIMS user');
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $body;
            $mail->AltBody = strip_tags(str_replace(['<br>', '</p>'], ["\n", "\n"], $body));
            $mail->send();
        };

        foreach ($managers as $manager) {
            $sendReportEmail($manager, $heading, $html);
        }

        $assistantDominantStmt = $pdo->prepare(
            "SELECT COALESCE(NULLIF(category, ''), type, 'Uncategorized') AS issue, COUNT(*) AS total
             FROM tickets
             WHERE assignee = ? AND DATE(date) BETWEEN ? AND ?
             GROUP BY COALESCE(NULLIF(category, ''), type, 'Uncategorized')
             ORDER BY total DESC, issue ASC
             LIMIT 1"
        );
        foreach ($assistantRecipients as $assistant) {
            $assistantDominantStmt->execute([(int)$assistant['assistant_id'], $startDate, $endDate]);
            $assistantDominant = $assistantDominantStmt->fetch(PDO::FETCH_ASSOC)
                ?: ['issue' => 'None recorded', 'total' => 0];
            $assistantTotal = 0;
            foreach ($staff as $member) {
                if ((int)$member['assistant_id'] === (int)$assistant['assistant_id']) {
                    $assistantTotal = (int)$member['registered'];
                    break;
                }
            }
            $assistantHeading = 'QUIMS ' . ucfirst($period) . ' Personal Issues Report: ' . $periodLabel;
            $assistantHtml = '<h2>' . htmlspecialchars($assistantHeading, ENT_QUOTES, 'UTF-8') . '</h2>';
            $assistantHtml .= '<p>Hello ' . htmlspecialchars((string)$assistant['full_name'], ENT_QUOTES, 'UTF-8') . ',</p>';
            $assistantHtml .= '<p><strong>Your total assigned issues:</strong> ' . $assistantTotal . '<br>';
            $assistantHtml .= '<strong>Your dominant issue:</strong> ' . htmlspecialchars((string)$assistantDominant['issue'], ENT_QUOTES, 'UTF-8') . ' (' . (int)$assistantDominant['total'] . ')</p>';
            $sendReportEmail($assistant, $assistantHeading, $assistantHtml);
        }

        $insert = $pdo->prepare('INSERT INTO scheduled_reports (report_key, period, period_start, period_end, sent_at) VALUES (?, ?, ?, ?, NOW())');
        $insert->execute([$reportKey, $period, $startDate, $endDate]);
        return ['period' => $period, 'start' => $startDate, 'end' => $endDate, 'success' => true];
    } finally {
        $releaseStmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $releaseStmt->execute([$lockName]);
    }
}

$cliOptions = [];
if (PHP_SAPI === 'cli') {
    foreach (array_slice($argv ?? [], 1) as $argument) {
        if ($argument === '--run-scheduled') {
            $cliOptions['run_scheduled'] = true;
        } elseif (preg_match('/^--([a-z-]+)=(.*)$/', $argument, $matches)) {
            $cliOptions[str_replace('-', '_', $matches[1])] = $matches[2];
        }
    }
}

try {
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS scheduled_reports (
            report_key CHAR(64) NOT NULL PRIMARY KEY,
            period VARCHAR(10) NOT NULL,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            sent_at DATETIME NOT NULL,
            UNIQUE KEY uq_scheduled_report_period (period, period_start)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $runScheduled = !empty($cliOptions['run_scheduled'])
        || (PHP_SAPI === 'cli' && count($cliOptions) === 0 && count($argv ?? []) === 1);
    $today = new DateTimeImmutable('today', new DateTimeZone('Africa/Harare'));

    if ($runScheduled) {
        $duePeriods = [];
        $weekday = (int)$today->format('N');
        if ($weekday <= 5) {
            $duePeriods[] = 'daily';
        }
        if ($weekday === 5) {
            $duePeriods[] = 'weekly';
        }
        if ($today->format('Y-m-d') === lastWeekdayOfMonth($today)->format('Y-m-d')) {
            $duePeriods[] = 'monthly';
        }
        $lastDayOfYear = $today->setDate((int)$today->format('Y'), 12, 31);
        if ($today->format('m') === '12'
            && $today->format('Y-m-d') === lastWeekdayOfMonth($lastDayOfYear)->format('Y-m-d')) {
            $duePeriods[] = 'yearly';
        }

        $results = [];
        foreach ($duePeriods as $period) {
            [$start, $end] = reportPeriodDates($period, $today);
            try {
                $results[] = sendPeriodReport($pdo, $period, $start, $end);
            } catch (Throwable $error) {
                $results[] = ['period' => $period, 'error' => $error->getMessage()];
            }
        }
        reportOutput(['success' => !in_array(false, array_map(static function ($result) {
            return isset($result['error']) ? false : true;
        }, $results), true), 'timezone' => 'Africa/Harare', 'date' => $today->format('Y-m-d'), 'reports' => $results]);
        if (array_filter($results, static function ($result) { return isset($result['error']); })) {
            exit(1);
        }
        exit;
    }

    $period = strtolower((string)($cliOptions['period'] ?? $_GET['period'] ?? 'monthly'));
    if (!in_array($period, ['daily', 'weekly', 'monthly', 'yearly'], true)) {
        throw new InvalidArgumentException('Period must be daily, weekly, monthly, or yearly.');
    }

    $dateInput = $cliOptions['date'] ?? $_GET['date'] ?? null;
    $monthInput = $cliOptions['month'] ?? $_GET['month'] ?? null;
    $yearInput = $cliOptions['year'] ?? $_GET['year'] ?? null;
    if ($period === 'monthly' && $monthInput !== null) {
        if (!preg_match('/^\d{4}-\d{2}$/', (string)$monthInput)) {
            throw new InvalidArgumentException('Month must use YYYY-MM format.');
        }
        $dateInput = $monthInput . '-01';
    } elseif ($period === 'yearly' && $yearInput !== null) {
        if (!preg_match('/^\d{4}$/', (string)$yearInput)) {
            throw new InvalidArgumentException('Year must use YYYY format.');
        }
        $dateInput = $yearInput . '-01-01';
    } elseif ($dateInput === null && $period === 'monthly') {
        $dateInput = $today->modify('first day of last month')->format('Y-m-d');
    } elseif ($dateInput === null) {
        $dateInput = $today->format('Y-m-d');
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$dateInput)) {
        throw new InvalidArgumentException('Date must use YYYY-MM-DD format.');
    }
    $reference = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$dateInput, new DateTimeZone('Africa/Harare'));
    if (!$reference || $reference->format('Y-m-d') !== $dateInput) {
        throw new InvalidArgumentException('The supplied report date is not a valid calendar date.');
    }
    [$start, $end] = reportPeriodDates($period, $reference);
    reportOutput(sendPeriodReport($pdo, $period, $start, $end));
} catch (Throwable $error) {
    reportOutput(['error' => $error->getMessage()], PHP_SAPI === 'cli' ? 500 : 400);
    if (PHP_SAPI === 'cli') {
        exit(1);
    }
}
