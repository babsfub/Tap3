// lib/services/DebugService.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
}

declare global {
  interface Window {
    debugLog: (level: LogLevel, message: string) => void;
  }
}

class DebugService {
  private logs: LogEntry[] = [];
  private listeners: ((logs: LogEntry[]) => void)[] = [];
  private readonly MAX_LOGS = 50;

  constructor() {
    // Exposer une fonction globale pour le débogage
    if (typeof window !== 'undefined') {
      window.debugLog = (level: LogLevel, message: string) => {
        this.log(level, message);
      };
    }
  }

  debug(message: string): void {
    this.log('debug', message);
  }

  info(message: string): void {
    this.log('info', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  clear(): void {
    this.logs = [];
    this.notifyListeners();
  }

  subscribe(callback: (logs: LogEntry[]) => void): () => void {
    this.listeners.push(callback);
    callback([...this.logs]);
    
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private log(level: LogLevel, message: string): void {
    // Ajouter le log
    this.logs.unshift({
      level,
      message,
      timestamp: Date.now()
    });
    
    // Limiter le nombre de logs
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(0, this.MAX_LOGS);
    }
    
    // Notifier les listeners
    this.notifyListeners();
    
    // Aussi logger dans la console
    console[level](message);
  }

  private notifyListeners(): void {
    const logsCopy = [...this.logs];
    for (const listener of this.listeners) {
      listener(logsCopy);
    }
  }
}

// Exporter une instance unique
export const debugService = new DebugService();