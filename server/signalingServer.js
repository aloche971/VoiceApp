// server/signalingServer.js
import { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';

const app = express();
const server = http.createServer(app);

// Créer le serveur WebSocket en lui passant directement le serveur HTTP
const wss = new WebSocketServer({ server });

// Gérer les erreurs du serveur WebSocket
wss.on('error', (error) => {
  console.error('❌ Erreur du serveur WebSocket:', error);
});

// Stockage des salles et des connexions
const rooms = new Map();
const connections = new Map();

wss.on('connection', (ws) => {
  console.log('📱 Nouvelle connexion WebSocket');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Message reçu:', data.type, data.roomId ? `(salle: ${data.roomId})` : '');
      
      switch (data.type) {
        case 'join-room':
          handleJoinRoom(ws, data);
          break;
        case 'leave-room':
          handleLeaveRoom(ws, data);
          break;
        case 'offer':
          handleOffer(ws, data);
          break;
        case 'answer':
          handleAnswer(ws, data);
          break;
        case 'ice-candidate':
          handleIceCandidate(ws, data);
          break;
        default:
          console.log('❓ Type de message inconnu:', data.type);
      }
    } catch (error) {
      console.error('❌ Erreur lors du traitement du message:', error);
    }
  });

  ws.on('close', () => {
    console.log('📱 Connexion WebSocket fermée');
    handleDisconnection(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ Erreur WebSocket:', error);
  });
});

function handleJoinRoom(ws, data) {
  const { roomId, userId } = data;
  
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  
  const room = rooms.get(roomId);
  
  if (room.size >= 2) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Salle pleine'
    }));
    return;
  }
  
  // Ajouter l'utilisateur à la salle
  room.add(userId);
  connections.set(ws, { userId, roomId });
  
  console.log(`👤 ${userId} a rejoint la salle ${roomId} (${room.size}/2)`);
  
  // Confirmer la connexion
  ws.send(JSON.stringify({
    type: 'joined-room',
    roomId,
    userId
  }));
  
  // Si c'est le deuxième utilisateur, notifier le premier
  if (room.size === 2) {
    broadcastToRoom(roomId, {
      type: 'user-joined',
      roomId,
      userId
    }, userId);
  }
}

function handleLeaveRoom(ws, data) {
  const connection = connections.get(ws);
  if (!connection) return;
  
  const { userId, roomId } = connection;
  const room = rooms.get(roomId);
  
  if (room) {
    room.delete(userId);
    console.log(`👤 ${userId} a quitté la salle ${roomId}`);
    
    // Notifier les autres utilisateurs
    broadcastToRoom(roomId, {
      type: 'user-left',
      roomId,
      userId
    }, userId);
    
    // Supprimer la salle si elle est vide
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`🗑️ Salle ${roomId} supprimée (vide)`);
    }
  }
  
  connections.delete(ws);
}

function handleOffer(ws, data) {
  const connection = connections.get(ws);
  if (!connection) return;
  
  const { roomId } = connection;
  console.log(`📤 Transmission de l'offre dans la salle ${roomId}`);
  
  broadcastToRoom(roomId, {
    type: 'offer',
    data: data.offer,
    roomId
  }, connection.userId);
}

function handleAnswer(ws, data) {
  const connection = connections.get(ws);
  if (!connection) return;
  
  const { roomId } = connection;
  console.log(`📤 Transmission de la réponse dans la salle ${roomId}`);
  
  broadcastToRoom(roomId, {
    type: 'answer',
    data: data.answer,
    roomId
  }, connection.userId);
}

function handleIceCandidate(ws, data) {
  const connection = connections.get(ws);
  if (!connection) return;
  
  const { roomId } = connection;
  
  broadcastToRoom(roomId, {
    type: 'ice-candidate',
    data: data.candidate,
    roomId
  }, connection.userId);
}

function handleDisconnection(ws) {
  const connection = connections.get(ws);
  if (connection) {
    handleLeaveRoom(ws, connection);
  }
}

function broadcastToRoom(roomId, message, excludeUserId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  connections.forEach((connection, ws) => {
    if (connection.roomId === roomId && connection.userId !== excludeUserId) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(message));
      }
    }
  });
}

// Endpoint de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    connections: connections.size,
    timestamp: new Date().toISOString()
  });
});

// Démarrer le serveur HTTP sur le port 8080 pour les endpoints REST et WebSocket
const httpPort = 8080;
server.listen(httpPort, () => {
  console.log(`🚀 Serveur de signaling WebRTC démarré sur le port ${httpPort}`);
});