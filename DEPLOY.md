# Desplegar Retorno Maquinaria gratis (Render)

Recomendamos **[Render](https://render.com)** — gratis para proyectos de prueba, con HTTPS incluido.

## Limitaciones del plan gratis

| Qué | Detalle |
|-----|---------|
| Costo | $0 |
| HTTPS | Sí, automático |
| Inactividad | Duerme tras ~15 min sin visitas |
| Primer acceso | Tarda 30–60 seg en despertar |
| Base de datos | SQLite (se reinicia al redeployar) |
| Tarjeta | Render puede pedir tarjeta, no cobra en plan free |

Ideal para que conocidos **prueben** la plataforma. No es para producción real.

---

## Paso 1 — Subir código a GitHub

En tu Mac, en la carpeta del proyecto:

```bash
cd ~/Desktop/retorno-maquinaria
git init
git add .
git commit -m "Retorno Maquinaria — plataforma de transporte"
```

Crea un repo en GitHub: https://github.com/new  
Nombre sugerido: `retorno-maquinaria` (público o privado)

```bash
git remote add origin https://github.com/TU_USUARIO/retorno-maquinaria.git
git branch -M main
git push -u origin main
```

---

## Paso 2 — Crear servicio en Render

1. Entra a **https://render.com** y regístrate (puedes usar cuenta de GitHub).
2. Click **New +** → **Web Service**.
3. Conecta tu repo `retorno-maquinaria`.
4. Configuración:

| Campo | Valor |
|-------|-------|
| Name | `retorno-maquinaria` |
| Region | Oregon (US West) |
| Branch | `main` |
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

5. En **Environment Variables**, agrega:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | (genera una clave larga aleatoria) |
| `ADMIN_PASSWORD` | (elige una contraseña segura para admin) |

6. Click **Create Web Service** y espera 3–5 minutos.

---

## Paso 3 — Compartir con conocidos

Tu URL será algo como:

```
https://retorno-maquinaria.onrender.com
```

| Sección | URL |
|---------|-----|
| Sitio | `https://retorno-maquinaria.onrender.com/` |
| App login | `https://retorno-maquinaria.onrender.com/app/` |
| Admin | `https://retorno-maquinaria.onrender.com/admin/` |

### Usuarios de prueba

| Rol | Email | Password |
|-----|-------|----------|
| Cliente | `cliente@prueba.cl` | `prueba123` |
| Transportista | `transportista@prueba.cl` | `prueba123` |
| Admin | `admin@retorno.cl` | la que pusiste en `ADMIN_PASSWORD` |

---

## Alternativas gratuitas

| Plataforma | Gratis | Notas |
|------------|--------|-------|
| **[Render](https://render.com)** | Sí | Recomendado. Duerme si no hay tráfico. |
| **[Koyeb](https://koyeb.com)** | Sí | No duerme, 1 servicio gratis. |
| **[Railway](https://railway.app)** | Trial $5 | Luego de pago (~$5/mes mínimo). |
| **[Fly.io](https://fly.io)** | No (nuevas cuentas) | Solo pago. |

---

## Correos en producción

Para que lleguen emails reales al recibir ofertas, agrega en Render → Environment:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-correo@gmail.com
SMTP_PASS=contraseña-de-aplicacion
SMTP_FROM=Retorno Maquinaria <tu-correo@gmail.com>
```

Sin SMTP, las ofertas funcionan igual pero el correo solo aparece en los logs de Render.

---

## Dominio propio (opcional)

En Render → Settings → Custom Domains puedes agregar `retorno.cl` si tienes el dominio comprado.
