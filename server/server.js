const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuration CORS pour permettre les connexions depuis votre app
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:5173", "https://helpful-horse-1eee58.netlify.app"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Stockage des salles en mémoire
const rooms = new Map();

// Route de santé
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Gestion des connexions WebSocket
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Nouvelle connexion: ${socket.id}`);

  // Rejoindre une salle
  socket.on('join-room', (data) => {
    const { roomId, userId } = data;
    console.log(`[${new Date().toISOString()}] ${userId} tente de rejoindre la salle ${roomId}`);

    // Créer la salle si elle n'existe pas
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const room = rooms.get(roomId);
    
    // Vérifier si la salle n'est pas pleine (max 2 utilisateurs)
    if (room.size >= 2) {
      socket.emit('join-error', { message: 'Salle pleine' });
      return;
    }

    // Ajouter l'utilisateur à la salle
    room.add(socket.id);
    socket.join(roomId);
    socket.userId = userId;
    socket.roomId = roomId;

    console.log(`[${new Date().toISOString()}] ${userId} a rejoint la salle ${roomId} (${room.size}/2)`);

    // Confirmer la connexion
    socket.emit('joined-room', { roomId, userId, isHost: room.size === 1 });

    // Notifier les autres utilisateurs de la salle
    if (room.size === 2) {
      socket.to(roomId).emit('user-joined', { userId });
      console.log(`[${new Date().toISOString()}] Salle ${roomId} complète - début de la négociation WebRTC`);
    }
  });

  // Transmettre une offre WebRTC
  socket.on('offer', (data) => {
    const { roomId, offer } = data;
    console.log(`[${new Date().toISOString()}] Offre WebRTC reçue pour la salle ${roomId}`);
    socket.to(roomId).emit('offer', { offer, from: socket.userId });
  });

  // Transmettre une réponse WebRTC
  socket.on('answer', (data) => {
    const { roomId, answer } = data;
    console.log(`[${new Date().toISOString()}] Réponse WebRTC reçue pour la salle ${roomId}`);
    socket.to(roomId).emit('answer', { answer, from: socket.userId });
  });

  // Transmettre un candidat ICE
  socket.on('ice-candidate', (data) => {
    const { roomId, candidate } = data;
    console.log(`[${new Date().toISOString()}] Candidat ICE reçu pour la salle ${roomId}`);
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.userId });
  });

  // Gestion de la déconnexion
  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Déconnexion: ${socket.id}`);
    
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.delete(socket.id);
        
        // Notifier les autres utilisateurs
        socket.to(socket.roomId).emit('user-left', { userId: socket.userId });
        
        // Supprimer la salle si elle est vide
        if (room.size === 0) {
          rooms.delete(socket.roomId);
          console.log(`[${new Date().toISOString()}] Salle ${socket.roomId} supprimée`);
        }
      }
    }
  });

  // Quitter une salle manuellement
  socket.on('leave-room', () => {
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.delete(socket.id);
        socket.to(socket.roomId).emit('user-left', { userId: socket.userId });
        socket.leave(socket.roomId);
        
        if (room.size === 0) {
          rooms.delete(socket.roomId);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Serveur de signaling démarré sur le port ${PORT}`);
  console.log(`[${new Date().toISOString()}] URL: http://localhost:${PORT}`);
});