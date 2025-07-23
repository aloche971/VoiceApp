# Serveur de Signaling VoiceConnect

Ce serveur gère les connexions WebRTC entre les utilisateurs de VoiceConnect.

## Installation

```bash
cd server
npm install
```

## Démarrage

### Mode développement
```bash
npm run dev
```

### Mode production
```bash
npm start
```

Le serveur démarre sur le port 3001 par défaut.

## Déploiement

### Option 1: Railway
1. Créez un compte sur [Railway](https://railway.app)
2. Connectez votre repository GitHub
3. Railway détectera automatiquement le serveur Node.js
4. Le serveur sera accessible via une URL publique

### Option 2: Render
1. Créez un compte sur [Render](https://render.com)
2. Créez un nouveau "Web Service"
3. Connectez votre repository
4. Configurez le build command: `cd server && npm install`
5. Configurez le start command: `cd server && npm start`

### Option 3: Heroku
```bash
# Installer Heroku CLI
heroku create voiceconnect-signaling
git subtree push --prefix server heroku main
```

## Variables d'environnement

- `PORT`: Port du serveur (défaut: 3001)

## API

### WebSocket Events

- `join-room`: Rejoindre une salle
- `offer`: Envoyer une offre WebRTC
- `answer`: Envoyer une réponse WebRTC
- `ice-candidate`: Envoyer un candidat ICE
- `leave-room`: Quitter une salle

### HTTP Endpoints

- `GET /health`: Vérifier l'état du serveur