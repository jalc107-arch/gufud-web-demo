# GUFUD Web - piloto de sincronización para Cloudflare Pages

> **SOLO DATOS FICTICIOS.** No se autoriza cargar, almacenar o exponer datos institucionales, personales u operativos de la Policía Nacional. Se requiere autorización institucional, infraestructura privada y revisión de seguridad adicional para un servicio real.

## Estado del proyecto

- GitHub Pages (público): **`https://jalc107-arch.github.io/gufud-web-demo/`**. Mantiene el piloto estático anterior, sin sincronización.
- Versión conectada preparada: `app-web/index.html` y `functions/api/gufud.js`.
- La versión conectada **no está publicada ni probada en un Cloudflare Pages propio** mientras no exista el proyecto Pages y su D1 correspondiente.
- El Worker `gufud-web-demo-2026.jalc107.workers.dev` creado antes contiene un "Hello World" y no debe presentarse como aplicación terminada.
- No se modifican CampaClick, FuerzaMarket ni Supabase.

## Despliegue desde la cuenta autorizada Cloudflare

1. En **Workers & Pages**, crear un **Pages project** con integración a GitHub, acceso **únicamente** al repositorio `jalc107-arch/gufud-web-demo`. No autorizar todos los repositorios.
2. Configuración: rama **`main`**, root directory **`/`**, preset **None**, build command **vacío**, build output directory **`app-web`**.
3. Esperar despliegue en `*.pages.dev` y comprobar que la vista estática muestra el formulario de inicio de sesión. Todavía no estará operativa la base.
4. En el menú **D1 SQL Database**, crear una base de prueba exclusiva de GUFUD; seleccionar el plan gratuito si está disponible.
5. Desde el proyecto **Pages**: **Settings > Bindings > Add > D1 database**, variable **`GUFUD_DB`**, seleccionar la base creada. Configurar el entorno de producción y volver a desplegar. La API crea únicamente tablas propias y 20 registros de prueba al recibir la primera solicitud; no requiere ejecutar migraciones manuales.
6. En `/api/gufud`, una petición anónima debe devolver HTTP **401** con `Se requiere iniciar sesión`, no 404/503. Si devuelve 503, comprobar el binding D1. Si devuelve 404, la función no está compilada: comprobar la ubicación raíz `functions/api/gufud.js` y el directorio de salida.
7. Las claves de prueba son códigos de alta entropía, **no incluidas en el repositorio**. La aplicación compara sus hashes SHA-256. Para restablecerlas, reemplazar `ADMIN_HASH` y `J1_HASH` con hashes SHA-256 de nuevas claves aleatorias y redeplegar. No reutilizar contraseñas personales ni credenciales institucionales.

## Pruebas de aceptación obligatorias en dos sesiones diferentes

1. Una sesión anónima debe recibir HTTP 401 en GET `/api/gufud`.
2. J1 puede iniciar sesión con su clave; consulta dos fechas ficticias, el parte publicado y el personal.
3. J1 intenta publicar: el servidor debe responder HTTP 403.
4. Administrador modifica un punto ficticio y guarda borrador: su versión incrementa; J1 sigue viendo la revisión anterior incluso al recargar.
5. Administrador pulsa publicar: una sesión J1 independiente observa la nueva versión en el siguiente refresco o antes de 20 s.
6. Reimportar o guardar el mismo cambio no debe crear revisión duplicada.
7. Registrar "Ministerio" y "Aeropuerto" cuenta como dos servicios diferentes; registrar "Ministerio" una segunda vez no crea duplicado.
8. Crear nueva fecha de servicio en administrador: debe quedar sin publicar inicialmente y no aparecer en J1.
9. Salir invalida la sesión (cookie HttpOnly, Secure, SameSite=Strict).
10. Ningún Excel real, nombre de funcionario real o ubicación operativa real debe guardarse en esta demostración.

## Límites de seguridad explícitos

- Las claves de rol son **demostrativas**, no un sustituto de gestión de usuarios, MFA, revocación institucional, auditoría de identidades, autorización formal o controles de protección de datos.
- Ni la web estática ni este repositorio público deben guardar datos reales.
- Sin base D1 conectada, la interfaz debe indicar que la sincronización **no está configurada**, no simular publicación.
- GitHub Pages no ejecuta las Functions de Cloudflare. La sincronización solo funciona en el despliegue de Cloudflare Pages con binding D1.
- `app-web/_routes.json` restringe las invocaciones de Functions a `/api/*`.
