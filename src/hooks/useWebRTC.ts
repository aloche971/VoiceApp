import { useRef, useCallback, useState, useEffect } from 'react';

interface WebRTCHook {
  connectionState: 'disconnected' | 'connecting' | 'connected';
  isMuted: boolean;
  error: string;
  clientRole: 'client1' | 'client2' | null;
  partnerId: string | null;
  logs: string[];
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
  endCall: () => void;
}

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const useWebRTC = (serverUrl: string = 'ws://localhost:8080'): WebRTCHook => {
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');
  const [clientRole, setClientRole] = useState<'client1' | 'client2' | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const iceServersRef = useRef<IceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' }
  ]);
  const iceCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // Fonction pour ajouter des logs
  const logToUI = useCallback((message: string, type: 'log' | 'error' | 'warn' = 'log') => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    
    setLogs(prev => {
      const newLogs = [...prev, logMessage];
      return newLogs.slice(-50); // Garder seulement les 50 derniers logs
    });

    if (type === 'error') console.error(`[UI_LOG] ${message}`);
    else if (type === 'warn') console.warn(`[UI_LOG] ${message}`);
    else console.log(`[UI_LOG] ${message}`);
  }, []);

  // Charger les serveurs ICE
  const loadIceServers = useCallback(async () => {
    try {
      logToUI('Fetching ICE servers from server...');
      const response = await fetch('/api/ice-servers', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        logToUI(`ICE servers endpoint not available (${response.status}), using default STUN servers`, 'warn');
        iceServersRef.current = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' }
        ];
        logToUI(`Using fallback ICE servers: ${JSON.stringify(iceServersRef.current)}`);
        return;
      }

      const data = await response.json();
      if (data && data.iceServers && Array.isArray(data.iceServers)) {
        iceServersRef.current = data.iceServers;
        logToUI(`ICE servers loaded: ${JSON.stringify(data.iceServers)}`);
      } else {
        logToUI('Unexpected ICE servers response, using default STUN servers', 'warn');
        iceServersRef.current = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' }
        ];
      }
    } catch (error) {
      logToUI(`Failed to load network configuration: ${error instanceof Error ? error.message : 'Unknown error'}`, 'warn');
      logToUI('Using fallback STUN servers for WebRTC connection', 'warn');
      // Utiliser les serveurs STUN par défaut en cas d'erreur
      iceServersRef.current = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ];
      logToUI(`Fallback ICE servers configured: ${JSON.stringify(iceServersRef.current)}`);
    }
  }, [logToUI]);

  // Obtenir le stream local
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      
      localStreamRef.current = stream;
      logToUI('Local audio stream obtained.');
      
      // Créer l'élément audio local si nécessaire
      if (!localAudioRef.current) {
        localAudioRef.current = new Audio();
        localAudioRef.current.srcObject = stream;
        localAudioRef.current.muted = true; // Éviter le feedback
      }
      
      return stream;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToUI(`Microphone access denied: ${errorMessage}`, 'error');
      throw new Error('Impossible d\'accéder au microphone');
    }
  }, [logToUI]);

  // Créer une connexion peer
  const createPeerConnection = useCallback((partnerId: string) => {
    logToUI(`Creating RTCPeerConnection for partner: ${partnerId}`);
    
    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current
    });

    // Ajouter le stream local
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
      logToUI('Local audio stream added to PeerConnection.');
    }

    // Gérer les candidats ICE
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        logToUI(`Sending ICE candidate type: ${event.candidate.type || 'unknown'}`);
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate
        }));
      }
    };

    // Gérer les tracks distants
    pc.ontrack = (event) => {
      logToUI('Received remote stream track.');
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
      }
      
      if (remoteAudioRef.current.srcObject !== event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.volume = 1;
        remoteAudioRef.current.muted = false;
        
        remoteAudioRef.current.play()
          .then(() => logToUI('Remote audio stream started playing.'))
          .catch(e => {
            logToUI(`Failed to play remote audio: ${e.message}. Autoplay blocked?`, 'error');
            setError('Audio blocked. Please interact to play sound.');
          });
        
        logToUI('Remote audio stream attached to remoteAudio element.');
      }
    };

    // Surveiller l'état de connexion
    pc.onconnectionstatechange = () => {
      logToUI(`RTCPeerConnection state: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setConnectionState('connected');
        logToUI('PeerConnection is now connected!');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        logToUI(`PeerConnection disconnected or failed. State: ${pc.connectionState}`, 'warn');
        handleCallEnd('Call ended due to connection issue.');
      }
    };

    pc.oniceconnectionstatechange = () => {
      logToUI(`ICE connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        logToUI('ICE connection failed or disconnected.', 'warn');
      }
    };

    // Traiter les candidats ICE en attente
    while (iceCandidatesQueueRef.current.length > 0) {
      const candidate = iceCandidatesQueueRef.current.shift();
      if (candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
          .then(() => logToUI('Added queued ICE candidate.'))
          .catch(e => logToUI(`Failed to add queued ICE candidate: ${e.message}`, 'error'));
      }
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [logToUI]);

  // Gérer la fin d'appel
  const handleCallEnd = useCallback((message: string = 'Call ended.') => {
    logToUI('Handling call end...');
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      logToUI('RTCPeerConnection closed.');
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      logToUI('Local stream (microphone) stopped.');
    }
    
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    
    setConnectionState('disconnected');
    setClientRole(null);
    setPartnerId(null);
    setError(message);
  }, [logToUI]);

  // Gérer les messages WebSocket
  const handleWebSocketMessage = useCallback(async (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      logToUI(`Received message: ${message.type}`);

      switch (message.type) {
        case 'assignedRole':
          setClientRole(message.role);
          setPartnerId(message.partnerId);
          logToUI(`Role assigned: ${message.role}, Partner: ${message.partnerId}`);
          break;

        case 'startCall':
          logToUI(`Server initiating call! Partner: ${message.partnerId}. Initiator: ${message.initiator}`);
          setPartnerId(message.partnerId);
          setConnectionState('connecting');
          
          try {
            await getLocalStream();
            const pc = createPeerConnection(message.partnerId);
            
            if (message.initiator) {
              logToUI('This client is the initiator. Creating offer...');
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              logToUI('Created and set local offer.');
              wsRef.current?.send(JSON.stringify({
                type: 'offer',
                offer: offer
              }));
            } else {
              logToUI('This client is the responder. Waiting for offer...');
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logToUI(`Failed to start call setup: ${errorMessage}`, 'error');
            handleCallEnd('Failed to start call: Microphone or WebRTC setup error.');
          }
          break;

        case 'offer':
          logToUI(`Received offer from: ${message.senderId}`);
          if (!peerConnectionRef.current) {
            try {
              await getLocalStream();
              createPeerConnection(message.senderId);
              setPartnerId(message.senderId);
              logToUI('PeerConnection created on offer receipt.');
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              logToUI(`Failed to create PeerConnection on offer receipt: ${errorMessage}`, 'error');
              handleCallEnd('Failed to receive offer due to microphone error.');
              return;
            }
          }

          try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(message.offer));
            logToUI('Set remote description (offer).');

            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            logToUI('Created and set local answer.');
            wsRef.current?.send(JSON.stringify({
              type: 'answer',
              answer: answer
            }));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logToUI(`Error processing offer: ${errorMessage}`, 'error');
            handleCallEnd('Error processing offer.');
          }
          break;

        case 'answer':
          logToUI(`Received answer from: ${message.senderId}`);
          if (!peerConnectionRef.current) {
            logToUI('Received answer but no peer connection exists!', 'error');
            return;
          }
          try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(message.answer));
            logToUI('Set remote description (answer).');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logToUI(`Error processing answer: ${errorMessage}`, 'error');
            handleCallEnd('Error processing answer.');
          }
          break;

        case 'ice-candidate':
          logToUI(`Received ICE candidate from: ${message.senderId}`);
          if (!peerConnectionRef.current) {
            logToUI('PeerConnection not yet created, queuing ICE candidate.', 'warn');
            iceCandidatesQueueRef.current.push(message.candidate);
            return;
          }
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(message.candidate));
            logToUI('Added ICE candidate.');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logToUI(`Error adding received ICE candidate: ${errorMessage}`, 'error');
          }
          break;

        case 'partnerDisconnected':
          logToUI('Partner disconnected. Ending call.', 'warn');
          handleCallEnd('Your partner disconnected. Waiting for a new partner...');
          break;

        case 'callEnded':
          logToUI('Call ended by partner.', 'warn');
          handleCallEnd('Call ended. Waiting for a new partner...');
          break;

        case 'statusUpdate':
          setError(message.message || 'Status update');
          break;

        default:
          logToUI(`Unknown message type: ${message.type}`, 'warn');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToUI(`Error processing message: ${errorMessage}`, 'error');
    }
  }, [logToUI, getLocalStream, createPeerConnection, handleCallEnd]);

  // Se connecter au serveur
  const connect = useCallback(async () => {
    try {
      setError('');
      setConnectionState('connecting');
      logToUI('Connecting to signaling server...');

      // Charger les serveurs ICE
      await loadIceServers();

      // Se connecter au serveur WebSocket
      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        logToUI(`Connected to Socket.IO server: WebSocket`);
        setError('');
      };

      ws.onmessage = handleWebSocketMessage;

      ws.onclose = () => {
        logToUI('Disconnected from signaling server.', 'warn');
        handleCallEnd('Disconnected from server. Please refresh the page.');
      };

      ws.onerror = (error) => {
        logToUI('WebSocket error occurred', 'error');
        setError('Impossible de se connecter au serveur');
        setConnectionState('disconnected');
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToUI(`Connection error: ${errorMessage}`, 'error');
      setError(errorMessage);
      setConnectionState('disconnected');
    }
  }, [serverUrl, loadIceServers, handleWebSocketMessage, handleCallEnd, logToUI]);

  // Se déconnecter
  const disconnect = useCallback(() => {
    handleCallEnd('Disconnected by user.');
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [handleCallEnd]);

  // Basculer le mode muet
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        logToUI(`Microphone ${audioTrack.enabled ? 'unmuted' : 'muted'}`);
      }
    }
  }, [logToUI]);

  // Terminer l'appel
  const endCall = useCallback(() => {
    logToUI('End Call button clicked!');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'endCall' }));
    }
    handleCallEnd('Call ended by you. Waiting for a new partner...');
  }, [logToUI, handleCallEnd]);

  // Nettoyage à la fermeture
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
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
  };
};