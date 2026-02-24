.PHONY: lint test-backend test dev-backend dev-frontend dev

lint:
	ruff check backend --select E9,F63,F7,F82

test-backend:
	pytest backend/tests/ -q

test: test-backend

dev-backend:
	cd backend && uvicorn api:app --reload

dev-frontend:
	cd frontend && npm run dev

dev:
	( cd backend && uvicorn api:app --reload ) & ( cd frontend && npm run dev )
