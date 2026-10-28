# GUFUD Web · Cuentas individuales de demostración (rama de evaluación)

**Estado:** implementación en rama separada. La aplicación principal (`main`) continúa con el acceso previo y los datos ficticios; esta rama **no está habilitada para información institucional ni uso real**.

## Alcance
- Usuarios ficticios con nombres `demo_...` y roles `admin` o `j1`.
- Invitaciones con token aleatorio de 64 caracteres hexadecimales, almacenado solo como SHA-256; una sola activación, 60 minutos de vigencia.
- Contraseñas individuales **no guardadas en texto claro**: PBKDF2-HMAC-SHA256, 210.000 iteraciones, sal aleatoria por cuenta y comparación de huellas sin salida anticipada.
- Sesiones individuales mediante cookies `HttpOnly; Secure; SameSite=Strict`, almacenadas como hash; J1 solo puede consultar.
- Administración de cuentas activas/inactivas, revocación inmediata de sus sesiones y auditoría por identidad ficticia.
- Controles de transición: una cuenta Administrador individual activa puede deshabilitar las claves compartidas y sus sesiones existentes, con reversión exclusiva del Administrador individual.
- Se mantienen importación Excel **ficticia**, vista previa, versiones y publicación aprobada para J1.

## Uso previsto (solo tras publicar explícitamente esta rama en un entorno de pruebas)
1. Ingresar temporalmente mediante Administrador antiguo del piloto.
2. Crear una invitación de Administrador individual y activarla como usuario ficticio desde otro navegador.
3. Acceder con el nuevo usuario Administrador y crear una invitación J1 individual.
4. Confirmar en dos navegadores que J1 no puede importar ni publicar y solo ve revisiones aprobadas.
5. Validar auditoría, revocación, contraseñas incorrectas y bloqueo.
6. Deshabilitar claves compartidas **solo después** de comprobar las dos cuentas. No será automático.

## Antes de cualquier uso real
Se requiere autorización institucional para el tratamiento de programación operativa, control de identidad empresarial, almacenamiento y ubicación de datos, MFA, rotación y recuperación de credenciales, pruebas de penetración, controles de auditoría y respaldo. El modelo de usuario y contraseña del piloto **no equivale a identidad institucional verificada**.

## Pruebas
`GUFUD - validacion de piloto ficticio` ejecuta:
- Comprobaciones estáticas de interfaz, roles y rutas.
- Integración API sobre SQLite temporal sin tocar la D1 desplegada.
- Registro por invitación, restricciones de contraseña, control de duplicados.
- Validación de permisos admin/J1, revocación, desactivación y auditoría.
- Desactivación reversible de acceso compartido.
- Generación/lectura de Excel sintético (incluido ZIP DEFLATE).

No implementar en producción sin revisar la rama, probar el acceso desde dos dispositivos y obtener autorización para los datos que se pretendan procesar.
