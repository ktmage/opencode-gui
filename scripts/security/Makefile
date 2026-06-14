# Security audit Makefile (Node.js pnpm monorepo)
# Usage: make -f scripts/security/Makefile <target>
# Installed by: security-audit skill

.PHONY: audit-secrets audit-code audit-deps audit-all pre-commit-install

audit-secrets:
	@echo "=== SECRET SCAN (Gitleaks) ==="
	@mkdir -p scripts/security
	@gitleaks detect --source . -v --no-git --report-format json --report-path scripts/security/gitleaks-report.json 2>/dev/null; \
	EXIT=$$?; \
	if [ $$EXIT -eq 1 ]; then \
		echo "[FAIL] Secrets found — see scripts/security/gitleaks-report.json"; \
		exit 1; \
	elif [ $$EXIT -eq 0 ]; then \
		echo "[PASS] No secrets detected"; \
	else \
		echo "[ERROR] Gitleaks failed with exit code $$EXIT"; \
		exit $$EXIT; \
	fi

audit-code:
	@echo "=== SAST (Semgrep) ==="
	@mkdir -p scripts/security
	-semgrep scan --config p/javascript --config p/typescript --config p/react --config p/secrets --metrics=off --json -o scripts/security/semgrep-report.json
	@echo "[DONE] Report: scripts/security/semgrep-report.json"

audit-deps:
	@echo "=== DEPENDENCY AUDIT (pnpm) ==="
	@mkdir -p scripts/security
	-pnpm audit --json > scripts/security/pnpm-audit-report.json 2>/dev/null; \
	EXIT=$$?; \
	if [ $$EXIT -eq 0 ]; then \
		echo "[PASS] No vulnerabilities found"; \
	else \
		echo "[WARN] Vulnerabilities reported — see scripts/security/pnpm-audit-report.json"; \
		node -e "const d=require('./scripts/security/pnpm-audit-report.json');console.log(JSON.stringify(d.metadata.vulnerabilities,null,2));"; \
	fi

audit-all: audit-secrets audit-code audit-deps
	@echo ""
	@echo "=== AUDIT COMPLETE ==="
	@echo "Reports: scripts/security/"

pre-commit-install:
	@echo "=== Installing pre-commit hooks ==="
	@pre-commit install
	@pre-commit run --all-files
