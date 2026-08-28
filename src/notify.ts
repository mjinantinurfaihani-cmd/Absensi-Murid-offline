import type{SoundMode}from'./types';
export const getSoundMode=():SoundMode=>{const s=localStorage.getItem('soundMode');return s==='VOICE'||s==='BEEP'||s==='MUTE'?s:'VOICE'};
function tone(error=false){try{const C=window.AudioContext||(window as any).webkitAudioContext;const c=new C();const o=c.createOscillator();const g=c.createGain();o.frequency.value=error?220:880;g.gain.setValueAtTime(.12,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.15);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.15)}catch{}}
function speak(text:string){if(!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(text);u.lang='id-ID';u.rate=1;window.speechSynthesis.cancel();window.speechSynthesis.speak(u)}
export function notify(text:string,error=false){const m=getSoundMode();if(m==='MUTE')return;tone(error);if(m==='VOICE')speak(text)}
