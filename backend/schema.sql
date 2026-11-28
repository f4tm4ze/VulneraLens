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


CREATE TABLE IF NOT EXISTS assessment_targets (
  assessment_id INT NOT NULL,
  target_id INT NOT NULL,
  PRIMARY KEY (assessment_id, target_id),
  CONSTRAINT fk_assessment_targets_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assessment_targets_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE RESTRICT
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

ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS evidence_path VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS error_message TEXT NULL;

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS ai_explanation TEXT NULL,
  ADD COLUMN IF NOT EXISTS ai_severity ENUM('info', 'low', 'medium', 'high', 'critical') NULL,
  ADD COLUMN IF NOT EXISTS ai_confidence VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS ai_remediation TEXT NULL;

CREATE TABLE IF NOT EXISTS ai_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  finding_id INT NOT NULL,
  model VARCHAR(100) NOT NULL,
  redacted_prompt TEXT NOT NULL,
  response_text TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_logs_finding
    FOREIGN KEY (finding_id) REFERENCES findings(id)
    ON DELETE CASCADE
);

ALTER TABLE ai_logs
  ADD COLUMN IF NOT EXISTS user_id INT NULL,
  ADD COLUMN IF NOT EXISTS sent_payload TEXT NULL,
  ADD COLUMN IF NOT EXISTS redacted_prompt TEXT NULL,
  ADD COLUMN IF NOT EXISTS response_text TEXT NULL;

-- When/which AI produced the analysis shown on the Findings page.
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100) NULL;



-- VulneraLens revision: archival, traceability, and tool execution metadata.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS status_before_archive VARCHAR(32) NULL;
ALTER TABLE targets MODIFY assessment_id INT NULL;
ALTER TABLE targets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS tool_version VARCHAR(100) NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS command_config TEXT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS stdout_text MEDIUMTEXT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS stderr_text MEDIUMTEXT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS exit_code INT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS duration_ms BIGINT NULL;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS progress_pct INT NOT NULL DEFAULT 0;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS source_tool VARCHAR(100) NULL;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS http_method VARCHAR(20) NULL;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS affected_parameter VARCHAR(255) NULL;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS payload TEXT NULL;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS request_evidence MEDIUMTEXT NULL;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS response_evidence MEDIUMTEXT NULL;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS references_text TEXT NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS tool_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scan_id INT NOT NULL,
  tool_name VARCHAR(80) NOT NULL,
  tool_version VARCHAR(100) NULL,
  command_config TEXT NULL,
  status ENUM('pending','queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  duration_ms BIGINT NULL,
  progress_pct INT NOT NULL DEFAULT 0,
  stdout_text MEDIUMTEXT NULL,
  stderr_text MEDIUMTEXT NULL,
  exit_code INT NULL,
  parsed_results MEDIUMTEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tool_runs_scan FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE RESTRICT
);
