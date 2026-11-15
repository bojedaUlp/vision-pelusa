# Puesta en marcha — Supabase nuevo + Cloudflare R2

Visión Pelusa usa **Supabase solo para base de datos y autenticación** y **Cloudflare R2** para las
fotos. Esta guía arranca con todo vacío: sin álbumes, fotos ni compras anteriores.

| Recurso | Para qué |
|---|---|
| `supabase/schema.sql` | Esquema completo: tablas, RLS, funciones, triggers e índices. Se ejecuta **una sola vez** en el proyecto nuevo |
| R2 `vision-pelusa-originals` | Originales. **Privado**: solo lo lee el Worker, después de validar una compra |
| R2 `vision-pelusa-media` | Previews, miniaturas y portadas, todas con marca de agua. Público por dominio propio |
| `supabase/migrations/2026100x_*.sql` | Historial del proyecto anterior. **No ejecutar** en el proyecto nuevo |

## 1. Supabase (proyecto nuevo, plan Free)

1. Creá el proyecto en una organización **sin facturas pendientes ni restricciones**. La organización
   anterior quedó restringida por exceder el plan gratuito; si la del proyecto viejo muestra avisos de
   facturación, usá una organización nueva.
2. **SQL Editor** → pegá el contenido de `supabase/schema.sql` → **Run**. Tiene que terminar sin errores.
3. **Authentication → Sign In / Providers → Email**: desactivá *Allow new users to sign up*. Solo el
   administrador tiene cuenta; los compradores no necesitan una.
4. **Authentication → Users → Add user → Create new user**: cargá el email y una contraseña fuerte del
   administrador, con *Auto Confirm User* marcado.
5. **SQL Editor**:
   ```sql
   update public.profiles set is_admin = true where email = 'EMAIL-DEL-ADMIN';
   select email, is_admin from public.profiles;  -- verificar: is_admin = true
   ```
6. **Project Settings → API**: copiá la *Project URL*, la clave *anon/publishable* y la clave
   *service_role/secret*. La service_role **nunca** se publica ni se carga como `NEXT_PUBLIC_`.

## 2. Cloudflare R2 (en la cuenta dueña de visionpelusa.com)

1. **R2 Object Storage**: activá R2. Cloudflare pide un medio de pago aunque se use solo la franquicia
   gratuita (10 GB-mes, 1 M operaciones clase A y 10 M clase B por mes).
2. Creá los buckets `vision-pelusa-originals` y `vision-pelusa-media`.
3. En `vision-pelusa-originals` **no** habilites acceso público, ni dominio propio, ni `r2.dev`.
4. En `vision-pelusa-media` → **Settings → Custom Domains** → `media.visionpelusa.com`. Así las imágenes
   públicas salen por la CDN sin consumir requests del Worker. No habilites `r2.dev`.
5. Opcional, recomendado: en **Billing → Notifications**, creá una alerta de uso.

## 3. Worker `vision-pelusa` (Workers & Pages → Settings)

Los bindings `ORIGINALS_BUCKET` y `MEDIA_BUCKET` y la variable `STORAGE_BUDGET_BYTES` (8 GB) ya están en
`wrangler.jsonc`.

**Variables de build** (*Build → Variables*). Se incrustan en el código durante el build:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL del Supabase nuevo |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon/publishable |
| `NEXT_PUBLIC_APP_URL` | `https://visionpelusa.com` |
| `NEXT_PUBLIC_MEDIA_URL` | `https://media.visionpelusa.com` |

**Secretos de runtime** (*Variables and Secrets*, tipo **Secret**):

| Variable | Valor |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role/secret |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access token de producción de Mercado Pago |

Restricciones:

- **No** definas `MERCADO_PAGO_API_URL`: existe solo para las pruebas locales.
- `MP_PREFERENCE_EXPIRATION_HOURS` queda **sin definir** hasta que se apruebe el vencimiento de las
  preferencias de pago (ver "Pagos pendientes").

## 4. Mercado Pago

La URL de notificación (`https://visionpelusa.com/api/payments/webhook`) viaja en cada preferencia. No
hay que configurar nada en el panel, pero conviene revisar que el access token sea el de producción.

## 5. Desplegar y verificar

Mergeá a `main` y hacé push: Workers Builds compila y despliega. Después verificá:

1. `/admin`: el administrador inicia sesión y se ve el indicador "Almacenamiento".
2. Crear una galería de prueba en **Borrador** y subir 2 fotos. Las miniaturas cargan desde
   `media.visionpelusa.com`.
3. En una ventana privada, la galería en borrador **no** se ve. Publicarla y comprobar que sí aparece.
4. Hacer una compra real de bajo valor y descargar el original desde "Mis fotos".
5. Eliminar la galería de prueba. La foto comprada queda protegida mientras su descarga esté vigente.

## Ciclo semanal y pagos pendientes

- Cada compra da **7 días** de descarga. Pasado ese plazo, las fotos vendidas se pueden eliminar; la
  compra queda en el historial.
- Una foto con un pago **pendiente o rechazado** sigue protegida, porque Mercado Pago permite reintentar
  el pago con la misma preferencia. Esa protección se libera solo cuando la compra nunca llegó a Mercado
  Pago, o cuando su preferencia venció y Mercado Pago confirma que no hay pagos aprobados ni en proceso.
- Sin vencimiento de preferencias (`MP_PREFERENCE_EXPIRATION_HOURS`), un checkout abandonado protege sus
  fotos por tiempo indefinido. **Recomendación:** 72 h.

## Pruebas

```bash
npm test                 # unitarias (Vitest)
npm run test:db          # esquema en un Postgres descartable (Docker)
npm run test:e2e         # E2E con Supabase local + R2 local + Mercado Pago simulado
                         # requiere E2E_ENV_FILE (ver playwright.config.ts)
```
