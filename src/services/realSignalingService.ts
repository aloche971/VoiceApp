// Service de signaling WebRTC réel utilisant WebSocket
export type SignalingMessage = 
  | { type: 'offer'; data: RTCSessionDescriptionInit; roomId: string }
  | { type: 'answer'; data: RTCSessionDescriptionInit; roomId: string }
  | { type: 'ice-candidate'; data: RTCIceCandidateInit; roomId: string }
  | { type: 'join-room'; roomId: string; userId: string }
  | { type: 'leave-room'; roomId: string; userId: string }
  | { type: 'user-joined'; roomId: string; userId: string }
  | { type: 'user-left'; roomId: string; userId: string }
  | { type: 'joined-room'; roomId: string; userId: string }
  | { type: 'error'; message: string };

export type SignalingEventHandler = (message: SignalingMessage) => void;

class RealSignalingService {
  private ws: WebSocket | null = null;
  private eventHandlers: Map<string, SignalingEventHandler[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private currentUserId: string | null = null;
  private currentRoomId: string | null = null;

  constructor() {
    // Don't auto-connect - wait for explicit connect() call
  }

  private getWebSocketUrl(): string {
    const currentHostname = window.location.hostname;
    
    // Dans WebContainer, chaque port a son propre hostname
    // Remplacer le port 5173 par 8080 dans le hostname
    if (currentHostname.includes('--5173--')) {
      const wsHostname = currentHostname.replace('--5173--', '--8080--');
      return `ws://${wsHostname}/`;
    }
    
    // Fallback pour développement local
    return `ws://localhost:8080`;
  }

  connect() {
    try {
      // Connexion au serveur WebSocket avec URL dynamique
      const wsUrl = this.getWebSocketUrl();
      console.log('🔗 Tentative de connexion WebSocket à:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('🔗 Connexion WebSocket établie avec le serveur de signaling');
        this.reconnectAttempts = 0;
        
        // Rejoindre automatiquement la salle si on était déjà connecté
        if (this.currentRoomId && this.currentUserId) {
          this.joinRoom(this.currentRoomId, this.currentUserId);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 Message de signaling reçu:', message.type);
          this.emit('message', message);
        } catch (error) {
          console.error('❌ Erreur lors du parsing du message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('📱 Connexion WebSocket fermée');
        this.handleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('❌ Erreur WebSocket:', error);
      };

    } catch (error) {
      console.error('❌ Erreur lors de la connexion WebSocket:', error);
      this.handleReconnect();
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts} dans ${this.reconnectDelay}ms`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
      
      this.reconnectDelay *= 2; // Backoff exponentiel
    } else {
      console.error('❌ Impossible de se reconnecter au serveur de signaling');
      this.emit('message', {
        type: 'error',
        message: 'Connexion au serveur perdue'
      });
    }
  }

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

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('⚠️ WebSocket non connecté, impossible d\'envoyer le message');
      return false;
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    this.currentRoomId = roomId;
    this.currentUserId = userId;
    
    return this.send({
      type: 'join-room',
      roomId,
      userId
    });
  }

  async leaveRoom(roomId: string, userId: string) {
    this.send({
      type: 'leave-room',
      roomId,
      userId
    });
    
    this.currentRoomId = null;
    this.currentUserId = null;
  }

  async sendOffer(roomId: string, offer: RTCSessionDescriptionInit) {
    return this.send({
      type: 'offer',
      roomId,
      offer
    });
  }

  async sendAnswer(roomId: string, answer: RTCSessionDescriptionInit) {
    return this.send({
      type: 'answer',
      roomId,
      answer
    });
  }

  async sendIceCandidate(roomId: string, candidate: RTCIceCandidateInit) {
    return this.send({
      type: 'ice-candidate',
      roomId,
      candidate
    });
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  disconnect() {
    if (this.currentRoomId && this.currentUserId) {
      this.leaveRoom(this.currentRoomId, this.currentUserId);
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  setSimulationMode(enabled: boolean) {
    // Cette méthode est gardée pour la compatibilité
    // mais n'est pas utilisée dans le service réel
  }
}

export const realSignalingService = new RealSignalingService();