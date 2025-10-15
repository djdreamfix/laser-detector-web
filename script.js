// LaserReceiver Web Pro v5.8 Neon+
// Features: neon UI, full-screen flash on center, Bosch/Leica/Short sounds, robust audio unlocking, orientation bubble

// DOM
const video = document.getElementById('video'), canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn'), stopBtn = document.getElementById('stopBtn');
const thresholdInput = document.getElementById('threshold'), thresholdVal = document.getElementById('thresholdVal');
const laserColor = document.getElementById('laserColor'), soundMode = document.getElementById('soundMode'), soundChoice = document.getElementById('soundChoice');
const volumeInput = document.getElementById('volume'), volumeVal = document.getElementById('volumeVal');
const respInput = document.getElementById('responsiveness'), respVal = document.getElementById('respVal');
const autoAdapt = document.getElementById('autoAdapt'), muteCheckbox = document.getElementById('mute');
const cameraSelect = document.getElementById('cameraSelect');
const settingsBtn = document.getElementById('settingsBtn'), settingsModal = document.getElementById('settingsModal'), closeSettings = document.getElementById('closeSettings');
const testSound = document.getElementById('testSound'), resetBtn = document.getElementById('resetBtn');
const iconUp = document.getElementById('icon-up'), iconCenter = document.getElementById('icon-center'), iconDown = document.getElementById('icon-down');
const fpsEl = document.getElementById('fps'), flash = document.getElementById('flash'), bubble = document.getElementById('bubble');

// settings persistence
const KEY = 'laser_receiver_v5_8_settings';
let settings = { threshold:160, color:'green', soundMode:'real', soundChoice:'bosch', volume:60, responsiveness:60, autoAdapt:true, deviceId:null, mute:false };
try{ const s = JSON.parse(localStorage.getItem(KEY)); if(s) settings = Object.assign(settings,s); }catch(e){}

let currentBeta = 0;            // вертикальний нахил телефона
const tiltFactor = 2.0;         // коефіцієнт зміщення центру
let hasOrientation = false;     // чи доступний сенсор


// apply UI
thresholdInput.value = settings.threshold; thresholdVal.textContent = settings.threshold;
laserColor.value = settings.color; soundMode.value = settings.soundMode; soundChoice.value = settings.soundChoice;
volumeInput.value = settings.volume; volumeVal.textContent = settings.volume;
respInput.value = settings.responsiveness; respVal.textContent = settings.responsiveness;
autoAdapt.checked = settings.autoAdapt; muteCheckbox.checked = settings.mute;

// UI handlers
thresholdInput.oninput = ()=> thresholdVal.textContent = thresholdInput.value;
volumeInput.oninput = ()=> volumeVal.textContent = volumeInput.value;
respInput.oninput = ()=> respVal.textContent = respInput.value;

// camera list
async function listCameras(){ try{ const devices = await navigator.mediaDevices.enumerateDevices(); const cams = devices.filter(d=>d.kind==='videoinput'); cameraSelect.innerHTML=''; cams.forEach((c,i)=>{ const o=document.createElement('option'); o.value=c.deviceId; o.textContent=c.label||`Camera ${i+1}`; cameraSelect.appendChild(o); }); if(settings.deviceId) cameraSelect.value = settings.deviceId; }catch(e){console.warn(e);} }
cameraSelect.onchange = ()=> { settings.deviceId = cameraSelect.value; saveSettings(); if(streamHandle) restartStream(); }

// audio setup
let audioCtx=null, masterGain=null;
let audioReady=false;
function initAudio(){
    if(audioReady) return;
    try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); masterGain = audioCtx.createGain(); masterGain.gain.value = 1; masterGain.connect(audioCtx.destination); audioReady=true; }catch(e){console.warn('Audio init failed',e); audioReady=false;}
}
// fallback short beep
const b64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRAAAAAA/////wAAAP//AAAA//8AAP//AAD//wAA//8AAP//AAD//wAA';
function b64toBlob(b64,type='audio/wav'){ const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return new Blob([u],{type}); }
let fallbackAudio=null;
try{ fallbackAudio = new Audio(URL.createObjectURL(b64toBlob(b64))); fallbackAudio.preload='auto'; }catch(e){fallbackAudio=null;}

// unlock audio on first interaction
function unlockAudioOnUserGesture(){ if(!audioCtx) return; if(audioCtx.state==='running') return; audioCtx.resume().then(()=>{console.log('audio resumed');}).catch(()=>{}); }
document.addEventListener('click', unlockAudioOnUserGesture, {once:true}); document.addEventListener('touchstart', unlockAudioOnUserGesture, {once:true});

