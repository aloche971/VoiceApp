import { useRef, useCallback } from 'react';
import { useLogger } from './useLogger';
import { xirsysService } from '../services/xirsysService';
import { signalingService } from '../services/signalingService';

export const useWebRTC = () => {
  const { logInfo, logWarning, logError, logDebug } = useLogger();
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const userIdRef = useRef<string>(`user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  const createPeerConnection = useCallback(async () => {
    try {
      logInfo('webrtc', 'Récupération des serveurs ICE Xirsys...');
      
      // Récupère les serveurs ICE de Xirsys
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
        } else {
          logInfo('webrtc', 'Génération des candidats ICE terminée');
        }
      };

      pc.oniceconnectionstatechange = () => {
        logInfo('webrtc', `État de connexion ICE: ${pc.iceConnectionState}`);
        
        switch (pc.iceConnectionState) {
          case 'connected':
            logInfo('webrtc', 'Connexion ICE établie avec succès');
            break;
          case 'disconnected':
            logWarning('webrtc', 'Connexion ICE interrompue');
            break;
          case 'failed':
            logError('webrtc', 'Échec de la connexion ICE');
            break;
          case 'closed':
            logInfo('webrtc', 'Connexion ICE fermée');
            break;
        }
      };

      pc.onconnectionstatechange = () => {
        logInfo('webrtc', `État de connexion: ${pc.connectionState}`);
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
      currentRoomRef.current = roomId;
      
      const success = await signalingService.joinRoom(roomId, userIdRef.current);
      
      if (success) {
        logInfo('signaling', `Connecté à la salle: ${roomId}`);
        return true;
      } else {
        logWarning('signaling', `Impossible de rejoindre la salle: ${roomId}`);
        return false;
      }
    } catch (error) {
      logError('signaling', 'Erreur lors de la connexion à la salle', { error, roomId });
      return false;
    }
  }, [logInfo, logWarning, logError]);

  const leaveRoom = useCallback(async () => {
    if (currentRoomRef.current) {
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
      if (currentRoomRef.current) {
        await signalingService.sendOffer(currentRoomRef.current, offer);
        logInfo('signaling', 'Offre envoyée via signaling');
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
      if (currentRoomRef.current) {
        await signalingService.sendAnswer(currentRoomRef.current, answer);
        logInfo('signaling', 'Réponse envoyée via signaling');
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
      throw new Error('Connexion peer non initialisée');
    }

    try {
      logDebug('webrtc', 'Ajout du candidat ICE distant', { candidate: candidate.candidate });
      await peerConnectionRef.current.addIceCandidate(candidate);
      logDebug('webrtc', 'Candidat ICE distant ajouté avec succès');
      
      // Envoie le candidat ICE via le service de signaling
      if (currentRoomRef.current) {
        await signalingService.sendIceCandidate(currentRoomRef.current, candidate);
      }
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

  return {
    createPeerConnection,
    joinRoom,
    leaveRoom,
    getUserMedia,
    createOffer,
    createAnswer,
    handleAnswer,
    addIceCandidate,
    toggleMute,
    cleanup,
    getConnectionStats,
    currentRoom: currentRoomRef.current,
    userId: userIdRef.current,
    localStream: localStreamRef.current,
    remoteStream: remoteStreamRef.current,
    peerConnection: peerConnectionRef.current
  };
};