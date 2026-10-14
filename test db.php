<?php
require 'db.php';

$stmt = $pdo->query("SELECT DATABASE()");
echo "Connected to database: " . $stmt->fetchColumn();
