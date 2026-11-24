-- Applied by scripts/init-db.js, which creates the database named in DB_NAME first.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('administrator', 'assessor') NOT NULL DEFAULT 'assessor',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  status ENUM('draft', 'in_progress', 'completed', 'archived') NOT NULL DEFAULT 'draft',
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessments_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assessment_id INT NOT NULL,
  target_url VARCHAR(500) NOT NULL,
  target_type ENUM('web_app', 'api', 'network', 'host') NOT NULL DEFAULT 'web_app',
  authorized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_targets_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assessment_id INT NOT NULL,
  target_id INT NOT NULL,
  scanner_type VARCHAR(100) NOT NULL,
  status ENUM('queued', 'running', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  started_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_scans_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_scans_target
    FOREIGN KEY (target_id) REFERENCES targets(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS findings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scan_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  severity ENUM('info', 'low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'info',
  affected_url VARCHAR(500),
  evidence TEXT,
  remediation TEXT,
  status ENUM('open', 'confirmed', 'false_positive', 'mitigated') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_findings_scan
    FOREIGN KEY (scan_id) REFERENCES scans(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assessor_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  finding_id INT NOT NULL,
  assessor_id INT NOT NULL,
  decision ENUM('confirmed', 'false_positive', 'needs_retest', 'mitigated') NOT NULL,
  remarks TEXT,
  reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reviews_finding
    FOREIGN KEY (finding_id) REFERENCES findings(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reviews_assessor
    FOREIGN KEY (assessor_id) REFERENCES users(id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assessment_id INT NOT NULL,
  generated_by INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reports_generated_by
    FOREIGN KEY (generated_by) REFERENCES users(id)
    ON DELETE RESTRICT
);
