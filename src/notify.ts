import type{SoundMode}from'./types';
export const getSoundMode=():SoundMode=>{const s=localStorage.getItem('soundMode');return s==='VOICE'||s==='BEEP'||s==='MUTE'?s:'VOICE'};
function tone(error=false){try{const C=window.AudioContext||(window as any).webkitAudioContext;const c=new C();const o=c.createOscillator();const g=c.createGain();o.frequency.value=error?220:880;g.gain.setValueAtTime(.12,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.15);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.15)}catch{}}
function speak(text:string){if(!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(text);u.lang='id-ID';u.rate=1;window.speechSynthesis.cancel();window.speechSynthesis.speak(u)}
export function notify(text:string,error=false){const m=getSoundMode();if(m==='MUTE')return;tone(error);if(m==='VOICE')speak(text)}

/**Glitch effect sound untuk QR scan sukses*/
export function playGlitchSound(){try{const C=window.AudioContext||(window as any).webkitAudioContext;const c=new C();const now=c.currentTime;
  // Frekuensi acak untuk efek glitch
  const freqs=[540,720,950,1200,340];
  const duration=.35;
  for(let i=0;i<3;i++){
    const osc=c.createOscillator();const g=c.createGain();const freq=freqs[Math.floor(Math.random()*freqs.length)];
    osc.type=(i%2===0?'square':'sine') as OscillatorType;osc.frequency.setValueAtTime(freq,now+i*.08);
    osc.frequency.exponentialRampToValueAtTime(freq*.4,now+i*.08+.12);
    g.gain.setValueAtTime(.15,now+i*.08);g.gain.exponentialRampToValueAtTime(.001,now+i*.08+.15);
    osc.connect(g);g.connect(c.destination);osc.start(now+i*.08);osc.stop(now+i*.08+.15);
  }
  // Noise gate effect
  const noiseBuffer=c.createBuffer(1,c.sampleRate*.1,c.sampleRate);const noiseData=noiseBuffer.getChannelData(0);
  for(let i=0;i<noiseData.length;i++)noiseData[i]=Math.random()*2-1;
  const noiseSource=c.createBufferSource();noiseSource.buffer=noiseBuffer;
  const noisGain=c.createGain();noisGain.gain.setValueAtTime(.08,now);noisGain.gain.exponentialRampToValueAtTime(.001,now+.12);
  noiseSource.connect(noisGain);noisGain.connect(c.destination);noiseSource.start(now);
}catch{}}

