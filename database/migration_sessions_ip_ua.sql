-- Add IP address and user agent tracking to sessions
ALTER TABLE sessions ADD COLUMN ip_address VARCHAR(45);
ALTER TABLE sessions ADD COLUMN user_agent VARCHAR(512);
