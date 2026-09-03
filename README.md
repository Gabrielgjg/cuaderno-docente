# Cuaderno Docente — guía de instalación

App web (PWA) para asistencia, calificaciones por encuadre, diario docente e
incidencias, respaldada en un Google Sheet. Funciona sin conexión y sincroniza
cuando vuelve el internet. Sin login (uso personal, un solo usuario).

## Parte 1 — Backend (Google Sheets + Apps Script)

1. Crea un Google Sheet nuevo (vacío).
2. Ve a **Extensiones > Apps Script**.
3. Borra el contenido de `Code.gs` y pega el contenido de **`Codigo.gs`** (de este paquete).
4. Guarda (ícono de disquete o Ctrl+S).
5. En el selector de funciones (junto al botón ▶ Ejecutar), elige **`setup`** y dale **Ejecutar**.
   - La primera vez te pedirá autorizar permisos: acepta (es tu propio script, sobre tu propio Sheet).
   - Esto crea las 7 pestañas: Grupos, Alumnos, Asistencia, Encuadres, Calificaciones, Incidencias, Diario.
6. Click en **Implementar > Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo** (tu cuenta).
   - Quién tiene acceso: **Cualquier usuario**.
   - Implementar, y **copia la URL que termina en `/exec`**. Esa es tu API.

> Cada vez que edites `Codigo.gs`, necesitas **Implementar > Administrar implementaciones > editar (lápiz) > Nueva versión** para que los cambios surtan efecto en la URL ya publicada.

## Parte 2 — La app web (PWA)

Archivos: `index.html`, `app.js`, `admin.js`, `manifest.json`, `sw.js`,
`icon-192.png`, `icon-512.png`.

### Dónde alojarla
Necesitas que estos archivos vivan en una URL con **https** (los Service
Workers y la cámara no funcionan en `file://`). Opciones sencillas y gratis:
- **GitHub Pages** (recomendado, gratis, permanente)
- Un hosting estático que ya uses (Netlify, Vercel, Firebase Hosting)

Sube los 7 archivos tal cual, manteniendo los nombres exactos.

### Conectar la app con tu Sheet
No necesitas editar código para esto. Abre la app en el navegador:
**Admin > Conexión** → pega ahí la URL `/exec` que copiaste en la Parte 1 →
**Guardar y probar conexión**. Queda guardada en el dispositivo.

(Alternativa: puedes editar directamente `CONFIG.API_URL` al inicio de
`app.js` antes de subir los archivos, si prefieres dejarla precargada.)

## Parte 3 — Instalar como app

**En celular (Android/Chrome):** abre la URL → menú (⋮) → **Instalar app** /
**Agregar a pantalla de inicio**.

**En iPhone (Safari):** abre la URL → botón compartir → **Agregar a
pantalla de inicio**.

**En PC (Chrome/Edge):** abre la URL → ícono de instalación en la barra de
direcciones (o menú ⋮ > Instalar Cuaderno Docente).

Una vez instalada, abre y cierra sesión de wifi normalmente: el pase de
lista, calificaciones, diario e incidencias se guardan en el dispositivo
aunque no haya señal, y se sincronizan solos al reconectar (el punto de
arriba a la derecha indica el estado: verde = todo sincronizado, ámbar =
pendientes, rojo = sin conexión).

## Primeros pasos dentro de la app

1. **Admin > Grupos** — da de alta tus grupos (escuela, grado, grupo, asignatura).
2. **Admin > Alumnos** — importa por CSV/Excel o por cámara (OCR), o agrégalos manualmente. Todo lo que reconoce el OCR pasa por una pantalla de revisión antes de guardarse.
3. **Admin > Encuadres** — define los rubros y porcentajes por asignatura y trimestre (deben sumar 100%).
4. Ya puedes usar **Asistencia**, **Calificaciones**, **Diario** desde la barra inferior, seleccionando grupo (y fecha/trimestre) arriba.

## Notas técnicas
- Comunicación app↔Sheet vía **JSONP** (mismo patrón que tu tracker de gamificación), para evitar los bloqueos de CORS de los Web Apps de Apps Script.
- El historial de un alumno (asistencia, calificaciones, incidencias) está ligado a su `id`, no a su grupo — por eso migrar de grupo o dar de baja no pierde ni desvincula nada.
- El OCR corre en el propio navegador (Tesseract.js), no requiere API key ni facturación de Google Cloud Vision.
