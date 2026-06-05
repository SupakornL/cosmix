.PHONY: run worker migrate install

install:
	pip install -r requirements.txt

run:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

worker:
	celery -A app.tasks.celery_app worker --loglevel=info

migrate:
	alembic upgrade head

dev: 
	make run & make worker
