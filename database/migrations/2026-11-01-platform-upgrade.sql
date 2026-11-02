-- CivicFlow v3 platform upgrade
-- Upgrades the existing smart_city database in place WITHOUT deleting users,
-- complaints, tracking codes, votes or service records.
--
-- Back up first:
--   mysqldump -u root smart_city > smart_city_backup.sql
-- Then run:
--   mysql -u root smart_city < database/migrations/2026-11-01-platform-upgrade.sql
--
-- The helper procedures make each structural change idempotent, so the script
-- can be re-run safely after a partial failure.

USE smart_city;
SET NAMES utf8mb4;

DELIMITER $$

DROP PROCEDURE IF EXISTS sc_add_column$$
CREATE PROCEDURE sc_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @sc_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE sc_stmt FROM @sc_sql;
    EXECUTE sc_stmt;
    DEALLOCATE PREPARE sc_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS sc_add_index$$
CREATE PROCEDURE sc_add_index(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_columns TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @sc_sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
    PREPARE sc_stmt FROM @sc_sql;
    EXECUTE sc_stmt;
    DEALLOCATE PREPARE sc_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS sc_add_foreign_key$$
CREATE PROCEDURE sc_add_foreign_key(IN p_table VARCHAR(64), IN p_fk VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table
      AND CONSTRAINT_NAME = p_fk AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @sc_sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_fk, '` ', p_definition);
    PREPARE sc_stmt FROM @sc_sql;
    EXECUTE sc_stmt;
    DEALLOCATE PREPARE sc_stmt;
  END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CALL sc_add_column('users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL sc_add_column('users', 'phone', 'VARCHAR(30) NULL');
CALL sc_add_column('users', 'department', 'VARCHAR(120) NULL');
CALL sc_add_column('users', 'last_login_at', 'DATETIME NULL');
CALL sc_add_column('users', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL sc_add_index('users', 'idx_users_role', '`role`');
CALL sc_add_index('users', 'idx_users_active', '`is_active`');

-- ---------------------------------------------------------------------------
-- Service taxonomy and directory
-- ---------------------------------------------------------------------------
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

DELIMITER $$
DROP PROCEDURE IF EXISTS sc_create_city_services$$
CREATE PROCEDURE sc_create_city_services()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'city_services'
  ) THEN
    CREATE TABLE city_services (
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
  END IF;
END$$
DELIMITER ;
CALL sc_create_city_services();
DROP PROCEDURE IF EXISTS sc_create_city_services;

CALL sc_add_column('city_services', 'area', 'VARCHAR(120) NULL');
CALL sc_add_column('city_services', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL sc_add_column('city_services', 'opening_hours', 'VARCHAR(120) NULL');

-- Convert a legacy ENUM category to the managed taxonomy slug.
ALTER TABLE city_services MODIFY COLUMN category VARCHAR(60) NOT NULL;

-- Ensure every existing category value has a taxonomy row before adding the FK.
INSERT INTO service_categories (slug, name, description, icon, sort_order)
SELECT DISTINCT
  LOWER(category),
  CONCAT(UPPER(LEFT(REPLACE(LOWER(category), '_', ' '), 1)), SUBSTRING(REPLACE(LOWER(category), '_', ' '), 2)),
  'Imported from the existing service directory.',
  'pin',
  90
FROM city_services
WHERE category IS NOT NULL AND category <> ''
  AND LOWER(category) NOT IN (SELECT slug FROM service_categories);

CALL sc_add_index('city_services', 'idx_services_category', '`category`');
CALL sc_add_index('city_services', 'idx_services_area', '`area`');
CALL sc_add_index('city_services', 'idx_services_active', '`is_active`');
CALL sc_add_index('city_services', 'idx_services_name', '`name`');
CALL sc_add_foreign_key('city_services', 'fk_services_category',
  'FOREIGN KEY (`category`) REFERENCES `service_categories` (`slug`) ON UPDATE CASCADE ON DELETE RESTRICT');

-- Copy legacy service directory rows, if the legacy table exists.
DELIMITER $$
DROP PROCEDURE IF EXISTS sc_migrate_legacy_services$$
CREATE PROCEDURE sc_migrate_legacy_services()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'address'
  ) THEN
    SET @sc_sql = "
      INSERT INTO city_services (name, category, description, address, phone, latitude, longitude, is_active, created_at)
      SELECT s.name,
             CASE s.category
               WHEN 'hospital' THEN 'health'
               WHEN 'transport' THEN 'transport'
               WHEN 'shop' THEN 'shopping'
               WHEN 'emergency' THEN 'public_safety'
               ELSE 'other'
             END,
             s.description,
             s.address,
             s.phone,
             s.latitude,
             s.longitude,
             COALESCE(s.is_active, 1),
             s.created_at
      FROM services s
      WHERE NOT EXISTS (
        SELECT 1 FROM city_services c WHERE c.name = s.name AND c.address = s.address
      )";
    PREPARE sc_stmt FROM @sc_sql;
    EXECUTE sc_stmt;
    DEALLOCATE PREPARE sc_stmt;
  END IF;
END$$
DELIMITER ;
CALL sc_migrate_legacy_services();
DROP PROCEDURE IF EXISTS sc_migrate_legacy_services;

-- ---------------------------------------------------------------------------
-- Complaints
-- ---------------------------------------------------------------------------
ALTER TABLE issues MODIFY COLUMN title VARCHAR(160) NOT NULL;
ALTER TABLE issues MODIFY COLUMN category ENUM('pothole','garbage','streetlight','water_supply','drainage','road_damage','other') NOT NULL;

CALL sc_add_column('issues', 'area', 'VARCHAR(120) NULL');
CALL sc_add_column('issues', 'priority', "ENUM('low','medium','high') NOT NULL DEFAULT 'medium'");
CALL sc_add_column('issues', 'assigned_officer_id', 'BIGINT UNSIGNED NULL');
CALL sc_add_column('issues', 'resolution_summary', 'TEXT NULL');
CALL sc_add_column('issues', 'resolved_at', 'DATETIME NULL');

CALL sc_add_index('issues', 'idx_issue_status', '`status`');
CALL sc_add_index('issues', 'idx_issue_created', '`created_at`');
CALL sc_add_index('issues', 'idx_issue_category', '`category`');
CALL sc_add_index('issues', 'idx_issue_area', '`area`');
CALL sc_add_index('issues', 'idx_issue_assigned', '`assigned_officer_id`');
CALL sc_add_foreign_key('issues', 'fk_issue_officer',
  'FOREIGN KEY (`assigned_officer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL');

CALL sc_add_index('issue_status_history', 'idx_history_issue', '`issue_id`, `created_at`');

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

-- ---------------------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------------------
ALTER TABLE polls MODIFY COLUMN title VARCHAR(180) NOT NULL;
CALL sc_add_column('polls', 'starts_at', 'DATETIME NULL');
CALL sc_add_column('polls', 'ends_at', 'DATETIME NULL');
CALL sc_add_column('polls', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL sc_add_column('polls', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL sc_add_column('polls', 'created_by', 'BIGINT UNSIGNED NULL');
CALL sc_add_index('polls', 'idx_polls_active', '`is_active`');
CALL sc_add_index('polls', 'idx_polls_dates', '`starts_at`, `ends_at`');

UPDATE polls SET is_active = 1 WHERE is_active IS NULL;

-- ---------------------------------------------------------------------------
-- Notifications, audit trail and settings
-- ---------------------------------------------------------------------------
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

INSERT INTO platform_settings (setting_key, setting_value) VALUES
  ('platform_name', 'CivicFlow'),
  ('city_name', ''),
  ('tagline', 'Your city. Your services. Your voice.'),
  ('support_email', ''),
  ('support_phone', ''),
  ('office_address', '')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

-- ---------------------------------------------------------------------------
-- Backfill an initial timeline entry for complaints created before the
-- status-history table existed. Safe to re-run: only issues with no history
-- rows are touched.
-- ---------------------------------------------------------------------------
INSERT INTO issue_status_history (issue_id, changed_by, old_status, new_status, note, created_at)
SELECT i.id, i.reporter_id, NULL, 'submitted', 'Complaint submitted by citizen.', i.created_at
FROM issues i
WHERE NOT EXISTS (
  SELECT 1 FROM issue_status_history h WHERE h.issue_id = i.id
);

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sc_add_column;
DROP PROCEDURE IF EXISTS sc_add_index;
DROP PROCEDURE IF EXISTS sc_add_foreign_key;

SELECT 'CivicFlow schema upgrade complete.' AS result;
