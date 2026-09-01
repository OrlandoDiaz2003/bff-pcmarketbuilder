import { appendFile } from 'node:fs/promises';
import { config } from '../config.js';

let writeQueue: Promise<void> = Promise.resolve();

function writeToFile(line: string): void {
  if (!config.logFile) return;
  writeQueue = writeQueue
    .then(() => appendFile(config.logFile, `${line}\n`, 'utf8'))
    .catch((error: unknown) => {
      console.error(`[bff] no se pudo escribir el log en ${config.logFile}:`, error);
    });
}

export function log(message: string): void {
  console.log(message);
  writeToFile(message);
}

export function logError(message: string): void {
  console.error(message);
  writeToFile(message);
}