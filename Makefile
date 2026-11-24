.PHONY: build test typecheck browser pack check
build:
	cd templates && npm ci && npm run build
typecheck:
	cd templates && npm run typecheck
test:
	node scripts/catalog.mjs --check
	node scripts/test-apps.mjs unit
browser:
	node scripts/test-apps.mjs browser
pack:
	scripts/pack-apps.sh
check: typecheck test
