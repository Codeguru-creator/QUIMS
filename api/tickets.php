<?php
require_once __DIR__ . '/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
if (in_array($method, ['GET', 'POST', 'PUT'], true)) {
    requireAuth();
} else {
    requireAdminOrSupervisor();
}
$columnCheck = $db->prepare("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tickets' AND column_name IN ('edited_by', 'edited_at', 'reassigned_by', 'reassigned_at')");
$columnCheck->execute();
$availableAuditColumns = $columnCheck->fetchAll(PDO::FETCH_COLUMN);
$hasEditAudit = in_array('edited_by', $availableAuditColumns, true) && in_array('edited_at', $availableAuditColumns, true);
$hasReassignmentAudit = in_array('reassigned_by', $availableAuditColumns, true) && in_array('reassigned_at', $availableAuditColumns, true);
$ticketColumns = 't.id, t.date, t.assignedDate, t.resolvedDate, t.type, t.category, t.description, t.assignee,
    CASE WHEN t.type IN ("Virtual Sessions", "P/COPYING") THEN COALESCE(NULLIF(u.full_name, ""), a.name) ELSE a.name END AS assignee_name,
    CASE WHEN LOWER(t.status) IN ("pending", "in progress", "resolved") THEN
        CASE WHEN LOWER(t.status) = "pending" THEN "Pending"
             WHEN LOWER(t.status) = "in progress" THEN "In Progress"
             ELSE "Resolved" END
        ELSE "Pending" END AS status,
    t.external, t.externalCause, t.adminConstraint, t.quantity, t.staffDetails'
    . ($hasEditAudit ? ', t.edited_by, t.edited_at' : ', NULL AS edited_by, NULL AS edited_at')
    . ($hasReassignmentAudit ? ', t.reassigned_by, t.reassigned_at' : ', NULL AS reassigned_by, NULL AS reassigned_at');
$ticketFrom = 'tickets t LEFT JOIN assistants a ON a.id = t.assignee LEFT JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(a.email))';

