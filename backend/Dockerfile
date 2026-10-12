# Build from the repository root: docker build -f backend/Dockerfile .
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r backend/requirements.txt
COPY backend backend
COPY app app
ENV WAYMARK_STATIC=/srv/app WAYMARK_DB=/data/waymark.db WAYMARK_MODEL_DIR=/srv/backend/models
WORKDIR /srv/backend
CMD ["sh", "-c", "uvicorn waymark_server.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
