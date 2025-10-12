// LaserReceiver Web Pro v5.5
// Реактивність (responsiveness) + вибір типу звуку (thin / dull)
// Автор: оновлено для тебе

const video = document.getElementById('video'),
      canvas = document.getElementById('canvas'),
      ctx = canvas.getContext('2d');

const startBtn = document.getElementById('startBtn'),
      stopBtn = document.getElementById('stopBtn'),
      thresholdInput = document.getElementById('threshold'),
      thresholdVal = document.getElementById('thresholdVal'),
      laserColor = document.getElementById('laserColor'),
      volumeInput = document.getElementById('volume'),
      volumeVal = document.getElementById('volumeVal'),
      autoAdapt = document.getElementById('autoAdapt'),
      settingsBtn = document.getElementById('settingsBtn'),
      settingsModal = document.getElementById('settingsModal'),
      closeSettings = document.getElementById('closeSettings'),
      testSound = document.getElementById('testSound'),
      resetBtn = document.getElementById('resetBtn'),
      cameraSelect = document.getElementById('cameraSelect');

const iconUp = document.getElementById('icon-up'),
      iconCenter = document.getElementById('icon-center'),
      iconDown = document.getElementById('icon-down'),
      fpsEl = document.getElementById('fps');

const respInput = document.getElementById('responsiveness'),
      respVal = document.getElementById('respVal'),
      soundType = document.getElementById('soundType');

let stream = null;
let detecting = false;
let lastState = 'none';   // 'up'|'down'|'center'|'none'
let pingTimer = null;
let smoothing = { top:0, center:0, bottom:0 };

// SETTINGS persistence
const SETTINGS_KEY = 'laser_receiver_v5_settings';
let settings = {
  threshold: 160,
  color: 'green',
  soundMode: 'real',
  volume: 60,
  autoAdapt: true,
  responsiveness: 60,
  soundType: 'dull',
  deviceId: null
};

try {
  const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  if (s) settings = Object.assign(settings, s);
} catch(e){}

// apply UI values
thresholdInput.value = settings.threshold; thresholdVal.textContent = settings.threshold;
laserColor.value = settings.color;
volumeInput.value = settings.volume; volumeVal.textContent = settings.volume;
autoAdapt.checked = settings.autoAdapt;
respInput.value = settings.responsiveness; respVal.textContent = settings.responsiveness;
soundType.value = settings.soundType;

// UI handlers
thresholdInput.oninput = ()=> thresholdVal.textContent = thresholdInput.value;
volumeInput.oninput = ()=> volumeVal.textContent = volumeInput.value;
respInput.oninput = ()=> respVal.textContent = respInput.value;
soundType.onchange = ()=> settings.soundType = soundType.value;

// save settings helper
function saveSettings(){
  settings.threshold = parseInt(thresholdInput.value);
  settings.color = laserColor.value;
  settings.soundMode = document.getElementById('soundMode').value || settings.soundMode;
  settings.volume = parseInt(volumeInput.value);
  settings.autoAdapt = autoAdapt.checked;
  settings.responsiveness = parseInt(respInput.value);
  settings.soundType = soundType.value;
  settings.deviceId = cameraSelect.value || settings.deviceId;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// AUDIO: AudioContext oscillator (single) + fallback
let audioCtx = null, osc = null, gain = null, audioOK = false;
let fallbackAudio = null;
const fallbackB64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRAAAAAA/////wAAAP//AAAA//8AAP//AAD//wAA//8AAP//AAD//wAA';

function b64toBlob(b64, type='audio/wav'){
  const bin = atob(b64); const len = bin.length; const arr = new Uint8Array(len);
  for(let i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type});
}

function createFallback(){
  try{
    const blob = b64toBlob(fallbackB64,'audio/wav');
    fallbackAudio = new Audio(URL.createObjectURL(blob));
    fallbackAudio.preload = 'auto';
  }catch(e){ fallbackAudio = null; }
}
createFallback();

function prepareAudio(){
  if (audioOK) return true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    osc = audioCtx.createOscillator();
    gain = audioCtx.createGain();
    osc.type = (settings.soundType === 'thin') ? 'sine' : 'triangle'; // triangle = duller
    osc.frequency.setValueAtTime(700, audioCtx.currentTime);
    gain.gain.value = 0;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    audioOK = true;
    return true;
  } catch(e){
    audioOK = false;
    console.warn('WebAudio unavailable', e);
    return false;
  }
}

