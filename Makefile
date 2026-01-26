.PHONY: dev dev-bot dev-test build-package release help

help:
	@echo "Available commands:"
	@echo ""
	@echo "Development:"
	@echo "  make dev
	@echo "Build & Release:"
	@echo "  make build-package          - Create jira-bot.zip for Microsoft Teams"

dev:
	@echo "Starting bot server in background..."
	@LOCAL_DEV=true node src/app.mjs &
	@sleep 2
	@echo "Starting Teams App Test Tool..."
	./node_modules/.bin/teamsapptester

build-package:
	@echo "Building jira-bot.zip for Microsoft Teams..."
	@rm -f jira-bot.zip
	@cd appPackage && zip -r ../jira-bot.zip manifest.json icon.png outline.png
	@echo "Created jira-bot.zip"
	@ls -la jira-bot.zip
