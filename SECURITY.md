# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| main    | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Report via GitHub private vulnerability reporting:
https://github.com/ktmage/opencode-gui/security/advisories/new

Expect a response within 72 hours. Please include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Any potential mitigations you've identified

## Scope

This policy covers:
- The application code and its dependencies
- API key handling and configuration management
- CI/CD pipeline security
- Dependency supply chain (pnpm/npm)
- VS Code extension security (webview ↔ host message protocol)

## Accepted Risks

| Date       | Finding                       | Severity | Rationale                                                                                         |
|------------|-------------------------------|----------|---------------------------------------------------------------------------------------------------|
| 2026-06-12 | (none recorded)               | —        | Audit at 2026-06-12 cleared 1 CRIT + 10 HIGH + 21 MOD to 0/0/0 across 530 packages. See SECURITY audit trail. |

## Audit Trail

Security audits are recorded in `scripts/security/last-audit.json`.
Latest audit: **2026-06-12** (workspace + changed files, mode: all) — 0 findings, 0 CVEs.
Threat-monitor risk assessments: `plans/security/risk_assessment-*.md`.
