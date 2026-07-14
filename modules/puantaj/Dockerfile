FROM node:22-alpine AS admin-ui
WORKDIR /src/web-admin
COPY web-admin/package.json web-admin/package-lock.json ./
RUN npm ci
COPY web-admin/ ./
RUN npx tsc -b && npx vite build

FROM node:22-alpine AS employee-ui
WORKDIR /src/web-employee
COPY web-employee/package.json web-employee/package-lock.json ./
RUN npm ci
COPY web-employee/ ./
RUN npx tsc -b && npx vite build

FROM node:22-alpine AS depo-ui
WORKDIR /src/web-depo
COPY web-depo/package.json web-depo/package-lock.json ./
RUN npm ci
COPY web-depo/ ./
RUN npx tsc -b && npx vite build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
RUN addgroup --system puantaj && adduser --system --ingroup puantaj puantaj
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY alembic.ini ./
COPY app ./app
COPY --from=admin-ui /src/web-admin/dist ./app/static/admin
COPY --from=employee-ui /src/web-employee/dist ./app/static/employee
COPY --from=depo-ui /src/web-depo/dist ./app/static/depo
RUN printf 'portal-suite\n' > ./app/static/build_version.txt && chown -R puantaj:puantaj /app

USER puantaj
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=${FORWARDED_ALLOW_IPS:-127.0.0.1}"]
