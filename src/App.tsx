import React, { useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Users, Settings, Wifi, WifiOff, Terminal, Copy, Check } from 'lucide-react';
import { useWebRTC } from './hooks/useWebRTC';

function App() {
  const [serverUrl, setServerUrl] = useState('ws://localhost:5173/api/signaling');
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);

  const {
    connectionState,
    isMuted,
    error,
    clientRole,
    partnerId,
    logs,
    connect,
    disconnect,
    toggleMute,
    endCall
  } = useWebRTC(serverUrl);

  const copyLogsToClipboard = async () => {
    try {
      const logsText = logs.join('\n');
      await navigator.clipboard.writeText(logsText);
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy logs:', error);
    }
  };

  const renderDisconnectedState = () => (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-10 h-10 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">VoiceChat WebRTC</h1>
        <p className="text-gray-600 mb-4">Chat vocal peer-to-peer sécurisé</p>
        
        <div className="flex justify-center space-x-4 mb-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            <Settings className="w-4 h-4" />
            <span>Paramètres</span>
          </button>
          
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            <Terminal className="w-4 h-4" />
            <span>Logs</span>
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-yellow-800 mb-2">
            <Settings className="w-4 h-4" />
            <span className="font-medium">Configuration & Status</span>
          </div>
          <div className="text-sm text-yellow-700 mb-3">
            <p><strong>Note:</strong> For full functionality, start Supabase services with <code className="bg-yellow-100 px-1 rounded">supabase start</code></p>
            <p>The app will work with basic STUN servers if Supabase is not running.</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-yellow-800 mb-1">
                Server URL
              </label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            placeholder="ws://localhost:8080"
          />
          <p className="text-xs text-gray-500 mt-1">
            Pour le développement local, utilisez ws://localhost:8080
          </p>
            </div>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-sm font-medium">Logs de débogage</h3>
            <button
              onClick={copyLogsToClipboard}
              className="flex items-center space-x-1 text-gray-400 hover:text-white text-xs transition-colors"
            >
              {logsCopied ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Copié!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>
          <div className="space-y-1">
            {logs.length === 0 ? (
              <p className="text-gray-400 text-xs">Aucun log disponible</p>
            ) : (
              logs.slice(-20).map((log, index) => (
                <p
                  key={index}
                  className={`text-xs font-mono ${
                    log.includes('[ERROR]') ? 'text-red-400' :
                    log.includes('[WARN]') ? 'text-yellow-400' :
                    'text-green-400'
                  }`}
                >
                  {log}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={connect}
        disabled={connectionState === 'connecting'}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center space-x-2"
      >
        <Phone className="w-5 h-5" />
        <span>
          {connectionState === 'connecting' ? 'Connexion...' : 'Rejoindre la conversation'}
        </span>
      </button>

      <p className="text-xs text-gray-500 text-center mt-4">
        Maximum 2 utilisateurs par session
      </p>
    </div>
  );

  const renderConnectedState = () => (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          {connectionState === 'connected' ? (
            <Wifi className="w-10 h-10 text-green-600" />
          ) : (
            <WifiOff className="w-10 h-10 text-yellow-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {connectionState === 'connected' ? 'Connecté' : 'En attente...'}
        </h1>
        <p className="text-gray-600 mb-4">
          {clientRole === 'client1' && !partnerId && 'En attente d\'un partenaire...'}
          {clientRole === 'client1' && partnerId && 'Vous êtes l\'hôte de la conversation'}
          {clientRole === 'client2' && 'Vous avez rejoint la conversation'}
        </p>
        
        {partnerId && (
          <div className="bg-blue-50 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-700">
              Connecté avec: {partnerId.substring(0, 8)}...
            </p>
          </div>
        )}

        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center space-x-2 mx-auto text-gray-500 hover:text-gray-700 text-sm mb-4"
        >
          <Terminal className="w-4 h-4" />
          <span>Logs de débogage</span>
        </button>
      </div>

      {showLogs && (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-sm font-medium">Logs de débogage</h3>
            <button
              onClick={copyLogsToClipboard}
              className="flex items-center space-x-1 text-gray-400 hover:text-white text-xs transition-colors"
            >
              {logsCopied ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Copié!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>
          <div className="space-y-1">
            {logs.slice(-20).map((log, index) => (
              <p
                key={index}
                className={`text-xs font-mono ${
                  log.includes('[ERROR]') ? 'text-red-400' :
                  log.includes('[WARN]') ? 'text-yellow-400' :
                  'text-green-400'
                }`}
              >
                {log}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center space-x-4 mb-6">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-full transition-colors duration-200 ${
            isMuted 
              ? 'bg-red-100 text-red-600 hover:bg-red-200' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        
        <button
          onClick={endCall}
          className="p-4 bg-red-100 text-red-600 hover:bg-red-200 rounded-full transition-colors duration-200"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-500">
          {isMuted ? 'Microphone coupé' : 'Microphone actif'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      {connectionState === 'disconnected' ? renderDisconnectedState() : renderConnectedState()}
    </div>
  );
}

export default App;