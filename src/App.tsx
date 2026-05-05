import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Square, RotateCcw, Youtube, Volume2, VolumeX, Music, Plus, Trash2 } from 'lucide-react';

type GameState = 'idle' | 'ticking' | 'exploded';

class BombAudio {
  ctx: AudioContext | null = null;
  fuseNode: AudioBufferSourceNode | null = null;
  fuseGain: GainNode | null = null;

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) this.ctx = new AudioContextClass();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTick() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime); // Lowered volume
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  startFuse() {
    if (!this.ctx) return;
    if (this.fuseNode) this.stopFuse();
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    
    this.fuseNode = this.ctx.createBufferSource();
    this.fuseNode.buffer = noiseBuffer;
    this.fuseNode.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.5;

    this.fuseGain = this.ctx.createGain();
    this.fuseGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.fuseGain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.2); // Lowered volume

    this.fuseNode.connect(filter);
    filter.connect(this.fuseGain);
    this.fuseGain.connect(this.ctx.destination);
    this.fuseNode.start();
  }

  stopFuse() {
    if (!this.ctx) return;
    if (this.fuseGain) {
        this.fuseGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    }
    if (this.fuseNode) {
        this.fuseNode.stop(this.ctx.currentTime + 0.2);
        this.fuseNode = null;
    }
  }

  playExplosion() {
    if (!this.ctx) return;
    this.stopFuse();

    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(3000, this.ctx.currentTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 1.5);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, this.ctx.currentTime); // Lowered volume
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 2.5);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 1);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, this.ctx.currentTime); // Lowered volume
    oscGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 2);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    noise.start();
    osc.start();
    noise.stop(this.ctx.currentTime + 3);
    osc.stop(this.ctx.currentTime + 3);
  }
}
const audioSynth = new BombAudio();

