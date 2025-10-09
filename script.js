// script.js — Laser Receiver Web Pro
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cameraSelect = document.getElementById('cameraSelect');
const startBtn = document.getElementById('startBtn');
const thresholdInput = document.getElementById('threshold');
const laserColor = document.getElementById('laserColor');
const directionEl = document.getElementById('direction');
const hintEl = document.getElementById('hint');
const soundBtn = document.getElementById('soundBtn');
const ledGreen = document.getElementById('led-green');
const ledRed = document.getElementById('led-red');
const segTop = document.getElementById('seg-top');
const segCenter = document.getElementById('seg-center');
const segBottom = document.getElementById('seg-bottom');

let stream = null;
let detecting = false;
let soundEnabled = true;
let beepHigh = null, beepLow = null, beepConst = null;

// settings
const SETTINGS_KEY = 'laser_receiver_settings';
let settings = { threshold:180, color:'red', deviceId:null, sound:true };
try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if(s) settings = Object.assign(settings,s); } catch(e){}

thresholdInput.value = settings.threshold;
laserColor.value = settings.color;
soundEnabled = settings.sound;
updateSoundButton();

// tone helpers
function makeTone(freq){
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination); o.start();
    return {ctx:audioCtx, osc:o, gain:g};
  } catch(e){ return null; }
}
function setToneVolume(tone, v){
  if(!tone) return;
  try { tone.gain.gain.setValueAtTime(v, tone.ctx.currentTime + 0.01); } catch(e){}
}
function stopTone(tone){ if(!tone) return; try{ tone.gain.gain.setValueAtTime(0, tone.ctx.currentTime + 0.01); } catch(e){} }

beepHigh = makeTone(800);
beepLow = makeTone(380);
beepConst = makeTone(600);

function updateSoundButton(){
  soundBtn.textContent = soundEnabled ? '🔊 Звук: увімк.' : '🔇 Звук: вимк.';
  settings.sound = soundEnabled;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
soundBtn.onclick = ()=>{
  soundEnabled = !soundEnabled; if(!soundEnabled){ stopTone(beepHigh); stopTone(beepLow); stopTone(beepConst); ledGreen.classList.remove('led-on'); ledRed.classList.remove('led-on'); }
  updateSoundButton();
};

thresholdInput.oninput = ()=>{ settings.threshold = parseInt(thresholdInput.value); localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); };
laserColor.onchange = ()=>{ settings.color = laserColor.value; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); };

async function listCameras(){
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d=>d.kind==='videoinput');
    cameraSelect.innerHTML = '';
    cams.forEach((c,i)=>{
      const opt = document.createElement('option');
      opt.value = c.deviceId;
      opt.textContent = c.label || `Camera ${i+1}`;
      cameraSelect.appendChild(opt);
    });
    if(settings.deviceId) cameraSelect.value = settings.deviceId;
  } catch(e){ console.warn(e); }
}
cameraSelect.onchange = ()=>{ settings.deviceId = cameraSelect.value; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); if(detecting) restartStream(); };

async function startStream(deviceId){
  stopStream();
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode:'environment' }, audio:false });
    video.srcObject = stream; await video.play();
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    return true;
  } catch(e){ console.error('camera start failed', e); return false; }
}
function stopStream(){ if(stream) stream.getTracks().forEach(t=>t.stop()); stream=null; video.srcObject=null; }
async function restartStream(){ await startStream(cameraSelect.value); }

startBtn.onclick = async ()=>{
  if(detecting){
    detecting=false; startBtn.textContent='Старт'; directionEl.textContent='Зупинено'; stopStream();
    stopTone(beepHigh); stopTone(beepLow); stopTone(beepConst); ledGreen.classList.remove('led-on'); ledRed.classList.remove('led-on');
    segTop.style.background='rgba(255,255,255,0.03)'; segCenter.style.background='rgba(255,255,255,0.03)'; segBottom.style.background='rgba(255,255,255,0.03)';
    return;
  }
  await listCameras();
  const ok = await startStream(cameraSelect.value);
  if(!ok){ directionEl.textContent='Помилка камери'; return; }
  detecting=true; startBtn.textContent='Стоп'; directionEl.textContent='Пошук...'; detectLoop();
};

