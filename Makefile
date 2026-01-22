.PHONY: dev dev-bot dev-test build-package release help

help:
	@echo "Available commands:"
	@echo ""
	@echo "Development:"
	@echo "  make dev
	@echo "Build & Release:"
	@echo "  make build-package          - Create appPackage.zip for Microsoft Teams"

dev:
	@echo "Starting bot server in background..."
	@LOCAL_DEV=true node src/app.mjs &
	@sleep 2
	@echo "Starting Teams App Test Tool..."
	./node_modules/.bin/teamsapptester

build-package:
	@echo "Building appPackage.zip..."
	@cd appPackage && zip -r ../appPackage.zip manifest.json color.png outline.png
	@echo "Created appPackage.zip"
	@ls -la appPackage.zip
