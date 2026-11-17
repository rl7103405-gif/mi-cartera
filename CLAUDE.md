# Mi Cartera / Fundview: la base de la app

PWA de finanzas personales. Este repositorio es **público**: aquí va solo lo que cualquiera puede leer sin riesgo. El contexto de trabajo completo (historia, decisiones, cómo se prueba y se publica) vive en `CLAUDE.local.md`, que git ignora y no sale de la computadora de trabajo. **Si estás trabajando en este repo, léelo primero.**

## Stack

- HTML, CSS y JS puro en un solo `index.html`, sin build ni dependencias. GitHub Pages publica la rama `main` tal cual.
- Firebase Firestore y Firebase Authentication. La llave web de Firebase que trae `index.html` es pública por diseño: lo que protege los datos son las reglas de Firestore, que no viven en este repo.
- `sw.js` (service worker, stale-while-revalidate), `manifest.json` e íconos.

## Reglas para trabajar aquí

1. **Un solo commit por tanda de cambios** a `main`: varios seguidos atascan la cola de GitHub Pages.
2. **Nada de seguridad en este repo:** ni reglas, ni cómo se valida cada cosa, ni qué está encendido o apagado en el servidor, ni nombres de cuentas de administración. Eso va en `CLAUDE.local.md` o fuera del repo. Lo que se sube a un repo público queda en su historial aunque se borre después.
3. `.gitignore` decide qué entra: la app y sus pruebas. Nada de scripts de trabajo, capturas ni volcados.
4. Fechas `AAAA-MM-DD` con `parseFechaLocal()` (nunca como UTC) y el interés compuesto de las cajitas con `calcCompoundAt()`.
5. Sin `prompt()` ni `confirm()`: los borrados se confirman con `confirmarDeslizando`.
