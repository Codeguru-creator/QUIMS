<?php

$host = '127.0.0.1';
$db   = 'iecms';
$user = 'root';
$pass = '';
$charset = 'utf8mb4';



$dsn = "mysql:host=$host;dbname=$db;charset=$charset";

$pdoOptions = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {

    $pdo = new PDO(
        $dsn,
        $user,
        $pass,
        $pdoOptions
    );

} catch (PDOException $e) {

    die("PDO Connection failed: " . $e->getMessage());

}

/* =========================
   MYSQLI CONNECTION
========================= */

$conn = new mysqli(
    $host,
    $user,
    $pass,
    $db
);

/* CHECK MYSQLI CONNECTION */

if ($conn->connect_error) {

    die("MySQLi Connection failed: " . $conn->connect_error);

}

/* SET UTF8 */
$conn->set_charset("utf8mb4");

?>