function setTone(freq, vol){
  if (audioOK && osc && gain){
    try {
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.cancelScheduledValues(0);
      gain.gain.setValueAtTime(vol * (volumeInput.value/100), audioCtx.currentTime + 0.01);
    } catch(e){}
  } else if (fallbackAudio){
    try { fallbackAudio.volume = volumeInput.value/100; fallbackAudio.play().catch(()=>{}); } catch(e){}
  }
}

function stopTone(){
  if (audioOK && gain){
    try { gain.gain.setValueAtTime(0, audioCtx.currentTime + 0.01); } catch(e){}
  } else if (fallbackAudio) {
    try { fallbackAudio.pause(); fallbackAudio.currentTime = 0; } catch(e){}
  }
}

// CAMERA
async function listCams(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d=>d.kind==='videoinput');
    cameraSelect.innerHTML = '';
    cams.forEach((c,i)=>{ const opt = document.createElement('option'); opt.value = c.deviceId; opt.textContent = c.label || `Camera ${i+1}`; cameraSelect.appendChild(opt); });
    if (settings.deviceId) cameraSelect.value = settings.deviceId;
  }catch(e){ console.warn(e); }
}

cameraSelect.onchange = ()=> { saveSettings(); if (detecting) restartStream(); }

async function startStream(){
  stopStream();
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: settings.deviceId ? { deviceId: { exact: settings.deviceId } } : { facingMode:'environment' }, audio:false });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    return true;
  }catch(e){ console.error('camera start failed', e); return false; }
}

function stopStream(){
  if (stream) stream.getTracks().forEach(t=>t.stop());
  stream = null;
  video.srcObject = null;
}

async function restartStream(){
  await startStream();
}

// DETECTION - returns object { y, count } or null
function detectLaserSample(){
  if (!video || video.readyState < 2) return null;
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  const data = img.data;
  const w = canvas.width, h = canvas.height;
  const threshold = parseInt(thresholdInput.value);
  let sumY = 0, count = 0;
  // sample grid
  for (let y=0; y<h; y+=2){
    for (let x=0; x<w; x+=3){
      const i = (y*w + x)*4;
      const r = data[i], g = data[i+1], b = data[i+2];
      if (laserColor.value === 'green'){
        if (g > threshold && g > r*1.8 && g > b*1.8) { sumY += y; count++; }
      } else {
        if (r > threshold && r > g*1.8 && r > b*1.8) { sumY += y; count++; }
      }
    }
  }
  if (count < 20) return null; // too few pixels => no reliable laser
  return { y: sumY / count, count };
}

// smoothing param mapping:
// UI responsiveness R in [0..100], we map to alpha in [0.2 .. 0.95]
// alpha = 0.2 + (R/100) * 0.75
function getAlphaFromResp(){
  const R = parseInt(respInput.value);
  const alpha = 0.2 + (R/100) * 0.75;
  return Math.max(0.0, Math.min(0.98, alpha));
}

// update icons
function updateIcons(state){
  iconUp.classList.toggle('active', state==='up');
  iconCenter.classList.toggle('active', state==='center');
  iconDown.classList.toggle('active', state==='down');
}

// sound control: interval = 1000 * ratio  (ratio 0..1), center -> continuous
function stopPing(){
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  stopTone();
}

function startPingByRatio(ratio){
  stopPing();
  // if no signal or sound mode off, just return
  if (document.getElementById('soundMode').value === 'off') return;
  // center threshold
  const centerThresh = 0.05; // 5% of half-height
  if (ratio <= centerThresh){
    // continuous tone - choose freq by soundType
    const st = soundType.value || settings.soundType;
    const freq = (st === 'thin') ? 900 : 700; // thin: higher, dull: lower
    setTone(freq, 0.04);
    return;
  }
  // interval maps linearly: ratio=1 -> 1000ms, ratio=0.05 -> 50ms (but we set min)
  const minInterval = 60; // ms
  const maxInterval = 1000; // ms at edge
  const interval = Math.round(minInterval + Math.min(1, ratio) * (maxInterval - minInterval));
  // schedule repeated beeps at computed interval
  pingTimer = setInterval(()=>{
    const st = soundType.value || settings.soundType;
    const freq = (st === 'thin') ? 950 : 600;
    setTone(freq, 0.045);
    // short beep: stop after ~90ms
    setTimeout(()=> stopTone(), 90);
  }, interval);
}

