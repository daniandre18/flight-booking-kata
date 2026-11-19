export default async function globalTeardown(): Promise<void> {
  await globalThis.__E2E_POSTGRES__?.stop();
}
