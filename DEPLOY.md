# Deploy de GESCOM — Vercel (frontend) + Render (backend) + Neon (DB)

## 1. Repositorio en GitHub

```bash
cd C:\Users\Agus\Desktop\gescom
git init
git add .
git commit -m "GESCOM v1.0"
```

Crear un repo **privado** en GitHub (ej. `gescom`) y subirlo:

```bash
git remote add origin https://github.com/TU_USUARIO/gescom.git
git branch -M main
git push -u origin main
```

Verificar antes del push que `git status` NO liste `backend/.env` (está en `.gitignore`).

## 2. Base de datos — Neon

1. Crear cuenta en [neon.tech](https://neon.tech) (plan Free) y un proyecto `gescom` (región AWS São Paulo, la más cercana).
2. Copiar la **connection string** (botón "Connect", formato `postgresql://...@...neon.tech/neondb?sslmode=require`).
3. Aplicar las migraciones y crear el usuario desde tu PC:

```powershell
cd C:\Users\Agus\Desktop\gescom\backend
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = "postgresql://...connection string de Neon..."
alembic upgrade head
python -m scripts.crear_usuario   # crear el usuario ADMIN
```

## 3. Backend — Render

1. Crear cuenta en [render.com](https://render.com) con GitHub.
2. New → **Blueprint** → elegir el repo `gescom`. Render lee `render.yaml` y propone el servicio `gescom-api`.
3. Completar las env vars marcadas como manuales:
   - `DATABASE_URL`: connection string de Neon.
   - `SECRET_KEY`: generar con `python -c "import secrets; print(secrets.token_urlsafe(64))"`.
   - `CORS_ORIGINS`: la URL del frontend (paso 4; se puede volver a editar después).
4. Deploy. Verificar `https://gescom-api.onrender.com/health` → `{"status":"ok"}`.

## 4. Frontend — Vercel

1. Crear cuenta en [vercel.com](https://vercel.com) con GitHub → Add New Project → repo `gescom`.
2. **Root Directory**: `frontend` (framework: Vite, se detecta solo).
3. Env var: `VITE_API_URL` = URL del backend en Render (sin barra final), ej. `https://gescom-api.onrender.com`.
4. Deploy. Copiar la URL resultante (ej. `https://gescom.vercel.app`) y ponerla en `CORS_ORIGINS` en Render → redeploy del backend.

## 5. Verificación final

- Login en la URL de Vercel (el primer request tras inactividad tarda ~1 min: Render "despierta" el servicio free).
- Crear una reserva de prueba, descargar el PDF, revisar el dashboard.
- Confirmar que `https://gescom-api.onrender.com/docs` devuelve 404 (`DOCS_ENABLED=false`).

## Notas de operación

- **Cold start**: el backend free de Render se duerme tras ~15 min sin tráfico; el primer request lo despierta (~1 min). Neon se despierta solo en ~1 s.
- **Deploy continuo**: cada `git push` a `main` redeploya backend (Render) y frontend (Vercel) automáticamente.
- **Recuperar contraseña del ADMIN**: desde Render → servicio → Shell: `python -m scripts.cambiar_password` (o desde tu PC con `DATABASE_URL` de Neon).
- **Backups**: el plan free de Neon tiene point-in-time restore de 24 h. Para respaldos propios: `pg_dump` con la connection string.
