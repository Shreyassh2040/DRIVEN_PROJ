-- Run this against your existing smart_city database before using CivicFlow v2.
USE smart_city;
-- Expand categories while preserving existing complaint rows.
ALTER TABLE issues MODIFY category ENUM('pothole','garbage','streetlight','water_supply','drainage','road_damage','other') NOT NULL;
-- Add history table if it does not already exist.
CREATE TABLE IF NOT EXISTS issue_status_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 issue_id BIGINT UNSIGNED NOT NULL,
 changed_by BIGINT UNSIGNED NOT NULL,
 old_status ENUM('submitted','in_progress','resolved','rejected') NULL,
 new_status ENUM('submitted','in_progress','resolved','rejected') NOT NULL,
 note VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE,
 FOREIGN KEY(changed_by) REFERENCES users(id), INDEX idx_history_issue(issue_id,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS city_services (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(150) NOT NULL,
 category ENUM('health','transport','utilities','public_safety','government','education','other') NOT NULL,
 description TEXT, address VARCHAR(255), phone VARCHAR(40), opening_hours VARCHAR(120),
 latitude DECIMAL(10,7), longitude DECIMAL(10,7), is_active BOOLEAN DEFAULT TRUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS polls (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(180) NOT NULL, description TEXT,
 closes_at DATETIME NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
ALTER TABLE polls ADD COLUMN closes_at DATETIME NULL;
ALTER TABLE polls ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS poll_options (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, poll_id BIGINT UNSIGNED NOT NULL, option_text VARCHAR(180) NOT NULL,
 FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS poll_votes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, poll_id BIGINT UNSIGNED NOT NULL, option_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY unique_user_poll(user_id,poll_id), FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE,
 FOREIGN KEY(option_id) REFERENCES poll_options(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- Seed a few editable examples. Add real local addresses and contact details before demonstration.
INSERT INTO city_services(name,category,description,address,phone,opening_hours) VALUES
('City General Hospital','health','Emergency and general medical services.','Add local address','108','24 hours'),
('Municipal Corporation Office','government','Citizen services, certificates and civic assistance.','Add local address','Add phone','Mon–Sat, 10:00–17:30'),
('City Bus Information','transport','Public transport routes and schedule assistance.','Central Bus Stand','Add phone','Daily');

-- Copy legacy service directory records into the new directory table (if any exist).
INSERT INTO city_services(name,category,description,address,phone,latitude,longitude,is_active)
SELECT name, CASE category WHEN 'hospital' THEN 'health' WHEN 'transport' THEN 'transport' WHEN 'emergency' THEN 'public_safety' WHEN 'shop' THEN 'other' ELSE 'other' END, description,address,phone,latitude,longitude,is_active FROM services;