try {
    if ($method === 'GET') {
        if (in_array(currentRole(), ['admin', 'supervisor'], true)) {
            $stmt = $db->query("SELECT $ticketColumns FROM $ticketFrom ORDER BY t.date DESC");
        } else {
            $owner = getAssistantForUser($_SESSION['user_id']);
            if (!$owner) {
                sendJson([]);
            }
            $stmt = $db->prepare("SELECT $ticketColumns FROM $ticketFrom WHERE t.assignee = ? ORDER BY t.date DESC");
            $stmt->execute([(int)$owner['id']]);
        }
        $tickets = $stmt->fetchAll();
        foreach ($tickets as &$ticket) {
            $ticket['assignee'] = $ticket['assignee'] === null ? null : (int)$ticket['assignee'];
        }
        sendJson($tickets);
    }

    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    if (!is_array($data)) {
        http_response_code(400);
        sendJson(['error' => 'Invalid request body']);
    }

    if ($method === 'POST') {
        $assignee = $data['assignee'] ?? null;
        $ticketType = trim((string)($data['type'] ?? 'User Problem'));
        $usesCurrentUserAsAssignee = in_array($ticketType, ['Virtual Sessions', 'P/COPYING'], true);
        if ($usesCurrentUserAsAssignee) {
            $owner = getAssistantForUser($_SESSION['user_id']);
            if (!$owner) {
                http_response_code(403);
                sendJson(['error' => 'Your account must be linked to an assistant profile to save the Supported By name as the assignee.']);
            }
            $assignee = (int)$owner['id'];
            if (empty($data['assignedDate'])) {
                $data['assignedDate'] = date('Y-m-d H:i:s');
            }
        }
        $selfAssignment = false;
        if (!in_array(currentRole(), ['admin', 'supervisor'], true)) {
            $owner = getAssistantForUser($_SESSION['user_id']);
            if (!$owner) {
                http_response_code(403);
                sendJson(['error' => 'Your account is not linked to an assistant profile']);
            }
            if ($assignee !== null && $assignee !== '' && (int)$assignee !== (int)$owner['id']) {
                http_response_code(403);
                sendJson(['error' => 'This account can only register tasks for its own profile']);
            }
            $assignee = $owner['id'];
        } else {
            $owner = getAssistantForUser($_SESSION['user_id']);
            $selfAssignment = $owner && $assignee !== null && $assignee !== '' && (int)$assignee === (int)$owner['id'];
            if (!$selfAssignment) {
                validateAssignmentTarget($assignee);
            }
        }
        $submittedStatus = strtolower(trim((string)($data['status'] ?? 'pending')));
        if (!in_array($submittedStatus, ['pending', 'in progress', 'resolved'], true)) {
            http_response_code(400);
            sendJson(['error' => 'Ticket status must be Pending, In Progress, or Resolved']);
        }
        $data['status'] = ucwords($submittedStatus);
        if ($assignee !== null && $assignee !== '' && $submittedStatus === 'in progress') {
            $data['status'] = 'Pending';
        }
        if ($selfAssignment) {
            $data['status'] = 'Resolved';
            if (empty($data['assignedDate'])) {
                $data['assignedDate'] = date('Y-m-d H:i:s');
            }
        }
        if (strtolower((string)($data['status'] ?? '')) === 'resolved' && empty($data['resolvedDate'])) {
            $data['resolvedDate'] = date('Y-m-d H:i:s');
        }
        $category = strtolower(trim((string)($data['category'] ?? '')));
        switch (strtolower($ticketType)) {
            case 'query':
                $ticketPrefix = 'TQ';
                break;
            case 'user problem':
                $ticketPrefix = $category === 'software' ? 'TUPS' : ($category === 'hardware' ? 'TUPH' : 'TUP');
                break;
            case 'iecms':
                $ticketPrefix = 'TE';
                break;
            case 'virtual sessions':
                $ticketPrefix = 'TVS';
                break;
            case 'p/copying':
                $ticketPrefix = 'TP';
                break;
            default:
                $ticketPrefix = 'T';
        }
        $yearSuffix = date('y');
        $lockName = 'iecms_ticket_sequence_' . $yearSuffix;
        $lockStmt = $db->prepare('SELECT GET_LOCK(?, 5)');
        $lockStmt->execute([$lockName]);
        if ((int)$lockStmt->fetchColumn() !== 1) {
            http_response_code(503);
            sendJson(['error' => 'Unable to generate a ticket number right now. Please try again.']);
        }

        try {
            $highestSequenceStmt = $db->prepare(
                "SELECT COALESCE(MAX(CAST(REGEXP_SUBSTR(SUBSTRING_INDEX(id, '/', 1), '[0-9]+$') AS UNSIGNED)), 0)
                 FROM tickets
                 WHERE id REGEXP ?"
            );
            $highestSequenceStmt->execute(['^[A-Z]+[0-9]+/' . $yearSuffix . '$']);
            $highestSequence = (int)$highestSequenceStmt->fetchColumn();

            $id = $ticketPrefix . ($highestSequence + 1) . '/' . $yearSuffix;
            $stmt = $db->prepare(
                'INSERT INTO tickets (id, date, assignedDate, resolvedDate, type, category, description, assignee, status, external, externalCause, adminConstraint, quantity, staffDetails) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $id, $data['date'] ?? date('Y-m-d H:i:s'), $data['assignedDate'] ?? null,
                $data['resolvedDate'] ?? null, $ticketType, $data['category'] ?? null,
                $data['description'] ?? '', $assignee, $data['status'] ?? 'Pending',
                $data['external'] ?? null, $data['externalCause'] ?? null, $data['adminConstraint'] ?? null,
                $data['quantity'] ?? 1, $data['staffDetails'] ?? null
            ]);
        } finally {
            $releaseLockStmt = $db->prepare('SELECT RELEASE_LOCK(?)');
            $releaseLockStmt->execute([$lockName]);
        }
        $fetch = $db->prepare("SELECT $ticketColumns FROM $ticketFrom WHERE t.id = ?");
        $fetch->execute([$id]);
        if ($assignee !== null && $assignee !== '') {
            try {
                notifyTicketAssignee($assignee, $id);
            } catch (Throwable $notificationError) {
                error_log('Ticket notification failed: ' . $notificationError->getMessage());
            }
        }
        sendJson(['success' => true, 'ticket' => $fetch->fetch()]);
    }

    if ($method === 'PUT') {
        $id = $data['id'] ?? null;
        $updates = $data['updates'] ?? [];
        if (!is_array($updates)) {
            http_response_code(400);
            sendJson(['error' => 'Ticket updates must be an object']);
        }
        if (array_key_exists('status', $updates)) {
            $statusKey = strtolower(trim((string)$updates['status']));
            $statusLabels = [
                'pending' => 'Pending',
                'in progress' => 'In Progress',
                'resolved' => 'Resolved'
            ];
            if (!array_key_exists($statusKey, $statusLabels)) {
                http_response_code(400);
                sendJson(['error' => 'Ticket status must be Pending, In Progress, or Resolved']);
            }
            $updates['status'] = $statusLabels[$statusKey];
        }
        $submittedUpdateFields = array_keys($updates);
        if (strtolower((string)($updates['status'] ?? '')) === 'resolved' && empty($updates['resolvedDate'])) {
            $updates['resolvedDate'] = date('Y-m-d H:i:s');
        }
        $allowed = ['assignedDate', 'resolvedDate', 'type', 'category', 'description', 'assignee', 'status', 'external', 'externalCause', 'adminConstraint', 'quantity', 'staffDetails'];
        if (!$id || !$updates) {
            http_response_code(400);
            sendJson(['error' => 'Ticket ID and updates are required']);
        }
        $actorAssistant = getAssistantForUser($_SESSION['user_id']);
        $selfAssignment = array_key_exists('assignee', $updates)
            && $actorAssistant
            && $updates['assignee'] !== null
            && $updates['assignee'] !== ''
            && (int)$updates['assignee'] === (int)$actorAssistant['id'];
        if (array_key_exists('assignee', $updates) && !$selfAssignment) {
            validateAssignmentTarget($updates['assignee']);
        }
        $oldStmt = $db->prepare('SELECT assignee, status FROM tickets WHERE id = ? LIMIT 1');
        $oldStmt->execute([$id]);
        $oldTicket = $oldStmt->fetch();
        if (!$oldTicket) {
            http_response_code(404);
            sendJson(['error' => 'Ticket not found']);
        }
        $isNewSelfAssignment = $selfAssignment
            && (string)($oldTicket['assignee'] ?? '') !== (string)$actorAssistant['id'];
        if ($isNewSelfAssignment && in_array(currentRole(), ['admin', 'supervisor'], true)) {
            $updates['status'] = 'Resolved';
            $updates['resolvedDate'] = date('Y-m-d H:i:s');
            if (empty($updates['assignedDate'])) {
                $updates['assignedDate'] = date('Y-m-d H:i:s');
            }
        }
        $sets = [];
        $values = [];
        foreach ($allowed as $column) {
            if (array_key_exists($column, $updates)) {
                $sets[] = "`$column` = ?";
                $values[] = $updates[$column];
            }
        }
        if (!$sets) {
            http_response_code(400);
            sendJson(['error' => 'Ticket ID and updates are required']);
        }
        if (!in_array(currentRole(), ['admin', 'supervisor'], true)) {
            $actorAssistant = getAssistantForUser($_SESSION['user_id']);
            $ownsTicket = $actorAssistant && (int)$oldTicket['assignee'] === (int)$actorAssistant['id'];
            if (!$ownsTicket) {
                http_response_code(403);
                sendJson(['error' => 'You can only update tickets assigned to you']);
            }
            if (array_key_exists('assignee', $updates) && (int)$updates['assignee'] !== (int)$actorAssistant['id']) {
                http_response_code(403);
                sendJson(['error' => 'You cannot reassign this ticket']);
            }
            $allowedStaffUpdates = currentRole() === 'assistant'
                ? ['status']
                : ['status', 'description', 'external', 'externalCause', 'resolvedDate', 'staffDetails', 'quantity'];
            foreach ($submittedUpdateFields as $column) {
                if (!in_array($column, $allowedStaffUpdates, true)) {
                    http_response_code(403);
                    sendJson(['error' => 'This account cannot edit that ticket field']);
                }
            }
        }
        $statusRank = ['pending' => 0, 'in progress' => 1, 'resolved' => 2];
        if (array_key_exists('status', $updates)) {
            $oldStatusKey = strtolower(trim((string)($oldTicket['status'] ?? 'Pending')));
            if (!in_array($oldStatusKey, ['pending', 'in progress', 'resolved'], true)) {
                $oldStatusKey = 'pending';
            }
            $newStatusKey = strtolower(trim((string)$updates['status']));
            if (!array_key_exists($newStatusKey, $statusRank)) {
                http_response_code(400);
                sendJson(['error' => 'Ticket status must be Pending, In Progress, or Resolved']);
            }
            if (($statusRank[$newStatusKey] ?? 0) < ($statusRank[$oldStatusKey] ?? 0)) {
                http_response_code(409);
                sendJson(['error' => 'Ticket status cannot move backwards']);
            }
        }
        if (currentRole() === 'supervisor') {
            $actorAssistant = getAssistantForUser($_SESSION['user_id']);
            $ownsTicket = $actorAssistant && $oldTicket && (int)$oldTicket['assignee'] === (int)$actorAssistant['id'];
            if ($oldTicket && $oldTicket['assignee'] !== null && !$ownsTicket) {
                http_response_code(403);
                sendJson(['error' => 'Supervisors can only update their own assignments']);
            }
        }
        if ($hasEditAudit) {
            $sets[] = '`edited_by` = ?';
            $sets[] = '`edited_at` = ?';
            $values[] = currentUserDisplayName();
            $values[] = date('Y-m-d H:i:s');
        }
        if ($hasReassignmentAudit && array_key_exists('assignee', $updates) && (!$oldTicket || (string)$oldTicket['assignee'] !== (string)$updates['assignee'])) {
            $sets[] = '`reassigned_by` = ?';
            $sets[] = '`reassigned_at` = ?';
            $values[] = currentUserDisplayName();
            $values[] = date('Y-m-d H:i:s');
        }
        $values[] = $id;
        $stmt = $db->prepare('UPDATE tickets SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $stmt->execute($values);
        $newAssignee = array_key_exists('assignee', $updates) ? $updates['assignee'] : ($oldTicket['assignee'] ?? null);
        $assigneeChanged = array_key_exists('assignee', $updates)
            && (string)($oldTicket['assignee'] ?? '') !== (string)($newAssignee ?? '');
        if ($assigneeChanged && $newAssignee !== null && $newAssignee !== '') {
            try {
                notifyTicketAssignee($newAssignee, $id);
            } catch (Throwable $notificationError) {
                error_log('Ticket notification failed: ' . $notificationError->getMessage());
            }
        }
        $updatedTicketStmt = $db->prepare("SELECT $ticketColumns FROM $ticketFrom WHERE t.id = ?");
        $updatedTicketStmt->execute([$id]);
        sendJson(['success' => true, 'ticket' => $updatedTicketStmt->fetch()]);
    }

    if ($method === 'DELETE') {
        requireAdmin();
        $id = $data['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            sendJson(['error' => 'Ticket ID is required']);
        }
        $stmt = $db->prepare('DELETE FROM tickets WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(['success' => true]);
    }

    http_response_code(405);
    sendJson(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('Ticket API database error: ' . $e->getMessage());
    sendJson(['error' => 'Failed to process tickets: ' . $e->getMessage()]);
}
