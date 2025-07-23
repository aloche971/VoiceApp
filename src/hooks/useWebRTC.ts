import { useRef, useCallback, useEffect } from 'react'; // Added useEffect
import { useLogger } from './useLogger';
import { xirsysService } from '../services/xirsysService';
import { signalingService, SignalingMessage } from '../services/signalingService'; // Import SignalingMessage type

export const useWebRTC = () => {
  const { logInfo, logWarning, logError, logDebug } = useLogger();
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const currentRoomRef = useRef<string | null>(null); // This will be the partner's socket ID
  const userIdRef = useRef<string>(''); // This will be set by App.tsx with current client's socket ID

  // NEW: Callback to notify App.tsx about WebRTC connection status changes
  const onWebRtcConnectionStateChangeRef = useRef<((state: RTCPeerConnectionState) => void) | null>(null);

  // Set the user ID when it becomes available (from App.tsx)
  const setUserId = useCallback((id: string) => {
    userIdRef.current = id;
    logInfo('system', `WebRTC hook initialized with userId: ${id}`);
  }, [logInfo]);

  // Set the callback for App.tsx to listen to WebRTC state changes
  const setConnectionStateChangeCallback = useCallback((callback: (state: RTCPeerConnectionState) => void) => {
    onWebRtcConnectionStateChangeRef.current = callback;
  }, []);

  const createPeerConnection = useCallback(async () => {
    try {
      logInfo('webrtc', 'Récupération des serveurs ICE Xirsys...');
      
      const iceServers = await xirsysService.getIceServers();
      
      logInfo('webrtc', 'Serveurs ICE récupérés', { 
        count: iceServers.length,
        servers: iceServers.map(s => ({ urls: s.urls, hasCredentials: !!(s.username && s.credential) }))
      });

      const configuration: RTCConfiguration = { iceServers };
      
      logInfo('webrtc', 'Création de la connexion peer-to-peer', { configuration });
      const pc = new RTCPeerConnection(configuration);
      peerConnectionRef.current = pc;

      // Event listeners pour le debugging
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          logDebug('webrtc', 'Nouveau candidat ICE généré', {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          });
          // Send ICE candidate via signaling service
          if (currentRoomRef.current) {
            signalingService.sendIceCandidate(currentRoomRef.current, event.candidate);
          } else {
            logWarning('webrtc', 'ICE candidate generated but no room ID set to send to.');
          }
        } else {
          logInfo('webrtc', 'Génération des candidats ICE terminée');
        }
      };

      pc.oniceconnectionstatechange = () => {
        logInfo('webrtc', `État de connexion ICE: ${pc.iceConnectionState}`);
        // Notify App.tsx of state change
        if (onWebRtcConnectionStateChangeRef.current) {
            onWebRtcConnectionStateChangeRef.current(pc.iceConnectionState);
        }
        switch (pc.iceConnectionState) {
          case 'connected':
            logInfo('webrtc', 'Connexion ICE établie avec succès');
            break;
          case 'disconnected':
            logWarning('webrtc', 'Connexion ICE interrompue');
            // Trigger cleanup if disconnected to prevent stale state
            cleanup(); 
            break;
          case 'failed':
            logError('webrtc', 'Échec de la connexion ICE');
            cleanup(); // Trigger cleanup on failure
            break;
          case 'closed':
            logInfo('webrtc', 'Connexion ICE fermée');
            break;
        }
      };

      pc.onconnectionstatechange = () => {
        logInfo('webrtc', `État de connexion: ${pc.connectionState}`);
        // Notify App.tsx of state change for general connection
        if (onWebRtcConnectionStateChangeRef.current) {
            onWebRtcConnectionStateChangeRef.current(pc.connectionState);
        }
        // If connection is truly established
        if (pc.connectionState === 'connected') {
            logInfo('webrtc', 'WebRTC connection fully established.');
            // This is where App.tsx should transition to 'connected' state
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            cleanup(); // Clean up on disconnection or failure
        }
      };

      pc.onsignalingstatechange = () => {
        logDebug('webrtc', `État de signaling: ${pc.signalingState}`);
      };

      pc.ontrack = (event) => {
        logInfo('webrtc', 'Flux audio distant reçu', {
          streamId: event.streams[0]?.id,
          trackKind: event.track.kind
        });
        
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          // Ensure the audio element is playing this stream
          const remoteAudioElement = document.getElementById('remoteAudioPlayer') as HTMLAudioElement;
          if (remoteAudioElement) {
              remoteAudioElement.srcObject = event.streams[0];
              remoteAudioElement.play().catch(e => logError('media', 'Failed to play remote audio', e));
          }
        }
      };

      pc.ondatachannel = (event) => {
        logInfo('webrtc', 'Canal de données reçu', { label: event.channel.label });
      };

      return pc;
    } catch (error) {
      logError('webrtc', 'Erreur lors de la création de la connexion peer-to-peer', { error });
      throw error;
    }
  }, [logInfo, logWarning, logError, logDebug]);

  const joinRoom = useCallback(async (roomId: string) => {
    try {
      logInfo('signaling', `Tentative de connexion à la salle: ${roomId}`);
      currentRoomRef.current = roomId; // roomId here is the partner's socket ID from 'matchFound'
      
      // We don't directly join a "room" on the server here. Instead,
      // 'findMatch' was already emitted by signalingService, and server handles matching.
      // This function essentially just sets the room ID for future signaling.
      // The `signalingService.joinRoom` in `App.tsx` now calls `findMatch` and sets this ID.
      const success = await signalingService.joinRoom(roomId, userIdRef.current);
      
      if (success) {
        logInfo('signaling', `Signaling service initiated for room: ${roomId}`);
        return true;
      } else {
        logWarning('signaling', `Failed to initiate signaling for room: ${roomId}`);
        return false;
      }
    } catch (error) {
      logError('signaling', 'Erreur lors de l\'initiation du signaling pour la salle', { error, roomId });
      return false;
    }
  }, [logInfo, logWarning, logError]);

  const leaveRoom = useCallback(async () => {
    if (currentRoomRef.current && userIdRef.current) {
      await signalingService.leaveRoom(currentRoomRef.current, userIdRef.current);
      logInfo('signaling', `Quitté la salle: ${currentRoomRef.current}`);
      currentRoomRef.current = null;
    }
  }, [logInfo]);

  const getUserMedia = useCallback(async () => {
    try {
      logInfo('media', 'Demande d\'accès au microphone');
      
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        },
        video: false
      };

      logDebug('media', 'Contraintes média', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      logInfo('media', 'Accès au microphone accordé', {
        streamId: stream.id,
        tracks: stream.getAudioTracks().map(track => ({
          id: track.id,
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          settings: track.getSettings()
        }))
      });

      // Attach local stream to local audio element for monitoring
      const localAudioElement = document.getElementById('localAudioPlayer') as HTMLAudioElement;
      if (localAudioElement) {
          localAudioElement.srcObject = stream;
          localAudioElement.muted = true; // Mute local playback
          localAudioElement.play().catch(e => logError('media', 'Failed to play local audio', e));
      }

      // Ajouter les tracks à la connexion peer
      if (peerConnectionRef.current) {
        stream.getTracks().forEach(track => {
          logDebug('webrtc', 'Ajout du track local à la connexion', {
            trackId: track.id,
            kind: track.kind
          });
          peerConnectionRef.current!.addTrack(track, stream);
        });
      }

      return stream;
    } catch (error) {
      logError('media', 'Erreur lors de l\'accès au microphone', { error });
      throw error;
    }
  }, [logInfo, logError, logDebug]);

  const createOffer = useCallback(async () => {
    if (!peerConnectionRef.current) {
      throw new Error('Connexion peer non initialisée');
    }

    try {
      logInfo('webrtc', 'Création de l\'offre SDP');
      
      const offer = await peerConnectionRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      
      logDebug('webrtc', 'Offre SDP créée', { sdp: offer.sdp });
      
      await peerConnectionRef.current.setLocalDescription(offer);
      logInfo('webrtc', 'Description locale définie (offre)');
      
      // Envoie l'offre via le service de signaling
      if (currentRoomRef.current) { // currentRoomRef.current is the partner's socket ID here
        await signalingService.sendOffer(currentRoomRef.current, offer);
        logInfo('signaling', 'Offre envoyée via signaling');
      } else {
        logError('signaling', 'Impossible d\'envoyer l\'offre: currentRoomRef non défini');
      }
      
      return offer;
    } catch (error) {
      logError('webrtc', 'Erreur lors de la création de l\'offre', { error });
      throw error;
    }
  }, [logInfo, logError, logDebug]);

  const createAnswer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) {
      throw new Error('Connexion peer non initialisée');
    }

    try {
      logInfo('webrtc', 'Traitement de l\'offre reçue');
      logDebug('webrtc', 'Offre SDP reçue', { sdp: offer.sdp });
      
      await peerConnectionRef.current.setRemoteDescription(offer);
      logInfo('webrtc', 'Description distante définie (offre)');
      
      const answer = await peerConnectionRef.current.createAnswer();
      logDebug('webrtc', 'Réponse SDP créée', { sdp: answer.sdp });
      
      await peerConnectionRef.current.setLocalDescription(answer);
      logInfo('webrtc', 'Description locale définie (réponse)');
      
      // Envoie la réponse via le service de signaling
      if (currentRoomRef.current) { // currentRoomRef.current is the partner's socket ID here
        await signalingService.sendAnswer(currentRoomRef.current, answer);
        logInfo('signaling', 'Réponse envoyée via signaling');
      } else {
        logError('signaling', 'Impossible d\'envoyer la réponse: currentRoomRef non défini');
      }
      
      return answer;
    } catch (error) {
      logError('webrtc', 'Erreur lors de la création de la réponse', { error });
      throw error;
    }
  }, [logInfo, logError, logDebug]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) {
      throw new Error('Connexion peer non initialisée');
    }

    try {
      logInfo('webrtc', 'Traitement de la réponse reçue');
      logDebug('webrtc', 'Réponse SDP reçue', { sdp: answer.sdp });
      
      await peerConnectionRef.current.setRemoteDescription(answer);
      logInfo('webrtc', 'Description distante définie (réponse)');
    } catch (error) {
      logError('webrtc', 'Erreur lors du traitement de la réponse', { error });
      throw error;
    }
  }, [logInfo, logError, logDebug]);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) {
      logWarning('webrtc', 'Connexion peer non initialisée, impossible d\'ajouter le candidat ICE');
      return;
    }

    try {
      logDebug('webrtc', 'Ajout du candidat ICE distant', { candidate: candidate.candidate });
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)); // Ensure it's a new RTCIceCandidate
      logDebug('webrtc', 'Candidat ICE distant ajouté avec succès');
    } catch (error) {
      logError('webrtc', 'Erreur lors de l\'ajout du candidat ICE', { error, candidate });
    }
  }, [logError, logDebug]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        logInfo('media', `Microphone ${audioTrack.enabled ? 'activé' : 'désactivé'}`, {
          trackId: audioTrack.id,
          enabled: audioTrack.enabled
        });
        return !audioTrack.enabled;
      }
    }
    return false;
  }, [logInfo]);

  const cleanup = useCallback(() => {
    logInfo('system', 'Nettoyage des ressources WebRTC');
    
    // Quitte la salle de signaling
    leaveRoom();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        logDebug('media', 'Track local arrêté', { trackId: track.id });
      });
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      logInfo('webrtc', 'Connexion peer-to-peer fermée');
      peerConnectionRef.current = null;
    }

    remoteStreamRef.current = null;
    // Stop remote audio playback if any
    const remoteAudioElement = document.getElementById('remoteAudioPlayer') as HTMLAudioElement;
    if (remoteAudioElement) {
        remoteAudioElement.srcObject = null;
    }

  }, [logInfo, logDebug, leaveRoom]);

  const getConnectionStats = useCallback(async () => {
    if (!peerConnectionRef.current) return null;

    try {
      const stats = await peerConnectionRef.current.getStats();
      const statsData: any = {};
      
      stats.forEach((report) => {
        statsData[report.id] = report;
      });
      
      logDebug('webrtc', 'Statistiques de connexion récupérées', { statsCount: stats.size });
      return statsData;
    } catch (error) {
      logError('webrtc', 'Erreur lors de la récupération des statistiques', { error });
      return null;
    }
  }, [logDebug, logError]);

  // NEW: Effect to handle incoming signaling messages
  useEffect(() => {
    const handleSignalingMessage = (message: SignalingMessage) => {
      logInfo('signaling', `Message received from server: ${message.type}`, message);
      
      switch (message.type) {
        case 'user-joined':
          // This happens when a match is found and peer is ready to connect.
          // The initiator will create the offer.
          if (message.isInitiator && peerConnectionRef.current) {
            currentRoomRef.current = message.userId; // Set partner's socket ID as current room/target
            createOffer().catch(logError); // Initiator creates offer
          } else if (!message.isInitiator && peerConnectionRef.current) {
            currentRoomRef.current = message.userId; // Set partner's socket ID as current room/target
          }
          break;
        case 'offer':
          // Non-initiator receives offer and creates answer
          if (peerConnectionRef.current) {
            currentRoomRef.current = message.senderId; // Ensure current room points to sender
            createAnswer(message.data).catch(logError);
          } else {
            logWarning('webrtc', 'Received offer but peerConnection not ready.');
          }
          break;
        case 'answer':
          // Initiator receives answer
          if (peerConnectionRef.current) {
            handleAnswer(message.data).catch(logError);
          } else {
            logWarning('webrtc', 'Received answer but peerConnection not ready.');
          }
          break;
        case 'ice-candidate':
          // Both peers receive ICE candidates
          addIceCandidate(message.data).catch(logError);
          break;
        case 'user-left':
          // Partner left, clean up
          logInfo('signaling', 'Partner left the conversation. Cleaning up.');
          cleanup();
          // Notify App.tsx that connection ended due to partner leaving
          if (onWebRtcConnectionStateChangeRef.current) {
              onWebRtcConnectionStateChangeRef.current('disconnected');
          }
          break;
      }
    };

    signalingService.on('message', handleSignalingMessage);

    return () => {
      signalingService.off('message', handleSignalingMessage);
    };
  }, [logInfo, logWarning, logError, createOffer, createAnswer, handleAnswer, addIceCandidate, cleanup]);


  return {
    createPeerConnection,
    joinRoom,
    leaveRoom,
    getUserMedia,
    createOffer, // Will be called by useWebRTC internally if initiator
    createAnswer, // Will be called by useWebRTC internally if not initiator
    handleAnswer, // Will be called by useWebRTC internally if initiator
    addIceCandidate, // Will be called by useWebRTC internally
    toggleMute,
    cleanup,
    getConnectionStats,
    setUserId, // New: Function to set the client's socket ID
    setConnectionStateChangeCallback, // New: Function to set callback for App.tsx
    currentRoom: currentRoomRef.current,
    userId: userIdRef.current,
    localStream: localStreamRef.current,
    remoteStream: remoteStreamRef.current,
    peerConnection: peerConnectionRef.current
  };
};