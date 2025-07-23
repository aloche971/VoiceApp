import { io, Socket } from 'socket.io-client'; // Import Socket.IO client

// Define the types of messages the client will send/receive
export type SignalingMessage =
  | { type: 'user-joined'; roomId: string; userId: string; isInitiator: boolean } // Added userId and isInitiator
  | { type: 'user-left'; roomId: string; userId: string }
  | { type: 'offer'; data: RTCSessionDescriptionInit; senderId: string } // Added senderId
  | { type: 'answer'; data: RTCSessionDescriptionInit; senderId: string } // Added senderId
  | { type: 'ice-candidate'; data: RTCIceCandidateInit; senderId: string }; // Added senderId

export type SignalingEventHandler = (message: SignalingMessage) => void;

class SignalingService {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, SignalingEventHandler[]> = new Map();
  // We remove isSimulated flag as we will always aim for real connection
  private currentRoomId: string | null = null;
  private currentUserId: string | null = null; // Store client's socket ID

  constructor() {
    // Connect to your Node.js server. Adjust the URL if your server is hosted elsewhere.
    // Make sure your Node.js server is running on http://localhost:3000
    this.socket = io('http://localhost:3000'); 

    this.socket.on('connect', () => {
      console.log('Signaling: Connected to server via Socket.IO');
      this.currentUserId = this.socket?.id || null;
      // You might want to emit a 'register' event here to tell the server about user details
    });

    this.socket.on('disconnect', () => {
      console.log('Signaling: Disconnected from server');
      this.currentRoomId = null;
      this.currentUserId = null;
      this.emit('message', { type: 'user-left', roomId: 'N/A', userId: 'N/A' }); // Notify App.tsx of disconnection
    });

    this.socket.on('connect_error', (err) => {
      console.error('Signaling: Socket connection error', err);
    });

    // Listen for messages from the server
    this.socket.on('message', (message: SignalingMessage) => {
      console.log('Signaling: Message received from server', message);
      this.emit('message', message); // Pass message to App.tsx
    });

    // Handle server-side matchmaking events
    this.socket.on('matchFound', (data: { partnerId: string, initiator: boolean, partnerDetails: any }) => { // partnerDetails is crucial
        console.log(`Signaling: Match found with ${data.partnerId}`);
        this.currentRoomId = data.partnerId; // Use partnerId as a unique room identifier for now
        this.emit('message', { 
            type: 'user-joined', 
            roomId: data.partnerId, 
            userId: data.partnerId, 
            isInitiator: data.initiator 
        });
        // We also need to send the partnerDetails to App.tsx/useWebRTC
        // This requires extending the SignalingMessage type or adding a new event.
        // For simplicity, `App.tsx` can derive partner info from the `connectedUser` passed by `realTimeService`.
    });

    this.socket.on('partnerDisconnected', () => {
        console.log('Signaling: Partner disconnected from call');
        this.emit('message', { type: 'user-left', roomId: this.currentRoomId || 'N/A', userId: 'partner' });
        this.currentRoomId = null;
    });

    this.socket.on('callEnded', () => {
        console.log('Signaling: Call ended by partner');
        this.emit('message', { type: 'user-left', roomId: this.currentRoomId || 'N/A', userId: 'partner' });
        this.currentRoomId = null;
    });
  }

  // Event handler registration (used by App.tsx)
  on(event: 'message', handler: SignalingEventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: 'message', handler: SignalingEventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: 'message', message: SignalingMessage) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
  }

  // Client requests to join a matchmaking queue on the server
  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.socket?.connected) {
      console.error('Signaling: Socket not connected, cannot join room');
      return false;
    }
    this.currentRoomId = roomId; // Store the requested room ID for context
    this.currentUserId = userId; // Store the local user ID
    this.socket.emit('findMatch'); // Tell the server to find a match for this user
    console.log(`Signaling: Emitted 'findMatch' for user ${userId}`);
    return true; // We assume success here, the actual match will come via 'matchFound' event
  }

  // Client requests to leave the current conversation/matchmaking queue
  async leaveRoom(roomId: string, userId: string) {
    if (!this.socket?.connected) {
      console.error('Signaling: Socket not connected, cannot leave room');
      return;
    }
    console.log(`Signaling: Emitted 'endCall' for room ${roomId}, user ${userId}`);
    this.socket.emit('endCall'); // Signal the server to end the call/matchmaking
    this.currentRoomId = null;
  }

  // Send WebRTC Offer to server
  async sendOffer(roomId: string, offer: RTCSessionDescriptionInit) {
    if (!this.socket?.connected) return;
    this.socket.emit('offer', { partnerId: roomId, offer: offer }); // roomId is partner's socket ID here
    console.log('Signaling: Sent WebRTC offer');
  }

  // Send WebRTC Answer to server
  async sendAnswer(roomId: string, answer: RTCSessionDescriptionInit) {
    if (!this.socket?.connected) return;
    this.socket.emit('answer', { partnerId: roomId, answer: answer }); // roomId is partner's socket ID here
    console.log('Signaling: Sent WebRTC answer');
  }

  // Send WebRTC ICE Candidate to server
  async sendIceCandidate(roomId: string, candidate: RTCIceCandidateInit) {
    if (!this.socket?.connected) return;
    this.socket.emit('ice-candidate', { partnerId: roomId, candidate: candidate }); // roomId is partner's socket ID here
    console.log('Signaling: Sent WebRTC ICE candidate');
  }

  // No longer needed, as we are always doing real signaling
  setSimulationMode(enabled: boolean) {
    console.warn('SignalingService: setSimulationMode is deprecated and has no effect in real signaling mode.');
  }

  // NEW: Method to send user details to the server upon registration
  public registerUserDetails(userDetails: { name: string; departure: string; arrival: string }): void {
      if (!this.socket?.connected) {
          console.error('Signaling: Socket not connected, cannot register user details.');
          return;
      }
      this.socket.emit('registerUserDetails', userDetails);
      console.log('Signaling: User details sent to server.');
  }

  // NEW: Methods for client to request server debug/simulation (mapped to buttons in App.tsx)
  public debugServerState(): void {
      if (!this.socket?.connected) return;
      this.socket.emit('debugServerState');
  }

  public simulateTwoUsers(): void {
      if (!this.socket?.connected) return;
      this.socket.emit('simulateTwoUsers');
  }

  public purgeAllInactiveUsers(): void {
      if (!this.socket?.connected) return;
      this.socket.emit('purgeAllInactiveUsers');
  }
}

export const signalingService = new SignalingService();