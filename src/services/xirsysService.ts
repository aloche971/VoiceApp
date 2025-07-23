// Service pour gérer les serveurs ICE Xirsys
export interface XirsysIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface XirsysResponse {
  iceServers: XirsysIceServer[];
}

class XirsysService {
  private readonly secretId = 'aloche';
  private readonly secretToken = 'f324b37e-4650-11f0-af35-96dd14091898';
  private readonly apiUrl = 'https://global.xirsys.net/_turn/testApp';

  async getIceServers(): Promise<RTCIceServer[]> {
    try {
      // Encode les identifiants en Base64 pour l'authentification
      const auth = btoa(`${this.secretId}:${this.secretToken}`);

      const response = await fetch(this.apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Xirsys API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Gère la structure de réponse Xirsys
      let iceServers: XirsysIceServer[] = [];
      if (data?.v?.iceServers) {
        iceServers = data.v.iceServers;
      } else if (data?.iceServers) {
        iceServers = data.iceServers;
      } else {
        throw new Error('Format de réponse Xirsys inattendu');
      }

      // Convertit au format RTCIceServer standard
      const rtcIceServers: RTCIceServer[] = iceServers.map(server => {
        const rtcServer: RTCIceServer = {
          urls: Array.isArray(server.urls) ? server.urls : [server.urls]
        };

        if (server.username) {
          rtcServer.username = server.username;
        }
        if (server.credential) {
          rtcServer.credential = server.credential;
        }

        return rtcServer;
      }).filter(server => {
        // Filtre les serveurs avec des URLs undefined ou null
        if (!server.urls) return false;
        if (Array.isArray(server.urls)) {
          return server.urls.every(url => url && typeof url === 'string');
        }
        return typeof server.urls === 'string';
      });

      return rtcIceServers;
    } catch (error) {
      console.error('Erreur lors de la récupération des serveurs ICE Xirsys:', error);
      
      // Fallback vers les serveurs STUN publics
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ];
    }
  }
}

export const xirsysService = new XirsysService();