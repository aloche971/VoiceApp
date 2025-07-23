import React, { useState } from 'react';
import { Download, Play, Pause, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  category: 'webrtc' | 'media' | 'signaling' | 'ui' | 'system';
  message: string;
  data?: any;
}

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  isLogging: boolean;
  onToggleLogging: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  onClear,
  isLogging,
  onToggleLogging
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const filteredLogs = logs.filter(log => 
    filter === 'all' || log.level === filter || log.category === filter
  );

  const downloadLogs = () => {
    const logText = logs.map(log => 
      `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}${
        log.data ? '\nData: ' + JSON.stringify(log.data, null, 2) : ''
      }`
    ).join('\n\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voiceconnect-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyLogs = async () => {
    const logText = logs.map(log => 
      `[${log.timestamp.toLocaleString()}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    try {
      await navigator.clipboard.writeText(logText);
    } catch (err) {
      console.error('Erreur lors de la copie des logs');
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      case 'info': return 'text-blue-600 bg-blue-50';
      case 'debug': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'webrtc': return 'text-purple-600 bg-purple-50';
      case 'media': return 'text-green-600 bg-green-50';
      case 'signaling': return 'text-orange-600 bg-orange-50';
      case 'ui': return 'text-indigo-600 bg-indigo-50';
      case 'system': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-gray-900">Logs de Debug</h3>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
            {logs.length}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-gray-100 rounded"
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Controls */}
          <div className="p-4 border-b border-gray-200 space-y-3">
            <div className="flex items-center space-x-2">
              <button
                onClick={onToggleLogging}
                className={`flex items-center space-x-1 px-3 py-1 rounded text-sm font-medium ${
                  isLogging 
                    ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {isLogging ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isLogging ? 'Pause' : 'Reprendre'}</span>
              </button>
              
              <button
                onClick={copyLogs}
                className="flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-sm font-medium"
              >
                <Copy className="w-3 h-3" />
                <span>Copier</span>
              </button>
              
              <button
                onClick={downloadLogs}
                className="flex items-center space-x-1 px-3 py-1 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded text-sm font-medium"
              >
                <Download className="w-3 h-3" />
                <span>Télécharger</span>
              </button>
              
              <button
                onClick={onClear}
                className="flex items-center space-x-1 px-3 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded text-sm font-medium"
              >
                <Trash2 className="w-3 h-3" />
                <span>Vider</span>
              </button>
            </div>

            {/* Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Tous les logs</option>
              <option value="error">Erreurs</option>
              <option value="warning">Avertissements</option>
              <option value="info">Informations</option>
              <option value="debug">Debug</option>
              <option value="webrtc">WebRTC</option>
              <option value="media">Média</option>
              <option value="signaling">Signaling</option>
            </select>
          </div>

          {/* Logs */}
          <div className="max-h-64 overflow-y-auto p-4 space-y-2">
            {filteredLogs.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">Aucun log à afficher</p>
            ) : (
              filteredLogs.slice(-50).reverse().map((log) => (
                <div key={log.id} className="text-xs border border-gray-200 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                        {log.level.toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(log.category)}`}>
                        {log.category}
                      </span>
                    </div>
                    <span className="text-gray-500">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-gray-800 break-words">{log.message}</p>
                  {log.data && (
                    <details className="mt-1">
                      <summary className="text-gray-600 cursor-pointer hover:text-gray-800">
                        Données
                      </summary>
                      <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};