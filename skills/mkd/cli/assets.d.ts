/**
 * Ambient declarations for Bun text imports
 * (import x from './f.css' with { type: 'text' }). The CLI inlines its two UI
 * assets as strings; this repo has no other .css/.js module imports, so the
 * wildcards are safe and keep tsc --noEmit clean for both run-from-source and
 * bun build --compile.
 */
declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.js' {
  const content: string;
  export default content;
}
