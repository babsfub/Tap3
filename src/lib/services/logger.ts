// lib/services/logger.ts
import { writable, type Writable } from 'svelte/store';

// Type de log
export interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

// Créer un store pour les logs
export const logs = writable<LogEntry[]>([]);

// Limite de logs à garder
const MAX_LOGS = 50;

class LoggerService {
  // Getter pour accéder au store
  get logs() {
    return logs;
  }
  
  debug(message: string, data?: any): void {
    this.addLog('debug', this.formatMessage(message, data));
  }

  info(message: string, data?: any): void {
    this.addLog('info', this.formatMessage(message, data));
  }

  warn(message: string, data?: any): void {
    this.addLog('warn', this.formatMessage(message, data));
    console.warn(message, data);
  }

  error(message: string, data?: any): void {
    this.addLog('error', this.formatMessage(message, data));
    console.error(message, data);
  }

  clear(): void {
    logs.set([]);
  }

  private formatMessage(message: string, data?: any): string {
    if (data) {
      try {
        const dataStr = typeof data === 'object' 
          ? JSON.stringify(data, null, 2).substring(0, 200)
          : String(data);
        return `${message} | ${dataStr}`;
      } catch (e) {
        return `${message} | [Objet non affichable]`;
      }
    }
    return message;
  }

  private addLog(level: string, message: string): void {
    logs.update(currentLogs => {
      const newLogs = [
        { level, message, timestamp: Date.now() },
        ...currentLogs
      ];
      return newLogs.slice(0, MAX_LOGS);
    });
  }
}

// Créer une instance unique de LoggerService
export const logger = new LoggerService();