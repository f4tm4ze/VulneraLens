# VulneraLens: AI-Assisted Web Application Security Assessment Platform

VulneraLens is a web-based security assessment platform that integrates reconnaissance and scanning tools with AI-assisted analysis and a human verification workflow to produce evidence-backed security assessment reports for authorized web applications. 

## Features

* **Database Schema:** MySQL/MariaDB schema storing users, assessments, targets, scans, findings, assessor reviews, and AI logs.
* **Scope Enforcement:** `checkTargetScope` blocks any target outside the authorized list (`localhost`, `127.0.0.1`, `dvwa`).
* **Nmap + DNS Scanner:** Non-destructive port scanning and DNS lookup. Saves XML evidence and parses open ports/services into findings.
* **OWASP ZAP Scanner:** Authenticates to DVWA, runs spider + active scans, saves JSON alerts, and imports findings.
* **AI Assistant:** Redacts sensitive data before sending to the AI model. Generates plain-language explanations, suggested severity, confidence, and remediation.
* **Verification Workflow:** Assessors can confirm, reject, or mark findings as needing retest, with timestamps and IDs logged.
* **Dashboard & PDF Report:** DB-driven counts by severity and category. Exports PDF reports containing *only* confirmed findings.
* **Docker Compose:** Orchestrates MariaDB, DVWA, OWASP ZAP, Backend, and Frontend.

## Commands

```bash
# Initialize Database
cd backend && npm run db:init

# Test Database Connection
cd backend && npm run db:test

# Run Backend (Local)
cd backend && npm run dev

# Run Frontend (Local)
cd frontend && npm run dev

# Run Full Stack (Docker)
docker compose up --build
