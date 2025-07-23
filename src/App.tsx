import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Users, Copy, Check, Activity } from 'lucide-react';
import { LogViewer } from './components/LogViewer';
import { AudioSimulator } from './components/AudioSimulator';
import { DataTableExample } from './components/AccessibleDataTable';
import { useLogger } from './hooks/useLogger';
import { useWebRTC } from './hooks/useWebRTC';
import { signalingService } from './services/signalingService';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

function App() {
  const logger = useLogger();
  const webrtc = useWebRTC();
  
  const [isConnected, setIsConnected] = useState<ConnectionState>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [connectionStats, setConnectionStats] = useState<any>(null);
  const [waitingForPeer, setWaitingForPeer] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState(0.3);
  const [useRealWebRTC, setUseRealWebRTC] = useState(false);

  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    logger.logInfo('system', 'Application VoiceConnect initialisée');
    
    // Configure le service de signaling
    const handleSignalingMessage = (message: any) => {
      logger.logInfo('signaling', `Message reçu: ${message.type}`, message);
      
      switch (message.type) {
        case 'user-joined':
          if (isHost && isConnected === 'connecting') {
            handlePeerJoined();
          }
          break;
        case 'offer':
          if (!isHost) {
            handleOfferReceived(message.data);
          }
          break;
        case 'answer':
          if (isHost) {
            handleAnswerReceived(message.data);
          }
          break;
        case 'ice-candidate':
          webrtc.addIceCandidate(message.data);
          break;
        case 'user-left':
          handlePeerLeft();
          break;
      }
    };
    
    signalingService.on('message', handleSignalingMessage);
    
    return () => {
      signalingService.off('message', handleSignalingMessage);
      cleanup();
    };
  }, []);

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

  const handlePeerJoined = async () => {
    try {
      logger.logInfo('webrtc', 'Peer rejoint - création de l\'offre');
      await webrtc.createOffer();
    } catch (error) {
      logger.logError('webrtc', 'Erreur lors de la création de l\'offre', { error });
      setError('Erreur lors de la négociation WebRTC');
      setIsConnected('disconnected');
    }
  };

  const handleOfferReceived = async (offer: RTCSessionDescriptionInit) => {
    try {
      logger.logInfo('webrtc', 'Offre reçue - création de la réponse');
      await webrtc.createAnswer(offer);
      
      // Simule la connexion établie
      setTimeout(() => {
        setIsConnected('connected');
        setWaitingForPeer(false);
        logger.logInfo('ui', 'Connexion WebRTC établie');
      }, 1000);
    } catch (error) {
      logger.logError('webrtc', 'Erreur lors du traitement de l\'offre', { error });
      setError('Erreur lors de la négociation WebRTC');
      setIsConnected('disconnected');
    }
  };

  const handleAnswerReceived = async (answer: RTCSessionDescriptionInit) => {
    try {
      logger.logInfo('webrtc', 'Réponse reçue - finalisation de la connexion');
      await webrtc.handleAnswer(answer);
      
      // Simule la connexion établie
      setTimeout(() => {
        setIsConnected('connected');
        setWaitingForPeer(false);
        logger.logInfo('ui', 'Connexion WebRTC établie');
      }, 1000);
    } catch (error) {
      logger.logError('webrtc', 'Erreur lors du traitement de la réponse', { error });
      setError('Erreur lors de la négociation WebRTC');
      setIsConnected('disconnected');
    }
  };

  const handlePeerLeft = () => {
    logger.logInfo('signaling', 'Le peer a quitté la conversation');
    setError('Votre interlocuteur a quitté la conversation');
    cleanup();
  };
  const cleanup = () => {
    logger.logInfo('system', 'Nettoyage de la session');
    webrtc.cleanup();
    setIsConnected('disconnected');
    setWaitingForPeer(false);
    
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  };

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const simulateSecondUserJoining = () => {
    if (useRealWebRTC) {
      // En mode WebRTC réel, on attend vraiment un utilisateur
      logger.logInfo('signaling', 'Mode WebRTC réel: En attente d\'un vrai utilisateur...');
    } else {
      // En mode simulation, on simule l'arrivée d'un utilisateur
      const delay = 3000 + Math.random() * 5000;
      logger.logInfo('signaling', `Simulation: un utilisateur va rejoindre dans ${Math.round(delay/1000)}s`);
      
      connectionTimeoutRef.current = setTimeout(async () => {
        try {
          logger.logInfo('signaling', 'Simulation: deuxième utilisateur rejoint la salle');
          logger.logInfo('webrtc', 'Simulation: négociation WebRTC réussie');
          
          setTimeout(() => {
            setIsConnected('connected');
            setWaitingForPeer(false);
            logger.logInfo('ui', 'Connexion établie avec succès');
            logger.logInfo('webrtc', 'État de connexion ICE: connected');
            logger.logInfo('webrtc', 'Canal audio bidirectionnel établi');
          }, 1500);
          
        } catch (error) {
          logger.logError('webrtc', 'Erreur lors de la simulation', { error });
          setError('Erreur lors de la connexion');
          setIsConnected('disconnected');
          setWaitingForPeer(false);
        }
      }, delay);
    }
  };
  
  const createRoom = async () => {
    try {
      logger.logInfo('ui', 'Tentative de création d\'une salle');
      setError('');
      setIsConnected('connecting');
      
      // Créer la connexion peer et obtenir l'accès au microphone  
      await webrtc.createPeerConnection();
      await webrtc.getUserMedia();
      
      const newRoomId = generateRoomId();
      setRoomId(newRoomId);
      setIsHost(true);
      setWaitingForPeer(true);
      
      // Rejoindre la salle via le service de signaling
      const joined = await webrtc.joinRoom(newRoomId);
      if (!joined) {
        throw new Error('Impossible de créer la salle');
      }
      
      logger.logInfo('ui', `Salle créée avec le code: ${newRoomId}`);
      logger.logInfo('signaling', 'En attente qu\'un utilisateur rejoigne la salle');
      
      // Configure le mode de signaling
      signalingService.setSimulationMode(!useRealWebRTC);
      simulateSecondUserJoining();
      
    } catch (err) {
      logger.logError('ui', 'Erreur lors de la création de la salle', { error: err });
      setError('Impossible d\'accéder au microphone');
      setIsConnected('disconnected');
      setWaitingForPeer(false);
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
      
      // Créer la connexion peer et obtenir l'accès au microphone  
      await webrtc.createPeerConnection();
      await webrtc.getUserMedia();
      
      // Rejoindre la salle via le service de signaling
      const joined = await webrtc.joinRoom(roomId);
      if (!joined) {
        throw new Error('Salle introuvable ou pleine');
      }
      
      logger.logInfo('signaling', 'Connexion à la salle en cours...');
      
      // Configure le mode de signaling
      signalingService.setSimulationMode(!useRealWebRTC);
      
      if (useRealWebRTC) {
        // En mode WebRTC réel, on attend vraiment la connexion
        logger.logInfo('signaling', 'Mode WebRTC réel: En attente de la connexion au host...');
      } else {
        // En mode simulation, on simule la connexion
        setTimeout(async () => {
          try {
            logger.logInfo('signaling', 'Simulation: connexion au host en cours');
            logger.logInfo('webrtc', 'Simulation: négociation WebRTC réussie');
            
            setTimeout(() => {
              setIsConnected('connected');
              logger.logInfo('ui', 'Connexion établie avec succès');
              logger.logInfo('webrtc', 'État de connexion ICE: connected');
              logger.logInfo('webrtc', 'Canal audio bidirectionnel établi');
            }, 1500);
            
          } catch (error) {
            logger.logError('webrtc', 'Erreur lors de la simulation', { error });
            setError('Erreur lors de la connexion');
            setIsConnected('disconnected');
          }
        }, 2000);
      }
      
    } catch (err) {
      logger.logError('ui', 'Erreur lors de la connexion à la salle', { error: err });
      setError('Impossible de rejoindre la salle');
      setIsConnected('disconnected');
    }
  };

  const toggleMute = () => {
    const muted = webrtc.toggleMute();
    setIsMuted(muted);
  };

  const disconnect = () => {
    logger.logInfo('ui', 'Déconnexion demandée par l\'utilisateur');
    cleanup();
    setRoomId('');
    setIsHost(false);
    setError('');
    setShowStats(false);
    setConnectionStats(null);
  };

  const copyRoomId = async () => {
    try {
      logger.logDebug('ui', 'Copie du code de salle dans le presse-papiers');
      await navigator.clipboard.writeText(roomId);
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
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* Demo du tableau accessible */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <DataTableExample />
      </div>
      
      {/* Interface VoiceConnect existante */}
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-10 h-10 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">VoiceConnect</h1>
        <p className="text-gray-600 mb-4">Parlez simplement avec vos proches</p>
        
        {/* Toggle pour WebRTC réel */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <label className="flex items-center justify-center space-x-3 cursor-pointer">
            <span className="text-sm text-gray-700">Mode simulation</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={useRealWebRTC}
                onChange={(e) => setUseRealWebRTC(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-10 h-6 rounded-full transition-colors ${useRealWebRTC ? 'bg-blue-600' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform mt-1 ${useRealWebRTC ? 'translate-x-5' : 'translate-x-1'}`}></div>
              </div>
            </div>
            <span className="text-sm text-gray-700">WebRTC réel</span>
          </label>
          <p className="text-xs text-gray-500 mt-2">
            {useRealWebRTC 
              ? '🔗 Utilise Xirsys pour de vraies connexions P2P' 
              : '🎭 Simule les connexions pour les tests'
            }
          </p>
        </div>
        
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
    </div>
  );

  const renderConnectingState = () => (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 text-center">
      <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
      
      {isHost ? (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Salle créée !</h2>
          <p className="text-gray-600 mb-6">Partagez ce code avec votre contact :</p>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-center space-x-3">
              <span className="text-2xl font-mono font-bold text-gray-900 tracking-wider">
                {roomId}
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
      <p className="text-gray-600 mb-6">Salle : {roomId}</p>
      
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
            {Object.entries(connectionStats).slice(0, 5).map(([key, value]: [string, any]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600 truncate">{value.type || key}</span>
                <span className="text-gray-900 font-mono">
                  {value.state || value.connectionState || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Simulateur audio */}
      <AudioSimulator
        isConnected={true}
        isMuted={isMuted}
        onVolumeChange={setRemoteVolume}
      />
      
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
      <audio ref={localAudioRef} muted />
      <audio ref={remoteAudioRef} autoPlay />
      
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