// analysis: vertical slot split into top/center/bottom zones
function analyzeFrame(){
  if(!video || video.readyState < 2) return null;
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  const data = img.data; const w = canvas.width, h = canvas.height;
  const slotW = Math.floor(w*0.28); const cx = Math.floor(w/2); const left = Math.floor(cx - slotW/2); const right = left + slotW;
  const zoneH = Math.max(4, Math.floor(h*0.12));
  const centerY = Math.floor(h/2);
  const topY = Math.floor(centerY - zoneH*1.5);
  const bottomY = Math.floor(centerY + zoneH*0.5);
  const threshold = parseInt(thresholdInput.value);
  const color = laserColor.value;

  function zoneCount(yStart){
    let cnt = 0; const step = Math.max(2, Math.floor((w*h)/80000));
    for(let y=yStart; y<yStart+zoneH; y++){
      for(let x=left; x<right; x+=3){
        const i=(y*w + x)*4;
        const r=data[i], g=data[i+1], b=data[i+2];
        if(color==='red' && r>threshold && r>g*1.6 && r>b*1.6) cnt++;
        if(color==='green' && g>threshold && g>r*1.6 && g>b*1.6) cnt++;
      }
    }
    return cnt;
  }
  const topC = zoneCount(Math.max(0,topY));
  const centerC = zoneCount(Math.max(0,centerY));
  const bottomC = zoneCount(Math.max(0,bottomY));
  return {topC,centerC,bottomC};
}

let lastState='neutral', blinkTimer=null;
function setLEDs(state){
  ledGreen.classList.remove('led-on'); ledRed.classList.remove('led-on');
  segTop.style.background='rgba(255,255,255,0.03)'; segCenter.style.background='rgba(255,255,255,0.03)'; segBottom.style.background='rgba(255,255,255,0.03)';
  if(state==='center'){ ledGreen.classList.add('led-on'); segCenter.style.background='linear-gradient(90deg, rgba(0,255,102,0.12), rgba(0,255,102,0.06))'; }
  else if(state==='up'){ ledRed.classList.add('led-on'); segTop.style.background='linear-gradient(90deg, rgba(255,77,77,0.12), rgba(255,77,77,0.06))'; }
  else if(state==='down'){ ledRed.classList.add('led-on'); segBottom.style.background='linear-gradient(90deg, rgba(255,77,77,0.12), rgba(255,77,77,0.06))'; }
}

function visualLedWhenSoundOff(state){
  clearInterval(blinkTimer);
  if(soundEnabled){ segTop.style.opacity=1; segCenter.style.opacity=1; segBottom.style.opacity=1; return; }
  if(state==='center'){ let t=0; blinkTimer=setInterval(()=>{ t=(t+1)%40; segCenter.style.opacity = 0.6 + 0.4*Math.abs(Math.sin(t/6)); },80); }
  else if(state==='up' || state==='down'){ let seg = state==='up'?segTop:segBottom; let t=0; blinkTimer=setInterval(()=>{ t=(t+1)%30; seg.style.opacity = 0.5 + 0.5*Math.abs(Math.sin(t/4)); },70); }
}

function detectLoop(){
  if(!detecting) return;
  const r = analyzeFrame();
  if(!r){ requestAnimationFrame(detectLoop); return; }
  const total = r.topC + r.centerC + r.bottomC;
  const strongest = Math.max(r.topC,r.centerC,r.bottomC);
  const minPixels = 6; const centerBias = 1.3;
  let state = 'neutral';
  if(total >= minPixels){
    if(r.centerC >= strongest*centerBias && r.centerC > r.topC && r.centerC > r.bottomC) state='center';
    else if(r.topC === strongest) state='up';
    else if(r.bottomC === strongest) state='down';
  } else state='neutral';

  if(state !== lastState){
    lastState = state;
    if(state==='center'){
      directionEl.textContent='РІВЕНЬ'; directionEl.className='status level'; hintEl.textContent='Лазер у центрі — фіксація';
      if(soundEnabled) setToneVolume(beepConst,0.02); visualLedWhenSoundOff('center'); setLEDs('center');
    } else if(state==='up'){
      directionEl.textContent='ВИЩЕ → опусти приймач'; directionEl.className='status up'; hintEl.textContent='Лазер вище центру';
      if(soundEnabled){ setToneVolume(beepHigh,0.02); } visualLedWhenSoundOff('up'); setLEDs('up');
    } else if(state==='down'){
      directionEl.textContent='НИЖЧЕ → підніми приймач'; directionEl.className='status up'; hintEl.textContent='Лазер нижче центру';
      if(soundEnabled){ setToneVolume(beepLow,0.02); } visualLedWhenSoundOff('down'); setLEDs('down');
    } else {
      directionEl.textContent='Очікування...'; directionEl.className='status neutral'; hintEl.textContent='Наведiть лазер на вікно приймача';
      stopTone(beepHigh); stopTone(beepLow); stopTone(beepConst); visualLedWhenSoundOff('neutral'); setLEDs('neutral');
    }
  }
  requestAnimationFrame(detectLoop);
}

function setToneVolume(tone,v){ if(!tone) return; try{ tone.gain.gain.setValueAtTime(v, tone.ctx.currentTime + 0.01); }catch(e){} }
function stopTone(tone){ if(!tone) return; try{ tone.gain.gain.setValueAtTime(0, tone.ctx.currentTime + 0.01); }catch(e){} }

// init
listCameras();
window.addEventListener('beforeunload', ()=>{ stopStream(); });
