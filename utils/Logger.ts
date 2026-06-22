/**
 * utils/Logger.ts — Structured console logger
 */
export class Logger {
  private readonly context: string;

  constructor(context: string) {
    this.context = context;
  }

  private ts(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  info(msg: string): void  { console.log(`\x1b[36m[INFO]\x1b[0m  [${this.ts()}] [${this.context}] ${msg}`); }
  warn(msg: string): void  { console.warn(`\x1b[33m[WARN]\x1b[0m  [${this.ts()}] [${this.context}] ${msg}`); }
  error(msg: string): void { console.error(`\x1b[31m[ERROR]\x1b[0m [${this.ts()}] [${this.context}] ${msg}`); }

  step(n: number, desc: string): void {
    console.log(`\n\x1b[32m[STEP ${n}]\x1b[0m ${desc}`);
    console.log('─'.repeat(60));
  }
}