export default function App() {
  const [playlist, setPlaylist] = useState<{id: number, url: string}[]>([
    { id: 1, url: 'https://www.youtube.com/watch?v=4WX58CZ8dPA' } // Monkeys Spinning Monkeys (Always embeddable)
  ]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [inputUrl, setInputUrl] = useState('');
  
  const [gameState, setGameState] = useState<GameState>('idle');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [canStop, setCanStop] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAddUrl = () => {
    if (inputUrl && inputUrl.includes('youtu')) {
      setPlaylist([...playlist, { id: Date.now(), url: inputUrl }]);
      setInputUrl('');
    }
  };

  const handleRemoveUrl = (id: number) => {
    setPlaylist(playlist.filter(p => p.id !== id));
    if (currentTrackIndex >= playlist.length - 1) {
      setCurrentTrackIndex(0);
    }
  };

  const currentYtUrl = playlist[currentTrackIndex]?.url || '';

  const videoId = useMemo(() => {
    if (!currentYtUrl) return null;
    const match = currentYtUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
    return match ? match[1] : null;
  }, [currentYtUrl]);

  const handleStart = () => {
    audioSynth.init();
    setHasInteracted(true);
    setGameState('ticking');
    setCanStop(false);
    
    // minimal delay before allowing manual stop to prevent play() interruption
    if (minPlayTimerRef.current) clearTimeout(minPlayTimerRef.current);
    minPlayTimerRef.current = setTimeout(() => {
      setCanStop(true);
    }, 2000); // Increased safety margin
  };

  const handleExplode = () => {
    setGameState('exploded');
    setCanStop(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (minPlayTimerRef.current) clearTimeout(minPlayTimerRef.current);
    
    audioSynth.playExplosion();
  };

  const handleReset = () => {
    setGameState('idle');
    // Removed automatic track changing on reset to prevent ReactPlayer unmounting and throwing "media was removed"
  };

  useEffect(() => {
    let tickInterval: ReturnType<typeof setInterval>;
    if (gameState === 'ticking') {
        audioSynth.startFuse();
        tickInterval = setInterval(() => {
            audioSynth.playTick();
        }, 1000); // 1 tick per second
    } else {
        audioSynth.stopFuse();
    }
    return () => {
        if (tickInterval) clearInterval(tickInterval);
    };
  }, [gameState]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      audioSynth.stopFuse();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8 font-sans overflow-hidden border-[12px] border-[#FFD97D]">
      
      {/* Title */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-2xl bg-white border-4 border-[#5D4037] rounded-[32px] p-6 shadow-[8px_8px_0px_#5D4037] text-center mt-4 z-10 flex flex-col items-center gap-2"
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-[#FF85A1] rounded-full border-4 border-[#5D4037] flex items-center justify-center shadow-[4px_4px_0px_#5D4037]">
            <span className="text-3xl">💣</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#EE6055]" style={{ textShadow: "3px 3px 0px #FFF, 6px 6px 0px rgba(0,0,0,0.1)" }}>
            ドキドキ！爆弾回し
          </h1>
        </div>
        <p className="text-lg font-bold text-[#5D4037] mt-2 opacity-80">Doki Doki Bomb - Pass it fast!</p>
      </motion.div>

      {/* Main Bomb Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full max-w-xl my-8 bg-white rounded-[40px] border-8 border-[#5D4037] shadow-[12px_12px_0px_#FFD97D] p-8">
        <AnimatePresence mode="wait">
          {gameState === 'idle' && (
            <motion.div key="idle" 
              initial={{ scale: 0.8, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative"
            >
              <BombSVG mood="sleeping" />
              <div className="absolute -top-10 -right-10 bg-white border-4 border-[#5D4037] rounded-2xl p-4 shadow-[4px_4px_0px_#5D4037] rotate-12">
                <p className="font-bold text-xl text-[#5D4037]">Let's Play! ✨</p>
              </div>
            </motion.div>
          )}

          {gameState === 'ticking' && (
            <motion.div key="ticking"
              animate={{ 
                rotate: [-2, 2, -2, 2, 0],
                scale: [1, 1.05, 1, 1.05, 1]
              }}
              transition={{ repeat: Infinity, duration: 0.5 }}
              className="relative"
            >
              <BombSVG mood="panic" />
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }} 
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="absolute -top-4 left-1/2 -translate-x-1/2 w-4 h-4 bg-orange-500 rounded-full blur-[2px]" 
              />
              <div className="absolute -left-10 top-10 bg-[#FFD97D] border-4 border-[#5D4037] rounded-2xl p-4 shadow-[4px_4px_0px_#5D4037] -rotate-12">
                <p className="font-bold text-xl text-[#EE6055] animate-pulse">Hurry!! 💦</p>
              </div>
            </motion.div>
          )}

          {gameState === 'exploded' && (
            <motion.div key="exploded"
              initial={{ scale: 0.5, opacity: 0, rotate: -180 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", bounce: 0.6 }}
              className="relative"
            >
              <motion.div 
                initial={{ scale: 0 }} animate={{ scale: [0, 2, 0], opacity: [1, 0, 0] }} transition={{ duration: 1 }}
                className="absolute inset-0 bg-orange-500 rounded-full blur-3xl z-[-1]"
              />
              <BombSVG mood="dead" />
              <motion.div 
                initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-[120%] bg-white border-4 border-[#5D4037] rounded-full p-4 shadow-[4px_4px_0px_#5D4037] text-center text-nowrap"
              >
                <p className="font-extrabold text-2xl text-[#EE6055]">PENALTY TIME! ☠️</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Control Panel */}
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-2xl bg-[#FF85A1] border-4 border-[#5D4037] rounded-[32px] p-6 shadow-[8px_8px_0px_#5D4037] z-10 flex flex-col gap-6"
      >
        <h3 className="text-xl font-black text-white flex items-center gap-2">🎵 BGM CONTROL</h3>
        {/* URL Input */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-white flex items-center gap-2">
            <Youtube className="w-5 h-5" />
            BGM YouTube URL
          </label>
          <div className="flex bg-white rounded-xl border-4 border-[#5D4037] overflow-hidden shadow-[4px_4px_0px_#5D4037]">
            <div className="px-3 flex items-center justify-center bg-[#E0FBFC] border-r-4 border-[#5D4037]">
              <Music className="w-5 h-5 text-[#5D4037]" />
            </div>
            <input 
              type="text" 
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              disabled={gameState === 'ticking'}
              className="flex-1 p-3 outline-none font-bold text-[#5D4037] disabled:bg-gray-200"
            />
            <button 
              onClick={handleAddUrl}
              disabled={gameState === 'ticking' || !inputUrl}
              className="px-4 bg-[#60D394] hover:bg-[#4eb87e] border-l-4 border-[#5D4037] flex items-center justify-center disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-6 h-6 text-[#5D4037]" />
            </button>
          </div>
          
          {/* Playlist */}
          {playlist.length > 0 && (
            <div className="flex flex-col gap-2 mt-2 max-h-32 overflow-y-auto pr-2">
              {playlist.map((track, idx) => (
                <div key={track.id} className={`flex items-center justify-between bg-white px-3 py-2 rounded-lg border-2 border-[#5D4037] shadow-[2px_2px_0px_#5D4037] ${currentTrackIndex === idx ? 'bg-[#FFD97D]' : ''}`}>
                   <div 
                     className="flex items-center gap-2 overflow-hidden cursor-pointer flex-1"
                     onClick={() => {
                        if (gameState !== 'ticking') {
                          setCurrentTrackIndex(idx);
                        }
                     }}
                   >
                     {currentTrackIndex === idx ? <Play className="w-4 h-4 text-[#EE6055] shrink-0 fill-[#EE6055]" /> : <Music className="w-4 h-4 text-gray-400 shrink-0" />}
                     <span className="text-sm font-bold text-[#5D4037] truncate">{track.url}</span>
                   </div>
                   <button 
                     onClick={() => handleRemoveUrl(track.id)} 
                     disabled={gameState === 'ticking'}
                     className="text-[#EE6055] hover:text-red-700 disabled:opacity-50 shrink-0 ml-2 cursor-pointer p-2"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gameState !== 'ticking' ? (
             <button 
                onClick={gameState === 'exploded' ? handleReset : handleStart}
                className={`flex-1 py-4 px-6 rounded-2xl border-4 border-[#5D4037] font-black text-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[4px_4px_0px_#5D4037] ${
                  gameState === 'exploded' ? 'bg-[#FFD97D] text-[#5D4037]' : 'bg-[#AAF0D1] text-[#5D4037] hover:bg-[#8ee0bc]'
                }`}
              >
                {gameState === 'exploded' ? (
                  <><RotateCcw className="w-8 h-8"/> もう一度！</>
                ) : (
                  <><Play className="w-8 h-8 fill-[#5D4037]" /> 爆弾を渡す！</>
                )}
             </button>
          ) : (
             <button 
                onClick={handleExplode}
                disabled={!canStop}
                className={`flex-1 py-4 px-6 rounded-2xl border-4 border-[#5D4037] font-black text-2xl flex items-center justify-center gap-2 transition-transform shadow-[4px_4px_0px_#5D4037] md:col-span-2 ${
                  !canStop ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-[#EE6055] hover:bg-[#d95248] text-white active:scale-95'
                }`}
              >
               <Square className={`w-8 h-8 ${!canStop ? 'fill-gray-300' : 'fill-white'}`} /> 💥 爆発させる！ (Explode)
             </button>
          )}

        </div>

        {/* Visible YouTube Player for direct interaction */}
        {videoId ? (
          <div className="w-full bg-black rounded-xl overflow-hidden border-4 border-[#5D4037] flex justify-center mt-2 opacity-90 hover:opacity-100 transition-opacity">
            <iframe
              key={`${videoId}-${gameState === 'ticking' ? 'play' : 'stop'}`}
              width="100%"
              height="200"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=${gameState === 'ticking' ? 1 : 0}&enablejsapi=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        ) : currentYtUrl ? (
          <div className="text-gray-500 text-sm mt-4 text-center">無效的 YouTube 網址</div>
        ) : null}
      </motion.div>
    </div>
  );
}

// Q-Version Bomb SVG Component
function BombSVG({ mood }: { mood: 'sleeping' | 'panic' | 'dead' }) {
  return (
    <svg width="250" height="250" viewBox="0 0 250 250" className="drop-shadow-2xl z-10 relative">
      {/* Spark / Fuse */}
      {mood !== 'dead' && (
        <path 
          d="M 125 50 Q 140 20 170 30" 
          fill="transparent" 
          stroke="black" 
          strokeWidth="8" 
          strokeLinecap="round" 
        />
      )}
      
      {mood === 'ticking' && (
         <circle cx="170" cy="30" r="10" fill="red" />
      )}

      {/* Base / Cap */}
      <rect x="100" y="45" width="50" height="25" rx="5" fill="#333" stroke="black" strokeWidth="6" />

      {/* Main Body */}
      <circle cx="125" cy="140" r="85" fill="#1f2937" stroke="black" strokeWidth="8" />

      {/* Highlight (Cute Anime Style) */}
      <ellipse cx="85" cy="100" rx="15" ry="25" fill="rgba(255,255,255,0.2)" transform="rotate(-30 85 100)" />

      {/* Face Logic */}
      {mood === 'sleeping' && (
        <g stroke="white" strokeWidth="6" strokeLinecap="round" fill="transparent">
          {/* Closed Eyes */}
          <path d="M 90 130 Q 100 140 110 130" />
          <path d="M 140 130 Q 150 140 160 130" />
          {/* Zzz */}
          <text x="160" y="80" fill="white" fontSize="24" stroke="none" fontWeight="bold">Z</text>
          <text x="180" y="60" fill="white" fontSize="16" stroke="none" fontWeight="bold">z</text>
          <circle cx="125" cy="155" r="4" fill="pink" stroke="none" />
        </g>
      )}

      {mood === 'panic' && (
        <g strokeLinecap="round">
          {/* Sweats */}
          <path d="M 180 100 Q 185 110 180 120" fill="transparent" stroke="#60a5fa" strokeWidth="6" />
          <path d="M 60 120 Q 55 130 60 140" fill="transparent" stroke="#60a5fa" strokeWidth="6" />
          
          {/* Open Wide Eyes */}
          <circle cx="95" cy="130" r="15" fill="white" stroke="black" strokeWidth="4" />
          <circle cx="95" cy="130" r="5" fill="black" />
          
          <circle cx="155" cy="130" r="15" fill="white" stroke="black" strokeWidth="4" />
          <circle cx="155" cy="130" r="5" fill="black" />

          {/* Squiggly Mouth */}
          <path d="M 110 160 Q 115 150 125 160 T 140 160" fill="transparent" stroke="white" strokeWidth="5" />
        </g>
      )}

      {mood === 'dead' && (
        <g stroke="white" strokeWidth="5" strokeLinecap="round" fill="transparent">
          {/* X Eyes */}
          <path d="M 85 120 L 105 140 M 105 120 L 85 140" />
          <path d="M 145 120 L 165 140 M 165 120 L 145 140" />
          
          {/* Dead Mouth */}
          <path d="M 110 165 Q 125 155 140 165" fill="transparent" stroke="white" strokeWidth="5" />

          {/* Plaster / Bandage */}
          <g fill="white" stroke="black" strokeWidth="3" transform="translate(100, 70) rotate(15)">
            <rect x="0" y="0" width="40" height="15" rx="2" />
            <line x1="10" y1="0" x2="10" y2="15" />
            <line x1="20" y1="0" x2="20" y2="15" />
            <line x1="30" y1="0" x2="30" y2="15" />
          </g>
        </g>
      )}
    </svg>
  );
}

