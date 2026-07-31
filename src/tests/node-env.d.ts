/**
 * Minimal ambient declarations for the Node APIs used by tests that inspect the
 * repository's own files.
 *
 * `tsconfig.json` deliberately omits `@types/node`: the game source never
 * touches Node, and pulling the whole package in would let Node globals leak
 * into browser code where they would typecheck but fail at runtime. Declaring
 * only the few functions the tests actually call keeps that boundary intact
 * without adding a dependency.
 */

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { size: number };
  export function readFileSync(path: string, encoding: 'utf-8'): string;
  const fs: {
    existsSync: typeof existsSync;
    readdirSync: typeof readdirSync;
    statSync: typeof statSync;
    readFileSync: typeof readFileSync;
  };
  export default fs;
}

declare module 'node:path' {
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  const path: { resolve: typeof resolve; join: typeof join };
  export default path;
}

/** Only `cwd()` is used, to locate the repository root from a test. */
declare const process: { cwd(): string };
