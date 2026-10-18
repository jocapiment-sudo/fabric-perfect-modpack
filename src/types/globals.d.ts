/**
 * Bedrock exposes a console-like logger to scripts, but it is not part of the
 * ECMAScript lib. Declaring the small surface we use keeps `tsc --strict`
 * happy without pulling in the DOM lib (which would wrongly allow `window`,
 * `document`, `fetch`, etc. inside a Bedrock script).
 */
declare const console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