// main loop
let fpsCount = 0, fpsTime = performance.now();
async function mainLoop(){
  if (!detecting) return;
  const sample = detectLaserSample();
  if (sample){
    // compute current measured Y and update smoothed values
    const alpha = getAlphaFromResp();
    // convert to per-zone smoothing by location: we keep smoothing.center as representation
    // simple approach: compute center membership based on sample.y
    const h = canvas.height;
    const mid = h/2;
    // we update smoothing.center toward sample count if sample is near center, etc.
    const topVal = (sample.y < h/3) ? sample.count : 0;
    const centerVal = (sample.y >= h/3 && sample.y < 2*h/3) ? sample.count : 0;
    const bottomVal = (sample.y >= 2*h/3) ? sample.count : 0;
    smoothing.top = smoothing.top * alpha + topVal * (1 - alpha);
    smoothing.center = smoothing.center * alpha + centerVal * (1 - alpha);
    smoothing.bottom = smoothing.bottom * alpha + bottomVal * (1 - alpha);

    // determine state by which smoothed zone is strongest
    const strongest = Math.max(smoothing.top, smoothing.center, smoothing.bottom);
    let state = 'none';
    if (strongest < 5) state = 'none';
    else {
      if (smoothing.center >= strongest * 1.1 && smoothing.center > smoothing.top && smoothing.center > smoothing.bottom) state = 'center';
      else if (smoothing.top === strongest) state = 'up';
      else if (smoothing.bottom === strongest) state = 'down';
    }

    // compute geometric ratio to center using measured y
    const dist = Math.abs(sample.y - mid);
    const ratio = Math.min(1, dist / (h/2)); // 0..1

    // if state changed => update icons and sound
    if (state !== lastState){
      lastState = state;
      updateIcons(state);
      if (state === 'none') stopPing();
      else startPingByRatio(ratio);
    } else {
      // adjust ping interval if still same state (reschedule)
      if (state !== 'none') startPingByRatio(ratio);
    }
  } else {
    // no reliable sample => silence
    if (lastState !== 'none'){
      lastState = 'none';
      updateIcons('none');
      stopPing();
    }
  }

  // fps
  fpsCount++;
  const now = performance.now();
  if (now - fpsTime > 500){
    fpsEl.textContent = Math.round(fpsCount * 1000 / (now - fpsTime)) + ' fps';
    fpsCount = 0; fpsTime = now;
  }

  requestAnimationFrame(mainLoop);
}

// START/STOP wiring
startBtn.onclick = async () => {
  // read and save settings
  saveSettings();
  await listCams();
  const ok = await startStream();
  if (!ok) return alert('Не вдалося запустити камеру');
  // prepare audio on user gesture
  settings.soundType = soundType.value || settings.soundType;
  prepareAudio();
if (audioCtx) {
  try {
    audioCtx.resume().then(() => console.log("Audio resumed"));
  } catch(e) {
    console.warn("Resume failed", e);
  }
}  detecting = true;
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  mainLoop();
};

stopBtn.onclick = () => {
  detecting = false;
  stopStream();
  stopPing();
  updateIcons('none');
  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
};

// settings modal
settingsBtn.onclick = ()=> settingsModal.classList.remove('hidden');
closeSettings.onclick = ()=> { settingsModal.classList.add('hidden'); saveSettings(); };
testSound.onclick = ()=> {
  saveSettings();
  prepareAudio();
  if (audioCtx) audioCtx.resume().catch(()=>{});
  // short test
  const st = soundType.value || settings.soundType;
  const freq = (st === 'thin') ? 950 : 600;
  setTone(freq, 0.04);
  setTimeout(()=> stopTone(), 220);
};
resetBtn.onclick = ()=> { localStorage.removeItem(SETTINGS_KEY); location.reload(); };

// device orientation bubble (unchanged)
window.addEventListener('deviceorientation', ev=>{
  const bub = document.getElementById('bubble');
  const maxTilt = 30;
  const gx = Math.max(-maxTilt, Math.min(maxTilt, ev.gamma || 0));
  const gy = Math.max(-maxTilt, Math.min(maxTilt, ev.beta || 0));
  const px = (gx / maxTilt) * 20, py = (gy / maxTilt) * 20;
  if (bub) bub.style.transform = `translate(${px}px, ${py}px)`;
});

// initial camera list
listCams();

// ensure we stop audio on unload
window.addEventListener('beforeunload', ()=>{
  saveSettings();
  try { if (audioCtx) audioCtx.close(); } catch(e){}
});