// play a single beep according to chosen style
function playBeepOnce(style){
    if(muteCheckbox.checked) return;
    if(audioReady && audioCtx){
        const now = audioCtx.currentTime;
        if(style==='bosch'){
            const o=audioCtx.createOscillator(), g=audioCtx.createGain();
            o.type='triangle'; o.frequency.setValueAtTime(550,now); g.gain.setValueAtTime(0,now);
            o.connect(g); g.connect(masterGain); g.gain.linearRampToValueAtTime(0.06*(volumeInput.value/100), now+0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, now+0.18); o.start(now); o.stop(now+0.22);
        } else if(style==='leica'){
            const o=audioCtx.createOscillator(), g=audioCtx.createGain();
            o.type='sine'; o.frequency.setValueAtTime(900,now); o.connect(g); g.connect(masterGain);
            g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(0.07*(volumeInput.value/100), now+0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, now+0.12); o.start(now); o.stop(now+0.14);
        } else {
            const o=audioCtx.createOscillator(), g=audioCtx.createGain();
            o.type='sine'; o.frequency.setValueAtTime(800,now); o.connect(g); g.connect(masterGain);
            g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(0.08*(volumeInput.value/100), now+0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, now+0.09); o.start(now); o.stop(now+0.1);
        }
    } else if(fallbackAudio){
        try{ fallbackAudio.volume = volumeInput.value/100; fallbackAudio.play().catch(()=>{}); }catch(e){}
    }
}

// continuous center tone
let centerOsc=null, centerGain=null;
function startCenterTone(style){
    if(muteCheckbox.checked) return;
    if(!(audioReady && audioCtx)) return;
    stopCenterTone();
    centerOsc = audioCtx.createOscillator(); centerGain = audioCtx.createGain();
    centerOsc.type = (style==='leica'?'sine':'triangle');
    centerOsc.frequency.setValueAtTime(style==='leica'?900:700, audioCtx.currentTime);
    centerGain.gain.setValueAtTime(0, audioCtx.currentTime);
    centerOsc.connect(centerGain); centerGain.connect(masterGain);
    centerOsc.start();
    centerGain.gain.linearRampToValueAtTime(0.06*(volumeInput.value/100), audioCtx.currentTime+0.05);
}
function stopCenterTone(){ if(centerGain) centerGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime+0.02); if(centerOsc){ try{ centerOsc.stop(audioCtx.currentTime+0.04);}catch(e){} centerOsc=null; centerGain=null; } }

function stopAllSounds(){ stopCenterTone(); clearInterval(window._pingTimer); window._pingTimer=null; if(fallbackAudio) try{ fallbackAudio.pause(); fallbackAudio.currentTime=0;}catch(e){} }

// camera
let streamHandle=null;
async function startStream(deviceId){ stopStream(); try{ streamHandle = await navigator.mediaDevices.getUserMedia({ video: deviceId?{deviceId:{exact:deviceId}}:{facingMode:'environment'}, audio:false }); video.srcObject = streamHandle; await video.play(); canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480; return true;}catch(e){console.error(e);return false;} }
function stopStream(){ if(streamHandle) streamHandle.getTracks().forEach(t=>t.stop()); streamHandle=null; video.srcObject=null; }
async function restartStream(){ await startStream(cameraSelect.value); }

// detection logic
let smoothY=null; let inCenter=false; let lastState='none';
function analyzeFrame(){ if(!video||video.readyState<2) return null; ctx.drawImage(video,0,0,canvas.width,canvas.height); const img = ctx.getImageData(0,0,canvas.width,canvas.height); const data = img.data, w=canvas.width, h=canvas.height; const threshold = parseInt(thresholdInput.value); let sumY=0,count=0; for(let y=0;y<h;y+=2){ for(let x=0;x<w;x+=3){ const i=(y*w+x)*4; const r=data[i], g=data[i+1], b=data[i+2]; if (laserColor.value==='green'){const brightness=0.299*r+0.587*g+0.114*b;if(g>threshold&&g>r*1.8&&g>b*1.5&&b>100&&brightness>160&&Math.abs(g-b)<90&&!(r>120&&g>120&&b>120)){sumY+=y;count++;}} else { if(r>threshold && r>g*1.8 && r>b*1.8){ sumY+=y; count++; } } } } if(count<30) return null; return { y: sumY/count, count }; }

