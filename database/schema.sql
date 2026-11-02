-- CivicFlow — Smart City Assistance and Discovery Platform
-- Fresh-install schema. For an existing database use
-- database/migrations/2026-11-01-platform-upgrade.sql instead.
--
-- This file contains no fake citizens or complaints. It seeds only the
-- platform's service taxonomy and public settings, which are application
-- configuration rather than demonstration data.

CREATE DATABASE IF NOT EXISTS smart_city CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_city;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('citizen','officer','admin') NOT NULL DEFAULT 'citizen',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  phone VARCHAR(30) NULL,
  department VARCHAR(120) NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  icon VARCHAR(40) NOT NULL DEFAULT 'pin',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_service_categories_slug (slug),
  KEY idx_service_categories_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS city_services (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description TEXT NULL,
  address VARCHAR(255) NOT NULL,
  area VARCHAR(120) NULL,
  phone VARCHAR(40) NULL,
  opening_hours VARCHAR(120) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_services_category (category),
  KEY idx_services_area (area),
  KEY idx_services_active (is_active),
  KEY idx_services_name (name),
  CONSTRAINT fk_services_category FOREIGN KEY (category)
    REFERENCES service_categories (slug) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issues (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tracking_code VARCHAR(32) NOT NULL,
  reporter_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  category ENUM('pothole','garbage','streetlight','water_supply','drainage','road_damage','other') NOT NULL,
  description TEXT NOT NULL,
  address VARCHAR(255) NULL,
  area VARCHAR(120) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  photo_path VARCHAR(500) NULL,
  status ENUM('submitted','in_progress','resolved','rejected') NOT NULL DEFAULT 'submitted',
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  assigned_officer_id BIGINT UNSIGNED NULL,
  resolution_summary TEXT NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_issues_tracking (tracking_code),
  KEY idx_issue_status (status),
  KEY idx_issue_created (created_at),
  KEY idx_issue_category (category),
  KEY idx_issue_area (area),
  KEY idx_issue_assigned (assigned_officer_id),
  KEY idx_issue_reporter (reporter_id),
  CONSTRAINT fk_issue_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_issue_officer FOREIGN KEY (assigned_officer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issue_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  issue_id BIGINT UNSIGNED NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  old_status VARCHAR(30) NULL,
  new_status VARCHAR(30) NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_history_issue (issue_id, created_at),
  KEY idx_history_actor (changed_by),
  CONSTRAINT fk_history_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issue_comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  issue_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  comment TEXT NOT NULL,
  visibility ENUM('public','internal') NOT NULL DEFAULT 'public',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_comments_issue (issue_id, created_at),
  KEY idx_comments_visibility (visibility),
  CONSTRAINT fk_comments_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issue_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  issue_id BIGINT UNSIGNED NOT NULL,
  officer_id BIGINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assignment_status ENUM('assigned','reassigned','completed') NOT NULL DEFAULT 'assigned',
  note VARCHAR(500) NULL,
  KEY idx_assignments_issue (issue_id, assigned_at),
  KEY idx_assignments_officer (officer_id),
  CONSTRAINT fk_assignments_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_officer FOREIGN KEY (officer_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignments_author FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS polls (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_polls_active (is_active),
  KEY idx_polls_dates (starts_at, ends_at),
  CONSTRAINT fk_polls_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS poll_options (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_text VARCHAR(180) NOT NULL,
  KEY idx_options_poll (poll_id),
  CONSTRAINT fk_options_poll FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS poll_votes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_vote_per_poll (poll_id, user_id),
  KEY idx_votes_option (option_id),
  KEY idx_votes_user (user_id),
  CONSTRAINT fk_votes_poll FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_option FOREIGN KEY (option_id) REFERENCES poll_options (id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  notification_type VARCHAR(60) NOT NULL DEFAULT 'system',
  related_issue_id BIGINT UNSIGNED NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_user (user_id, is_read, created_at),
  KEY idx_notifications_issue (related_issue_id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_issue FOREIGN KEY (related_issue_id) REFERENCES issues (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NULL,
  entity_id BIGINT UNSIGNED NULL,
  details TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_created (created_at),
  KEY idx_activity_actor (user_id),
  KEY idx_activity_entity (entity_type, entity_id),
  KEY idx_activity_action (action),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value TEXT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Application taxonomy (not sample services)
INSERT INTO service_categories (slug, name, description, icon, sort_order) VALUES
  ('health', 'Healthcare', 'Hospitals, clinics, emergency medical care and pharmacies.', 'heart-pulse', 10),
  ('transport', 'Transportation', 'Bus and rail stations, public transport and parking.', 'bus', 20),
  ('public_safety', 'Emergency services', 'Police, fire, ambulance and emergency contacts.', 'shield', 30),
  ('shopping', 'Shopping and facilities', 'Markets, shopping centres and public facilities.', 'shopping-bag', 40),
  ('government', 'Government services', 'Municipal offices, citizen service centres and departments.', 'landmark', 50),
  ('education', 'Education', 'Schools, colleges and public educational institutions.', 'graduation-cap', 60),
  ('utilities', 'Utilities', 'Water, electricity and civic utility offices.', 'droplets', 70),
  ('other', 'Other services', 'Additional verified city services.', 'pin', 80)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO platform_settings (setting_key, setting_value) VALUES
  ('platform_name', 'CivicFlow'),
  ('city_name', ''),
  ('tagline', 'Your city. Your services. Your voice.'),
  ('support_email', ''),
  ('support_phone', ''),
  ('office_address', '')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);
