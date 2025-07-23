import React, { useRef, useEffect, useState } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';

interface AudioSimulatorProps {
  isConnected: boolean;
  isMuted: boolean;
  onVolumeChange?: (volume: number) => void;
}

export const AudioSimulator: React.FC<AudioSimulatorProps> = ({
  isConnected,
  isMuted,
  onVolumeChange
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [showControls, setShowControls] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (isConnected && !audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('AudioContext non supporté');
      }
    }

    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [isConnected]);

  const startAudio = () => {
    if (!audioContextRef.current) return;

    try {
      // Créer un oscillateur pour simuler une voix
      oscillatorRef.current = audioContextRef.current.createOscillator();
      gainNodeRef.current = audioContextRef.current.createGain();

      // Configuration pour simuler une voix humaine
      oscillatorRef.current.type = 'sawtooth';
      oscillatorRef.current.frequency.setValueAtTime(150, audioContextRef.current.currentTime);
      
      // Modulation de fréquence pour simuler la parole
      const lfo = audioContextRef.current.createOscillator();
      const lfoGain = audioContextRef.current.createGain();
      lfo.frequency.setValueAtTime(2, audioContextRef.current.currentTime);
      lfoGain.gain.setValueAtTime(20, audioContextRef.current.currentTime);
      
      lfo.connect(lfoGain);
      lfoGain.connect(oscillatorRef.current.frequency);
      
      // Configuration du volume
      gainNodeRef.current.gain.setValueAtTime(isMuted ? 0 : volume, audioContextRef.current.currentTime);
      
      // Connexion audio
      oscillatorRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(audioContextRef.current.destination);
      
      // Démarrage
      oscillatorRef.current.start();
      lfo.start();
      setIsPlaying(true);
    } catch (error) {
      console.warn('Erreur lors du démarrage de l\'audio simulé:', error);
    }
  };

  const stopAudio = () => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
        oscillatorRef.current = null;
      } catch (error) {
        // Ignore les erreurs de déconnexion
      }
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const toggleAudio = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      startAudio();
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (gainNodeRef.current && !isMuted) {
      gainNodeRef.current.gain.setValueAtTime(newVolume, audioContextRef.current!.currentTime);
    }
    onVolumeChange?.(newVolume);
  };

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setValueAtTime(isMuted ? 0 : volume, audioContextRef.current!.currentTime);
    }
  }, [isMuted, volume]);

  if (!isConnected) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-blue-900 text-sm">Simulation Audio</h3>
        <button
          onClick={() => setShowControls(!showControls)}
          className="text-blue-600 hover:text-blue-800 text-xs"
        >
          {showControls ? 'Masquer' : 'Afficher'} contrôles
        </button>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleAudio}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isPlaying 
                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? 'Arrêter' : 'Tester'} audio</span>
          </button>
          
          <div className="flex items-center space-x-2">
            {isMuted ? <VolumeX className="w-4 h-4 text-gray-400" /> : <Volume2 className="w-4 h-4 text-blue-600" />}
            <span className="text-xs text-gray-600">
              {isMuted ? 'Muet' : `${Math.round(volume * 100)}%`}
            </span>
          </div>
        </div>
        
        {showControls && (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-600">Volume:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
              disabled={isMuted}
            />
          </div>
        )}
      </div>
      
      <p className="text-xs text-blue-700 mt-2">
        💡 Ceci simule l'audio d'un contact distant. Dans une vraie conversation, vous entendriez la voix de votre interlocuteur.
      </p>
    </div>
  );
};