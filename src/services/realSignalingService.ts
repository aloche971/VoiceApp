import { io, Socket } from 'socket.io-client';

export type RealSignalingMessage = 
  | { type: 'offer'; data: RTCSessionDescriptionInit; from: string }
  | { type: 'answer'; data: RTCSessionDescriptionInit; from: string }
  | { type: 'ice-candidate'; data: RTCIceCandidateInit; from: string }
  | { type: 'user-joined'; userId: string }
  | { type: 'user-left'; userId: string }
  | { type: 'joined-room'; roomId: string; userId: string; isHost: boolean }
  | { type: 'join-error'; message: string };

export type RealSignalingEventHandler = (message: RealSignalingMessage) => void;

class RealSignalingService {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, RealSignalingEventHandler[]> = new Map();
  private serverUrl = 'http://localhost:3001'; // Changez cette URL pour votre serveur déployé

  connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve(true);
        return;
      }

      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      this.socket.on('connect', () => {
        console.log('Connecté au serveur de signaling');
        this.setupEventListeners();
        resolve(true);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Erreur de connexion au serveur de signaling:', error);
        reject(error);
      });

      // Timeout de connexion
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('Timeout de connexion au serveur'));
        }
      }, 10000);
    });
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('joined-room', (data) => {
      this.emit('message', { type: 'joined-room', ...data });
    });

    this.socket.on('join-error', (data) => {
      this.emit('message', { type: 'join-error', ...data });
    });

    this.socket.on('user-joined', (data) => {
      this.emit('message', { type: 'user-joined', ...data });
    });

    this.socket.on('user-left', (data) => {
      this.emit('message', { type: 'user-left', ...data });
    });

    this.socket.on('offer', (data) => {
      this.emit('message', { type: 'offer', data: data.offer, from: data.from });
    });

    this.socket.on('answer', (data) => {
      this.emit('message', { type: 'answer', data: data.answer, from: data.from });
    });

    this.socket.on('ice-candidate', (data) => {
      this.emit('message', { type: 'ice-candidate', data: data.candidate, from: data.from });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, handler: RealSignalingEventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: RealSignalingEventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, message: RealSignalingMessage) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.socket?.connected) {
      throw new Error('Non connecté au serveur de signaling');
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 10000);

      const handleJoined = (message: RealSignalingMessage) => {
        if (message.type === 'joined-room') {
          clearTimeout(timeout);
          this.off('message', handleJoined);
          this.off('message', handleError);
          resolve(true);
        }
      };

      const handleError = (message: RealSignalingMessage) => {
        if (message.type === 'join-error') {
          clearTimeout(timeout);
          this.off('message', handleJoined);
          this.off('message', handleError);
          resolve(false);
        }
      };

      this.on('message', handleJoined);
      this.on('message', handleError);

      this.socket.emit('join-room', { roomId, userId });
    });
  }

  async leaveRoom() {
    if (this.socket?.connected) {
      this.socket.emit('leave-room');
    }
  }

  async sendOffer(roomId: string, offer: RTCSessionDescriptionInit) {
    if (this.socket?.connected) {
      this.socket.emit('offer', { roomId, offer });
    }
  }

  async sendAnswer(roomId: string, answer: RTCSessionDescriptionInit) {
    if (this.socket?.connected) {
      this.socket.emit('answer', { roomId, answer });
    }
  }

  async sendIceCandidate(roomId: string, candidate: RTCIceCandidateInit) {
    if (this.socket?.connected) {
      this.socket.emit('ice-candidate', { roomId, candidate });
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const realSignalingService = new RealSignalingService();