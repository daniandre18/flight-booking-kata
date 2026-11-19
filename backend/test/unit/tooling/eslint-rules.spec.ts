import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Verifica que las reglas de calidad y seguridad de ESLint (constitución 1.1.0) están activas. */
const repoRoot = resolve(__dirname, '../../../..');
const eslintBin = join(repoRoot, 'node_modules/.bin/eslint');

interface LintMessage {
  ruleId: string | null;
}

function lintRuleIds(code: string, virtualPath: string): string[] {
  const result = spawnSync(
    eslintBin,
    ['--stdin', '--stdin-filename', virtualPath, '--format', 'json'],
    { cwd: repoRoot, input: code, encoding: 'utf8' },
  );
  const [report] = JSON.parse(result.stdout) as { messages: LintMessage[] }[];
  return (report?.messages ?? []).map((message) => message.ruleId ?? '');
}

const branchy = `export function grade(n: number): string {
${Array.from({ length: 11 }, (_, i) => `  if (n === ${i}) return '${i}';`).join('\n')}
  return 'x';
}
`;
const longFunction = `export function long(): number {
  let total = 0;
${Array.from({ length: 41 }, (_, i) => `  total += ${i};`).join('\n')}
  return total;
}
`;

describe('reglas de ESLint de la constitución', () => {
  it('limita la complejidad ciclomática a 10', () => {
    expect(lintRuleIds(branchy, 'backend/src/fake.ts')).toContain('complexity');
  });

  it('limita las funciones de producción a 40 líneas', () => {
    expect(lintRuleIds(longFunction, 'backend/src/fake.ts')).toContain('max-lines-per-function');
  });

  it('exime a las pruebas solo de max-lines-per-function', () => {
    const ids = lintRuleIds(longFunction, 'backend/test/unit/fake.spec.ts');
    expect(ids).not.toContain('max-lines-per-function');
    expect(lintRuleIds(branchy, 'backend/test/unit/fake.spec.ts')).toContain('complexity');
  });

  it('limita a 4 los parámetros', () => {
    const code =
      'export function f(a: number, b: number, c: number, d: number, e: number): number { return a + b + c + d + e; }\n';
    expect(lintRuleIds(code, 'backend/src/fake.ts')).toContain('@typescript-eslint/max-params');
  });

  it('prohíbe any y console.log', () => {
    const code = 'export function f(x: any): void { console.log(x); }\n';
    const ids = lintRuleIds(code, 'backend/src/fake.ts');
    expect(ids).toEqual(
      expect.arrayContaining(['@typescript-eslint/no-explicit-any', 'no-console']),
    );
  });

  it('prohíbe SQL crudo inseguro de Prisma', () => {
    const code =
      'export async function f(db: { $queryRawUnsafe(q: string): Promise<unknown> }): Promise<unknown> { return db.$queryRawUnsafe("select 1"); }\n';
    expect(lintRuleIds(code, 'backend/src/fake.ts')).toContain('no-restricted-properties');
  });

  it('prohíbe innerHTML y bypassSecurityTrust en el frontend', () => {
    const inner =
      'export function f(el: HTMLElement, html: string): void { el.innerHTML = html; }\n';
    const bypass =
      'export function f(s: { bypassSecurityTrustHtml(v: string): unknown }): unknown { return s.bypassSecurityTrustHtml("x"); }\n';
    expect(lintRuleIds(inner, 'frontend/src/app/fake.ts')).toContain('no-restricted-properties');
    expect(lintRuleIds(bypass, 'frontend/src/app/fake.ts')).toContain('no-restricted-syntax');
  });
});

describe('verificación de plantillas', () => {
  const script = join(repoRoot, 'scripts/check-templates.mjs');

  it('falla si una plantilla usa [innerHTML]', () => {
    const dir = mkdtempSync(join(tmpdir(), 'templates-'));
    writeFileSync(join(dir, 'bad.component.html'), '<div [innerHTML]="html"></div>\n');
    const run = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('bad.component.html:1');
  });

  it('acepta las plantillas actuales del frontend', () => {
    expect(() =>
      execFileSync(process.execPath, [script, join(repoRoot, 'frontend/src')], { stdio: 'pipe' }),
    ).not.toThrow();
  });
});
