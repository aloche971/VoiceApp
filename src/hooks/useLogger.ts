import { useState, useCallback, useRef } from 'react';
import { LogEntry } from '../components/LogViewer';

export const useLogger = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLogging, setIsLogging] = useState(true);
  const logIdCounter = useRef(0);

  const addLog = useCallback((
    level: LogEntry['level'],
    category: LogEntry['category'],
    message: string,
    data?: any
  ) => {
    if (!isLogging) return;

    const logEntry: LogEntry = {
      id: `log-${++logIdCounter.current}`,
      timestamp: new Date(),
      level,
      category,
      message,
      data
    };

    setLogs(prev => [...prev, logEntry]);

    // Garder seulement les 1000 derniers logs pour éviter les problèmes de mémoire
    setLogs(prev => prev.slice(-1000));
  }, [isLogging]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const toggleLogging = useCallback(() => {
    setIsLogging(prev => !prev);
  }, []);

  // Méthodes de convenance
  const logInfo = useCallback((category: LogEntry['category'], message: string, data?: any) => {
    addLog('info', category, message, data);
    // Log aussi dans la console pour debug
    console.log(`[${category.toUpperCase()}] ${message}`, data || '');
  }, [addLog]);

  const logWarning = useCallback((category: LogEntry['category'], message: string, data?: any) => {
    addLog('warning', category, message, data);
    console.warn(`[${category.toUpperCase()}] ${message}`, data || '');
  }, [addLog]);

  const logError = useCallback((category: LogEntry['category'], message: string, data?: any) => {
    addLog('error', category, message, data);
    console.error(`[${category.toUpperCase()}] ${message}`, data || '');
  }, [addLog]);

  const logDebug = useCallback((category: LogEntry['category'], message: string, data?: any) => {
    addLog('debug', category, message, data);
    console.debug(`[${category.toUpperCase()}] ${message}`, data || '');
  }, [addLog]);

  return {
    logs,
    isLogging,
    addLog,
    clearLogs,
    toggleLogging,
    logInfo,
    logWarning,
    logError,
    logDebug
  };
};