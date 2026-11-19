// Falla si alguna plantilla del frontend usa [innerHTML] o bypassSecurityTrust (principio X).
// Revisa los .html y también los .ts (plantillas en línea de los componentes), salvo las pruebas.
// Uso: node scripts/check-templates.mjs [directorio]  (por defecto frontend/src)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const FORBIDDEN = [/\[innerHTML\]/i, /bypassSecurityTrust/];
const root = resolve(process.argv[2] ?? 'frontend/src');

function listTemplates(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTemplates(path);
    const isTemplate =
      path.endsWith('.html') || (path.endsWith('.ts') && !path.endsWith('.spec.ts'));
    return isTemplate ? [path] : [];
  });
}

const violations = listTemplates(root).flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) =>
      FORBIDDEN.some((pattern) => pattern.test(line))
        ? [`${relative(process.cwd(), file)}:${index + 1}`]
        : [],
    ),
);

if (violations.length > 0) {
  console.error(`Plantillas con [innerHTML] o bypassSecurityTrust:\n${violations.join('\n')}`);
  process.exit(1);
}
console.log(`Plantillas verificadas: ${listTemplates(root).length}`);
