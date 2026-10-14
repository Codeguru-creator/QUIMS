-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 31, 2026 at 04:31 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `iecms`
--

-- --------------------------------------------------------

--
-- Table structure for table `assistants`
--

CREATE TABLE `assistants` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(150) NOT NULL,
  `role` varchar(50) DEFAULT 'Assistant',
  `status` varchar(20) DEFAULT 'offline',
  `completed` int(11) DEFAULT 0,
  `pending` int(11) DEFAULT 0,
  `phone` varchar(30) DEFAULT NULL,
  `whatsapp` varchar(30) DEFAULT NULL,
  `disabledAt` varchar(100) DEFAULT NULL,
  `disableDuration` varchar(100) DEFAULT NULL,
  `disableReason` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `assistants`
--

INSERT INTO `assistants` (`id`, `name`, `email`, `role`, `status`, `completed`, `pending`, `phone`, `whatsapp`, `disabledAt`, `disableDuration`, `disableReason`) VALUES
(1, 'Takunda Mutizwa', 'takundat364@gmail.com', 'Admin', 'online', 12, 3, '+263771111111', '+263771111111', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `general_users`
--

CREATE TABLE `general_users` (
  `id` int(11) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `passkey_hash` varchar(255) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `whatsapp` varchar(30) DEFAULT NULL,
  `status` enum('active','suspended','blocked') NOT NULL DEFAULT 'active',
  `failed_attempts` int(11) NOT NULL DEFAULT 0,
  `blocked_until` datetime DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `last_logout` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `user_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `type` varchar(50) DEFAULT 'info',
  `is_read` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `title`, `message`, `user_id`, `created_at`, `type`, `is_read`) VALUES
('notif_1', 'System Initialized', 'IECMS database successfully populated and synced in real-time.', 1, '2026-06-26 12:00:00', 'success', 0),
('notif_2', 'Active Sync Enabled', 'Background synchronization cycle running every second successfully.', 1, '2026-06-26 12:01:00', 'info', 0);

-- --------------------------------------------------------

-- --------------------------------------------------------

--
-- Table structure for table `tickets`
--

CREATE TABLE `tickets` (
  `id` varchar(20) NOT NULL,
  `date` varchar(100) NOT NULL,
  `assignedDate` varchar(100) DEFAULT NULL,
  `resolvedDate` varchar(100) DEFAULT NULL,
  `type` varchar(100) NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `description` text NOT NULL,
  `assignee` int(11) DEFAULT NULL,
  `status` enum('Pending','In Progress','Resolved') NOT NULL DEFAULT 'Pending',
  `external` varchar(255) DEFAULT NULL,
  `externalCause` varchar(255) DEFAULT NULL,
  `adminConstraint` varchar(255) DEFAULT NULL,
  `quantity` int(11) DEFAULT 1,
  `staffDetails` text DEFAULT NULL,
  `overdueNotified` tinyint(1) DEFAULT 0,
  `edited_by` varchar(255) DEFAULT NULL,
  `edited_at` datetime DEFAULT NULL,
  `reassigned_by` varchar(255) DEFAULT NULL,
  `reassigned_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tickets`
--

INSERT INTO `tickets` (`id`, `date`, `assignedDate`, `resolvedDate`, `type`, `category`, `description`, `assignee`, `status`, `external`, `externalCause`, `adminConstraint`, `quantity`, `staffDetails`, `overdueNotified`) VALUES
('T-1', '2026-06-24 10:15:00', '2026-06-24 10:30:00', NULL, 'User Problem', 'Hardware', 'Printer cartridge replacement request', 1, 'In Progress', 'No', NULL, NULL, 1, 'Department: Accounting, Floor: 2', 0),
('T-2', '2026-06-25 14:00:00', NULL, NULL, 'Query', 'Software', 'Unable to login to secondary portal', NULL, 'Pending', NULL, NULL, NULL, 1, 'Department: HR', 0),
('T-3', '2026-06-26 09:30:00', '2026-06-26 09:35:00', '2026-06-26 11:15:00', 'IECMS', 'Database', 'Weekly sync job failure troubleshooting', NULL, 'Resolved', 'Yes', 'Network Timeout', 'System maintenance conflict', 1, 'Server room main unit', 0);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','supervisor','assistant') NOT NULL DEFAULT 'assistant',
  `is_permanent_block` tinyint(1) DEFAULT 0,
  `failed_attempts` int(11) DEFAULT 0,
  `blocked_until` datetime DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `whatsapp` varchar(20) DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `last_activity` datetime DEFAULT NULL,
  `last_logout` datetime DEFAULT NULL,
  `last_login_alert` tinyint(1) DEFAULT 0,
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_token_expiry` datetime DEFAULT NULL,
  `last_password_change` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `full_name`, `email`, `password_hash`, `role`, `is_permanent_block`, `failed_attempts`, `blocked_until`, `phone`, `whatsapp`, `last_login`, `last_login_alert`, `reset_token`, `reset_token_expiry`, `last_password_change`, `created_at`, `updated_at`) VALUES
(1, 'Takunda Mutizwa', 'takundat364@gmail.com', '$2y$10$IzecVVefL0/vUvc9zwFGY.Lpfq1XC55tdR4Oo2LMlSMLUh8pdNlHu', 'admin', 0, 0, NULL, NULL, NULL, '2026-08-31 16:23:24', 0, NULL, NULL, NULL, '2026-01-08 16:04:32', '2026-08-31 16:23:24'),
(2, 'Bob Nyabinde', 'bob@example.com', '$2y$10$IzecVVefL0/vUvc9zwFGY.Lpfq1XC55tdR4Oo2LMlSMLUh8pdNlHu', 'supervisor', 0, 0, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, '2026-01-08 16:04:32', '2026-06-24 11:26:11'),
(3, 'Ashley Mutizwa', 'ashleymutizwa@gmail.com', '$2y$10$IzecVVefL0/vUvc9zwFGY.Lpfq1XC55tdR4Oo2LMlSMLUh8pdNlHu', 'assistant', 0, 0, NULL, NULL, NULL, '2026-05-16 11:13:29', 0, NULL, NULL, NULL, '2026-01-08 16:04:32', '2026-06-24 11:26:20');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `assistants`
--
ALTER TABLE `assistants`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `general_users`
--
ALTER TABLE `general_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_general_users_email` (`email`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notifications_user` (`user_id`);

--
-- Indexes for table `tickets`
--
ALTER TABLE `tickets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_tickets_assignee` (`assignee`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `general_users`
--
ALTER TABLE `general_users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `assistants`
--
ALTER TABLE `assistants`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `tickets`
--
ALTER TABLE `tickets`
  ADD CONSTRAINT `fk_tickets_assignee` FOREIGN KEY (`assignee`) REFERENCES `assistants` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
