-- Add a dedicated activity timestamp so live dashboard use does not alter last_login.
-- Run once against the IECMS database before deploying the presence heartbeat code.
ALTER TABLE users
  ADD COLUMN last_activity datetime DEFAULT NULL AFTER last_login;

UPDATE users
SET last_activity = COALESCE(last_logout, last_login)
WHERE last_activity IS NULL;
