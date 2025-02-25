// lib/services/logger.ts
import { writable } from 'svelte/store';

// Créer un store pour les logs
export const logs = writable<{level: string; message: string; timestamp: number}[]>([]);

// Limite de logs à garder
const MAX_LOGS = 50;

class LoggerService {
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
      // Essayer de formatter les objets de manière lisible
      try {
        const dataStr = typeof data === 'object' 
          ? JSON.stringify(data, null, 2).substring(0, 200) // Limite pour éviter les objets trop grands
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
      // Ajouter le nouveau log
      const newLogs = [
        { level, message, timestamp: Date.now() },
        ...currentLogs
      ];
      
      // Garder seulement les MAX_LOGS derniers logs
      return newLogs.slice(0, MAX_LOGS);
    });
  }
}

export const logger = new LoggerService();