# GUFUD Web · Cuentas individuales de demostración (rama de evaluación)

**Estado:** implementación en rama separada. La aplicación principal (`main`) continúa con el acceso previo y los datos ficticios; esta rama **no está habilitada para información institucional ni uso real**.

## Alcance
- Usuarios ficticios con nombres `demo_...` y roles `admin` o `j1`.
- Invitaciones con token aleatorio de 64 caracteres hexadecimales, almacenado solo como SHA-256; una sola activación, 60 minutos de vigencia.
- Contraseñas individuales **no guardadas en texto claro**: PBKDF2-HMAC-SHA256, 210.000 iteraciones, sal aleatoria por cuenta y comparación de huellas sin salida anticipada.
- Sesiones individuales mediante cookies `HttpOnly; Secure; SameSite=Strict`, almacenadas como hash; J1 solo puede consultar.
- Administración de cuentas activas/inactivas, revocación inmediata de sus sesiones y auditoría por identidad ficticia.
- Controles de transición: para deshabilitar las claves compartidas se exigen **dos Administradores individuales activos, cada uno con sesión vigente, y un J1 individual con sesión vigente**. El Administrador que efectúa el cambio debe confirmar su contraseña; entonces se revocan las sesiones compartidas. La reversión sigue reservada al Administrador individual.
- Se mantienen importación Excel **ficticia**, vista previa, versiones y publicación aprobada para J1.

## Uso previsto (solo tras publicar explícitamente esta rama en un entorno de pruebas)
1. Ingresar temporalmente mediante Administrador antiguo del piloto.
2. Crear y activar **dos cuentas Administrador individuales distintas**, ambas con contraseñas conocidas y sesiones abiertas en navegadores separados. Mantener la segunda como vía de recuperación.
3. Crear y activar una cuenta J1 individual. Iniciar sesión como J1 en otro dispositivo y comprobar lectura exclusiva de las revisiones aprobadas.
4. Validar auditoría, revocación, contraseñas incorrectas y bloqueo; comprobar que las sesiones de ambos Administradores siguen vigentes.
5. Consultar las cuentas para revisar el indicador de preparación. El sistema impedirá el corte si falta una sesión Administrador o J1.
6. El Administrador principal confirma su contraseña actual y deshabilita las claves compartidas **voluntariamente**. El sistema revoca las sesiones antiguas; no cambia el Dashboard publicado por sí mismo.
7. Ensayar recuperación con la segunda cuenta: crear una nueva invitación de Administrador y desactivar una cuenta inaccesible. Confirmar que esta operación no requiere las claves compartidas.

## Recuperación y riesgos residuales

- Si una cuenta Administrador se pierde, el **otro Administrador activo** puede emitir una invitación para crear una cuenta de reemplazo y desactivar la cuenta afectada, con auditoría.
- Si se pierden las credenciales de **ambos** Administradores después del corte, el piloto **no tiene recuperación automática**. Se necesitará un procedimiento de recuperación administrativo fuera de línea, autorizado y probado sobre una copia aislada de D1, antes de pensar en uso real. No se deben manipular filas de producción directamente.
- Dos usuarios `demo_...` no prueban que sean dos personas distintas ni sustituyen identidad institucional/MFA. La exigencia de dos sesiones es un control contra errores de migración, no una garantía de identidad.
- La operación de corte debe ensayarse en un D1 de **staging separado** con copia estructural y datos ficticios; nunca sobre la D1 principal ni por simple aprobación de una batería de pruebas locales.

## Antes de cualquier uso real
Se requiere autorización institucional para el tratamiento de programación operativa, control de identidad empresarial, almacenamiento y ubicación de datos, MFA, rotación y recuperación de credenciales, pruebas de penetración, controles de auditoría y respaldo. El modelo de usuario y contraseña del piloto **no equivale a identidad institucional verificada**.

## Pruebas
`GUFUD - validacion de piloto ficticio` ejecuta:
- Comprobaciones estáticas de interfaz, roles y rutas.
- Integración API sobre SQLite temporal sin tocar la D1 desplegada.
- Registro por invitación, restricciones de contraseña, control de duplicados.
- Validación de permisos admin/J1, revocación, desactivación y auditoría.
- Desactivación reversible de acceso compartido.
- Bloqueo de corte sin dos Administradores y un J1 individuales autenticados, confirmación de contraseña y recuperación por Administrador suplente.
- Generación/lectura de Excel sintético (incluido ZIP DEFLATE).

No implementar en producción sin revisar la rama, probar el acceso desde dos dispositivos y obtener autorización para los datos que se pretendan procesar.
