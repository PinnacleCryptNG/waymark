# Stage 1: export the speaker model to ONNX (torch is only needed here, never at runtime).
FROM python:3.12-slim AS export
WORKDIR /build
COPY backend/requirements-export.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements-export.txt
COPY backend/scripts scripts
RUN python scripts/export_onnx.py /models

# Stage 2: slim runtime (fits Render's free 512 MB instance with WAYMARK_WHISPER_MODEL=tiny.en).
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY --from=export /models/ecapa.onnx /models/mel_filters.npy /srv/backend/models/
ARG WHISPER_MODEL=tiny.en
RUN python -c "from faster_whisper import download_model; download_model('${WHISPER_MODEL}', cache_dir='/srv/backend/models/whisper')"
COPY backend backend
COPY app app
ENV WAYMARK_STATIC=/srv/app WAYMARK_DB=/data/waymark.db WAYMARK_MODEL_DIR=/srv/backend/models \
    WAYMARK_WHISPER_MODEL=${WHISPER_MODEL} MALLOC_ARENA_MAX=2 PYTHONUNBUFFERED=1
RUN mkdir -p /data
WORKDIR /srv/backend
CMD ["sh", "-c", "uvicorn waymark_server.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
