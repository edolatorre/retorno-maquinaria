# Retorno Maquinaria

Plataforma independiente para transporte de maquinaria pesada.
Clientes publican solicitudes, transportistas ofertan precio y fechas.

> Proyecto separado de Vecinos Seguros. Vive en su propia carpeta y corre en su propio puerto.

## Iniciar

```bash
cd ~/Desktop/retorno-maquinaria
cp .env.example .env
npm install
npm start
```

| URL | Descripción |
|-----|-------------|
| http://localhost:3001/ | Sitio marketing |
| http://localhost:3001/app/ | Login app |
| http://localhost:3001/admin/ | Panel administrador |

### Subdominio local (opcional)

Agrega a `/etc/hosts`:
```
127.0.0.1 app.localhost
```

Luego la app también responde en `http://app.localhost:3001/`

## Admin

- **URL:** http://localhost:3001/admin/
- **Email:** admin@retorno.cl
- **Password:** admin123

(Cambiar en `.env` con `ADMIN_EMAIL` y `ADMIN_PASSWORD`)

## Correo al recibir ofertas

Configura SMTP en `.env`. Sin SMTP, los correos se muestran en la consola del servidor.

## Producción

```
retorno.cl      → tu servidor
app.retorno.cl  → tu servidor (mismo Node.js, distinto Host)
```

Ver `nginx.example.conf` para configuración Nginx.
