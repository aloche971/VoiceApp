import React, { useState, useRef, useEffect, useCallback } from 'react'; // Added useCallback
import { Mic, MicOff, Phone, PhoneOff, Users, Copy, Check, Activity } from 'lucide-react';
import { LogViewer } from './components/LogViewer';
import { AudioSimulator } from './components/AudioSimulator';
import { useLogger } from './hooks/useLogger';
import { useWebRTC } from './hooks/useWebRTC'; // Use the refactored hook
import { signalingService } from './services/signalingService'; // Use the refactored service

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

function App() {
  const logger = useLogger();
  const webrtc = useWebRTC(); // Initialize the hook
  
  const [isConnected, setIsConnected] = useState<ConnectionState>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [roomId, setRoomId] = useState(''); // This will likely become the partner's socket ID in UI
  const [isHost, setIsHost] = useState(false); // Refers to who is the WebRTC offer initiator
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [connectionStats, setConnectionStats] = useState<any>(null);
  const [waitingForPeer, setWaitingForPeer] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState(0.3);
  // Removed useRealWebRTC state as it's now always real WebRTC
  const [clientSocketId, setClientSocketId] = useState<string | null>(null); // NEW: To store the client's own socket ID
  const [partnerDetails, setPartnerDetails] = useState<any>(null); // NEW: To store partner's details from server

  // Refs for audio elements - crucial for playing streams
  const localAudioRef = useRef<HTMLAudioElement>(null); 
  const remoteAudioRef = useRef<HTMLAudioElement>(null); 

  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // connectionTimeoutRef is no longer needed for simulation

  // NEW: Callback for WebRTC connection state changes from useWebRTC hook
  const handleWebRtcConnectionStateChange = useCallback((state: RTCPeerConnectionState) => {
    logger.logInfo('webrtc', `PeerConnection State Changed: ${state}`);
    if (state === 'connected') {
      setIsConnected('connected');
      setWaitingForPeer(false);
      logger.logInfo('ui', 'Real WebRTC connection established');
    } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      // Only transition to disconnected if not already in a connecting state
      // This prevents immediate UI flicker if a new call is starting
      if (isConnected !== 'connecting') {
        setIsConnected('disconnected');
      }
      setWaitingForPeer(false);
      setError('Connection lost or failed.'); // More general error
    }
  }, [logger, isConnected]);

  useEffect(() => {
    logger.logInfo('system', 'Application VoiceConnect initialisée');
    
    // Set up WebRTC hook with client's socket ID and state change callback
    webrtc.setConnectionStateChangeCallback(handleWebRtcConnectionStateChange);

    // Initial connection to signaling server
    // This part should handle getting the client's socket.id
    signalingService.socket?.on('connect', () => {
        const id = signalingService.socket?.id || null;
        setClientSocketId(id);
        webrtc.setUserId(id || ''); // Pass client's socket ID to useWebRTC hook
        logger.logInfo('signaling', `Client connected to server with ID: ${id}`);
    });

    // Handle incoming messages from signalingService
    const handleSignalingMessage = (message: SignalingMessage) => {
      logger.logInfo('signaling', `Message received by App.tsx: ${message.type}`, message);
      
      switch (message.type) {
        case 'user-joined':
            // This event now directly means a match was found and peer is ready
            setPartnerDetails({ // Placeholder, server should send real details in 'matchFound'
                name: `Partner ${message.userId.slice(-4)}`,
                id: message.userId,
                // Add more details if server sends them with user-joined / matchFound
                departure: 'Unknown', arrival: 'Unknown', truckColor: ''
            });
            setIsHost(message.isInitiator); // Set initiator status for WebRTC
            setWaitingForPeer(false); // No longer waiting once match found
            // webrtc.createPeerConnection() and getUserMedia() should have already been called.
            // If initiator, create offer; if not, wait for offer. This is handled by useWebRTC's useEffect.
            break;
        case 'user-left':
            handlePeerLeft();
            break;
        // Offer, Answer, ICE candidates are handled directly by useWebRTC hook
      }
    };
    
    signalingService.on('message', handleSignalingMessage);
    
    return () => {
      signalingService.off('message', handleSignalingMessage);
      cleanup(); // Global cleanup when component unmounts
    };
  }, [logger, webrtc, handleWebRtcConnectionStateChange]); // Added webrtc and handleWebRtcConnectionStateChange to dependencies

  useEffect(() => {
    // Attach local stream to local audio element for monitoring
    if (webrtc.localStream && localAudioRef.current) {
      localAudioRef.current.srcObject = webrtc.localStream;
      localAudioRef.current.muted = true; // Mute local playback
      localAudioRef.current.play().catch(e => logger.logError('media', 'Failed to play local audio stream', e));
    }
    // Attach remote stream to remote audio element
    if (webrtc.remoteStream && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = webrtc.remoteStream;
        remoteAudioRef.current.play().catch(e => logger.logError('media', 'Failed to play remote audio stream', e));
    }
  }, [webrtc.localStream, webrtc.remoteStream, logger]);


  useEffect(() => {
    if (isConnected === 'connected' && showStats) {
      statsIntervalRef.current = setInterval(async () => {
        const stats = await webrtc.getConnectionStats();
        setConnectionStats(stats);
      }, 2000);
    } else {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    }

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [isConnected, showStats, webrtc]);


  const handlePeerLeft = () => {
    logger.logInfo('signaling', 'Le peer a quitté la conversation');
    setError('Votre interlocuteur a quitté la conversation');
    cleanup(); // Clean up WebRTC connection
  };

  const cleanup = () => {
    logger.logInfo('system', 'Nettoyage de la session App.tsx');
    webrtc.cleanup(); // Call WebRTC hook's cleanup
    setIsConnected('disconnected');
    setWaitingForPeer(false);
    setRoomId('');
    setIsHost(false);
    setError('');
    setShowStats(false);
    setConnectionStats(null);
    setPartnerDetails(null); // Clear partner details
  };

  const generateRoomId = () => {
    // This is now just a placeholder for the UI, as the server will handle actual room/partner IDs
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };
  
  const createRoom = async () => {
    try {
      logger.logInfo('ui', 'Tentative de création d\'une salle');
      setError('');
      setIsConnected('connecting');
      
      // Ensure local audio is set up and peer connection object is ready
      await webrtc.createPeerConnection();
      await webrtc.getUserMedia();
      
      const newRoomId = generateRoomId(); // This is a temporary UI ID
      setRoomId(newRoomId);
      setWaitingForPeer(true);
      
      // Request a match from the signaling server. The server will assign the actual partner ID.
      // We pass the newRoomId (as a placeholder) and the client's socket ID
      const joined = await signalingService.joinRoom(newRoomId, clientSocketId || ''); 
      if (!joined) {
        throw new Error('Impossible de démarrer la recherche de match.');
      }
      
      logger.logInfo('ui', `Matchmaking initiated. Waiting for a partner...`);
      logger.logInfo('signaling', 'En attente qu\'un utilisateur rejoigne la salle via le serveur');
      
    } catch (err: any) { // Catch any error type
      logger.logError('ui', 'Erreur lors de la création de la salle/recherche de match', { error: err.message || err });
      setError(`Impossible d'accéder au microphone ou de commencer le matchmaking: ${err.message || 'Erreur inconnue'}`);
      setIsConnected('disconnected');
      setWaitingForPeer(false);
      webrtc.cleanup(); // Clean up if an error occurs
    }
  };

  const joinRoom = async () => {
    if (!roomId.trim()) {
      logger.logWarning('ui', 'Tentative de connexion sans code de salle');
      setError('Veuillez entrer un code de salle');
      return;
    }
    
    try {
      logger.logInfo('ui', `Tentative de connexion à la salle: ${roomId}`);
      setError('');
      setIsConnected('connecting');
      
      // Ensure local audio is set up and peer connection object is ready
      await webrtc.createPeerConnection();
      await webrtc.getUserMedia();
      
      // Request to join a specific match (not typically how matchmaking works,
      // but if 'roomId' is an existing call ID from the server, it would be passed)
      // For a typical matching system, 'joinRoom' would also call 'findMatch' on server.
      // For now, let's assume 'joinRoom' button implies finding a match directly.
      const joined = await signalingService.joinRoom(roomId, clientSocketId || ''); // Use existing roomId to signify intent
      if (!joined) {
        throw new Error('Salle introuvable ou matchmaking échoué');
      }
      
      logger.logInfo('signaling', 'Matchmaking initiated. Waiting for connection...');
      
    } catch (err: any) { // Catch any error type
      logger.logError('ui', 'Erreur lors de la connexion à la salle/recherche de match', { error: err.message || err });
      setError(`Impossible de rejoindre la salle ou de se connecter: ${err.message || 'Erreur inconnue'}`);
      setIsConnected('disconnected');
      webrtc.cleanup(); // Clean up if an error occurs
    }
  };

  const toggleMute = () => {
    const muted = webrtc.toggleMute();
    setIsMuted(muted);
  };

  const disconnect = () => {
    logger.logInfo('ui', 'Déconnexion demandée par l\'utilisateur');
    if (webrtc.peerConnection) { // Only send leaveRoom if a connection was attempted/active
        webrtc.leaveRoom(); // Signal server to end call
    }
    cleanup();
  };

  const copyRoomId = async () => {
    try {
      logger.logDebug('ui', 'Copie du code de salle dans le presse-papiers');
      // Copy the current client's socket ID, which acts as a temporary "room ID" for direct sharing
      await navigator.clipboard.writeText(clientSocketId || roomId); 
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.logError('ui', 'Erreur lors de la copie du code de salle', { error: err });
    }
  };

  const toggleStats = () => {
    setShowStats(!showStats);
    logger.logDebug('ui', `Statistiques ${!showStats ? 'activées' : 'désactivées'}`);
  };

  const renderDisconnectedState = () => (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-10 h-10 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">VoiceConnect</h1>
        <p className="text-gray-600 mb-4">Parlez simplement avec vos proches</p>
        
        {/* Remove the simulation toggle as it's always real WebRTC now */}
        <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${logger.isLogging ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            <span>Logs {logger.isLogging ? 'actifs' : 'en pause'}</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span>{logger.logs.length} entrées</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={createRoom}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center space-x-2"
        >
          <Phone className="w-5 h-5" />
          <span>Créer une conversation</span>
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">ou</span>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Code de la salle"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-center font-mono text-lg tracking-wider"
            maxLength={6}
          />
          <button
            onClick={joinRoom}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200"
          >
            Rejoindre la conversation
          </button>
        </div>
      </div>
    </div>
  );

  const renderConnectingState = () => (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 text-center">
      <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
      
      {isHost ? ( // isHost now indicates who initiated the WebRTC offer
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Salle créée !</h2>
          <p className="text-gray-600 mb-6">Partagez ce code avec votre contact :</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center space-x-3">
              <span className="text-2xl font-mono font-bold text-gray-900 tracking-wider">
                {clientSocketId || 'Générant...'} {/* Display client's own socket ID */}
              </span>
              <button
                onClick={copyRoomId}
                className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <p className="text-sm text-gray-500 mb-6">
            {waitingForPeer ? 'En attente qu\'un utilisateur rejoigne...' : 'Établissement de la connexion...'}
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Connexion en cours...</h2>
          <p className="text-gray-600 mb-6">Tentative de connexion à la salle {roomId}</p>
        </div>
      )}
      
      <button
        onClick={disconnect}
        className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
      >
        Annuler
      </button>
    </div>
  );

  const renderConnectedState = () => (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <div className={`w-4 h-4 rounded-full ${isMuted ? 'bg-red-500' : 'bg-green-500'} animate-pulse`}></div>
      </div>
      
      <h2 className="text-xl font-bold text-gray-900 mb-2">Connecté !</h2>
      <p className="text-gray-600 mb-6">Salle : {roomId || (partnerDetails ? partnerDetails.id : 'N/A')}</p> {/* Show actual partner ID */}
      {partnerDetails && (
          <p className="text-gray-700 text-sm mb-4">Avec : {partnerDetails.name}</p>
      )}
      
      {/* Bouton pour afficher les statistiques */}
      <div className="mb-6">
        <button
          onClick={toggleStats}
          className={`flex items-center space-x-2 mx-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showStats 
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>{showStats ? 'Masquer' : 'Afficher'} les stats</span>
        </button>
      </div>

      {/* Statistiques de connexion */}
      {showStats && connectionStats && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg text-left">
          <h3 className="font-semibold text-gray-900 mb-2 text-center">Statistiques WebRTC</h3>
          <div className="space-y-2 text-xs">
            {/* Example of how to display stats, you'd want to parse connectionStats */}
            {Object.keys(connectionStats).length > 0 ? (
                Object.entries(connectionStats).slice(0, 5).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex justify-between">
                        <span className="text-gray-600 truncate">{value.type || key}</span>
                        <span className="text-gray-900 font-mono">
                        {value.bytesReceived || value.bytesSent || value.state || 'N/A'}
                        </span>
                    </div>
                ))
            ) : (
                <p className="text-gray-500">Aucune statistique disponible.</p>
            )}
          </div>
        </div>
      )}
      
      {/* Audio Simulator is now just a visual indicator if not connected, or if you want to test remote audio */}
      {/* If connected, real remote audio should be playing via remoteAudioRef */}
      {isConnected !== 'connected' && (
        <AudioSimulator
            isConnected={true} // Still show it as connected to test if it's the issue
            isMuted={isMuted}
            onVolumeChange={setRemoteVolume}
        />
      )}
      
      <div className="flex justify-center space-x-6 mb-8">
        <button
          onClick={toggleMute}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
            isMuted 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
        </button>
      </div>
      
      <p className="text-sm text-gray-500 mb-6">
        {isMuted ? 'Microphone désactivé' : 'Microphone activé'}
        {!isMuted && ` • Audio distant: ${Math.round(remoteVolume * 100)}%`}
      </p>
      
      <button
        onClick={disconnect}
        className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center space-x-2"
      >
        <PhoneOff className="w-5 h-5" />
        <span>Terminer l'appel</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      {/* Audio elements to play local and remote streams */}
      <audio id="localAudioPlayer" ref={localAudioRef} muted style={{ display: 'none' }} /> 
      <audio id="remoteAudioPlayer" ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      
      {/* Composant de visualisation des logs */}
      <LogViewer
        logs={logger.logs}
        onClear={logger.clearLogs}
        isLogging={logger.isLogging}
        onToggleLogging={logger.toggleLogging}
      />
      
      {isConnected === 'disconnected' && renderDisconnectedState()}
      {isConnected === 'connecting' && renderConnectingState()}
      {isConnected === 'connected' && renderConnectedState()}
    </div>
  );
}

export default App;