function schedulePings(ratio){
  clearInterval(window._pingTimer);
  window._pingTimer = null;
  stopCenterTone();

  if (soundMode.value==='off' || muteCheckbox.checked) return;
  const style = soundChoice.value || 'bosch';

  if (ratio <= 0.05) {          // у центрі — безперервний звук
    startCenterTone(style);
    flashScreen();
    return;
  }

  const minI = 100, maxI = 1000;
  const interval = Math.round(minI + Math.min(1,ratio)*(maxI-minI));

  // якщо лазер є — пікати, якщо пропав — тиша
  window._pingTimer = setInterval(()=>{
    if(lastState==='none') { stopAllSounds(); clearInterval(window._pingTimer); return; }
    playBeepOnce(style);
  }, interval);
}
let flashTimer=null;
function flashScreen(){ flash.classList.add('show'); flash.classList.remove('hidden'); if(flashTimer) clearTimeout(flashTimer); flashTimer = setTimeout(()=>{ flash.classList.remove('show'); flash.classList.add('hidden'); }, 220); }

function setIcons(state){ iconUp.classList.toggle('active', state==='up'); iconCenter.classList.toggle('active', state==='center'); iconDown.classList.toggle('active', state==='down'); }

function detectLoop(){ if(!streamHandle) return; const s = analyzeFrame(); if(s){ const alpha = 0.2 + (parseInt(respInput.value)/100)*0.75; if(smoothY==null) smoothY = s.y; smoothY = smoothY*alpha + s.y*(1-alpha); const mid = (canvas.height/2) + (currentBeta * tiltFactor); const dist = Math.abs(smoothY-mid); const ratio = Math.min(1, dist/(canvas.height/2)); if(inCenter){ if(ratio>0.15) inCenter=false; } else { if(ratio<0.1) inCenter=true; } const state = inCenter ? 'center' : (smoothY<mid ? 'up' : 'down'); if(state!==lastState){ lastState=state; setIcons(state); stopAllSounds(); schedulePings(ratio); } else { schedulePings(ratio); } } else { lastState='none'; inCenter=false; smoothY=null; setIcons('none'); stopAllSounds(); } requestAnimationFrame(detectLoop); }

async function initOrientation(){
  const maxTilt = 30;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') return;
    }
  } catch(e){}

  window.addEventListener('deviceorientation', ev=>{
    const gx = Math.max(-maxTilt, Math.min(maxTilt, ev.gamma||0));
    const gy = Math.max(-maxTilt, Math.min(maxTilt, ev.beta||0));
    currentBeta = gy;
    const px = (gx/maxTilt)*24;
    const py = (gy/maxTilt)*24;
    bubble.style.transform = `translate(${px}px, ${py}px)`;
  });
  hasOrientation = true;
}

// UI wiring
startBtn.onclick = async ()=>{ // save settings
    settings.threshold = parseInt(thresholdInput.value); settings.color = laserColor.value; settings.soundMode = soundMode.value; settings.soundChoice = soundChoice.value;
    settings.volume = parseInt(volumeInput.value); settings.responsiveness = parseInt(respInput.value); settings.autoAdapt = autoAdapt.checked; settings.deviceId = cameraSelect.value; settings.mute = muteCheckbox.checked;
    localStorage.setItem(KEY, JSON.stringify(settings));
    initAudio(); if(audioCtx && audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
    const ok = await startStream(cameraSelect.value); if(!ok) return alert('Не вдалося відкрити камеру');
    await initOrientation(); startBtn.classList.add('hidden'); stopBtn.classList.remove('hidden'); detectLoop();
};
stopBtn.onclick = ()=>{ stopStream(); stopAllSounds(); startBtn.classList.remove('hidden'); stopBtn.classList.add('hidden'); setIcons('none'); }

settingsBtn.onclick = ()=> settingsModal.classList.remove('hidden'); closeSettings.onclick = ()=>{ settingsModal.classList.add('hidden'); localStorage.setItem(KEY, JSON.stringify(settings)); }
testSound.onclick = ()=> playBeepOnce(soundChoice.value || 'bosch'); resetBtn.onclick = ()=>{ localStorage.removeItem(KEY); location.reload(); }

// initial cameras
listCameras(); document.addEventListener('click', ()=>{ if(audioCtx) audioCtx.resume().catch(()=>{}); }, {once:true});