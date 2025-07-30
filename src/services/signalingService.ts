// Service de signaling pour WebRTC réel
import { realSignalingService } from './realSignalingService';

export type SignalingMessage = 
  | { type: 'offer'; data: RTCSessionDescriptionInit; roomId: string }
  | { type: 'answer'; data: RTCSessionDescriptionInit; roomId: string }
  | { type: 'ice-candidate'; data: RTCIceCandidateInit; roomId: string }
  | { type: 'join-room'; roomId: string }
  | { type: 'leave-room'; roomId: string }
  | { type: 'user-joined'; roomId: string }
  | { type: 'user-left'; roomId: string };

export type SignalingEventHandler = (message: SignalingMessage) => void;

class SignalingService {
  private eventHandlers: Map<string, SignalingEventHandler[]> = new Map();
  private isSimulated = false; // Par défaut, utilise le vrai signaling

  // Simule un serveur de signaling simple
  private simulatedRooms: Map<string, string[]> = new Map();

  on(event: string, handler: SignalingEventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: SignalingEventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, message: SignalingMessage) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    if (this.isSimulated) {
      return this.simulatedJoinRoom(roomId, userId);
    } else {
      // Utilise le vrai service de signaling
      return await realSignalingService.joinRoom(roomId, userId);
    }
  }

  private simulatedJoinRoom(roomId: string, userId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.simulatedRooms.has(roomId)) {
        this.simulatedRooms.set(roomId, []);
      }

      const room = this.simulatedRooms.get(roomId)!;
      
      if (room.length === 0) {
        // Premier utilisateur dans la salle
        room.push(userId);
        resolve(true);
      } else if (room.length === 1 && !room.includes(userId)) {
        // Deuxième utilisateur rejoint
        room.push(userId);
        
        // Simule l'arrivée du deuxième utilisateur après un délai
        setTimeout(() => {
          this.emit('message', { type: 'user-joined', roomId });
        }, 2000 + Math.random() * 3000);
        
        resolve(true);
      } else {
        // Salle pleine ou utilisateur déjà présent
        resolve(false);
      }
    });
  }

  async leaveRoom(roomId: string, userId: string) {
    if (this.isSimulated) {
      if (this.simulatedRooms.has(roomId)) {
        const room = this.simulatedRooms.get(roomId)!;
        const index = room.indexOf(userId);
        if (index > -1) {
          room.splice(index, 1);
          this.emit('message', { type: 'user-left', roomId });
          
          if (room.length === 0) {
            this.simulatedRooms.delete(roomId);
          }
        }
      }
    } else {
      await realSignalingService.leaveRoom(roomId, userId);
    }
  }

  async sendOffer(roomId: string, offer: RTCSessionDescriptionInit) {
    if (this.isSimulated) {
      // Pour la simulation, on émet directement
      setTimeout(() => {
        this.emit('message', { type: 'offer', data: offer, roomId });
      }, 500);
    } else {
      await realSignalingService.sendOffer(roomId, offer);
    }
  }

  async sendAnswer(roomId: string, answer: RTCSessionDescriptionInit) {
    if (this.isSimulated) {
      setTimeout(() => {
        this.emit('message', { type: 'answer', data: answer, roomId });
      }, 500);
    } else {
      await realSignalingService.sendAnswer(roomId, answer);
    }
  }

  async sendIceCandidate(roomId: string, candidate: RTCIceCandidateInit) {
    if (this.isSimulated) {
      setTimeout(() => {
        this.emit('message', { type: 'ice-candidate', data: candidate, roomId });
      }, 100);
    } else {
      await realSignalingService.sendIceCandidate(roomId, candidate);
    }
  }

  setSimulationMode(enabled: boolean) {
    this.isSimulated = enabled;
    
    if (enabled) {
      // Mode simulation activé - déconnecter le service réel
      realSignalingService.disconnect();
    } else {
      // Mode WebRTC réel activé - connecter le service réel
      realSignalingService.connect();
      // Connecter le service réel aux événements
      realSignalingService.on('message', (message) => {
        this.emit('message', message);
      });
    }
  }
}

export const signalingService = new SignalingService();