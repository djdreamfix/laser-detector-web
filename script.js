// LaserReceiver Web Pro v5 — main script
const video = document.getElementById('video'), canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn'), stopBtn = document.getElementById('stopBtn');
const thresholdInput = document.getElementById('threshold'), thresholdVal = document.getElementById('thresholdVal');
const laserColor = document.getElementById('laserColor'), soundMode = document.getElementById('soundMode');
const volumeInput = document.getElementById('volume'), volumeVal = document.getElementById('volumeVal');
const autoAdapt = document.getElementById('autoAdapt'), settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal'), closeSettings = document.getElementById('closeSettings');
const testSound = document.getElementById('testSound'), resetBtn = document.getElementById('resetBtn'), cameraSelect = document.getElementById('cameraSelect');
const iconUp = document.getElementById('icon-up'), iconCenter = document.getElementById('icon-center'), iconDown = document.getElementById('icon-down');
const bubble = document.getElementById('bubble'), fpsEl = document.getElementById('fps');

let stream = null, detecting = false;
const SETTINGS_KEY = 'laser_receiver_v5';
let settings = { threshold:160, color:'green', soundMode:'real', volume:60, autoAdapt:true, deviceId:null };

// load saved
try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if(s) settings = Object.assign(settings,s); } catch(e){}

// apply UI defaults
thresholdInput.value = settings.threshold; thresholdVal.textContent = settings.threshold;
laserColor.value = settings.color; soundMode.value = settings.soundMode;
volumeInput.value = settings.volume; volumeVal.textContent = settings.volume;
autoAdapt.checked = settings.autoAdapt;

// events
thresholdInput.oninput = ()=> thresholdVal.textContent = thresholdInput.value;
volumeInput.oninput = ()=> volumeVal.textContent = volumeInput.value;

// audio: WebAudio with fallback
let audioCtx = null, audioOK = false;
let oscHigh = null, oscLow = null, oscCenter = null;
let fallbackAudio = null;
const fallbackB64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRAAAAAA/////wAAAP//AAAA//8AAP//AAD//wAA//8AAP//AAD//wAA'; // tiny beep

function b64toBlob(b64, type='audio/wav'){ const bin = atob(b64); const len = bin.length; const arr = new Uint8Array(len); for(let i=0;i<len;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr], {type}); }
function createFallback(){ try{ const blob = b64toBlob(fallbackB64); fallbackAudio = new Audio(URL.createObjectURL(blob)); fallbackAudio.preload = 'auto'; }catch(e){ fallbackAudio = null; } }
createFallback();

function prepareAudio(){
  if(audioOK) return true;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function mk(freq){ const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sine'; o.frequency.value = freq; g.gain.value = 0; o.connect(g); g.connect(audioCtx.destination); o.start(); return {o,g}; }
    oscHigh = mk(880); oscLow = mk(380); oscCenter = mk(700);
    audioOK = true;
    return true;
  } catch(e) { audioOK = false; return false; }
}
function setTone(obj, vol){ if(!audioOK || !obj) return; try{ obj.g.gain.cancelScheduledValues(0); obj.g.gain.setValueAtTime(vol*(volumeInput.value/100), audioCtx.currentTime + 0.01); }catch(e){} }
function stopTone(obj){ if(!audioOK || !obj) return; try{ obj.g.gain.setValueAtTime(0, audioCtx.currentTime + 0.01); }catch(e){} }
function playFallback(){ if(!fallbackAudio) return; fallbackAudio.volume = volumeInput.value/100; fallbackAudio.play().catch(()=>{}); }

// camera list
async function listCameras(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d=>d.kind==='videoinput');
    cameraSelect.innerHTML = '';
    cams.forEach((c,i)=>{ const o = document.createElement('option'); o.value = c.deviceId; o.textContent = c.label || `Camera ${i+1}`; cameraSelect.appendChild(o); });
    if(settings.deviceId) cameraSelect.value = settings.deviceId;
  }catch(e){ console.warn(e); }
}

cameraSelect.onchange = ()=> { settings.deviceId = cameraSelect.value; saveSettings(); if(detecting) restartStream(); }

async function startStream(deviceId){
  stopStream();
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode:'environment' }, audio:false });
    video.srcObject = stream; await video.play();
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    return true;
  }catch(e){ console.error('camera start fail', e); return false; }
}
function stopStream(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; } video.srcObject = null; }
async function restartStream(){ await startStream(cameraSelect.value); }

// detection logic
let smoothing = { top:0, center:0, bottom:0 }, lastState = 'neutral', pingTimer = null;
function analyzeFrame(){
  if(!video || video.readyState < 2) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  const data = img.data; const w = canvas.width, h = canvas.height;
  const tH = Math.floor(h/3), cH = Math.floor(h/3), bH = h - tH - cH;
  const base = parseInt(thresholdInput.value);
  let ambient = 0, samp = 0;
  for(let i=0;i<data.length;i+=4*300){ ambient += (0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]); samp++; }
  ambient = samp ? Math.round(ambient/samp) : 120;
  let threshold = base;
  if(autoAdapt.checked && laserColor.value === 'green') threshold = Math.max(100, Math.min(240, Math.round(base - (ambient-120)*0.2)));
  function countZone(yStart, yCount){
    let cnt = 0;
    for(let y=yStart;y<yStart+yCount;y+=2){
      for(let x=0;x<w;x+=4){
        const i = (y*w + x)*4; const r = data[i], g = data[i+1], b = data[i+2];
        if(laserColor.value === 'green'){ if(g>threshold && g>r*1.8 && g>b*1.8) cnt++; }
        else { if(r>threshold && r>g*1.8 && r>b*1.8) cnt++; }
      }
    }
    return cnt;
  }
  const top = countZone(0, tH), center = countZone(tH, cH), bottom = countZone(tH + cH, bH);
  smoothing.top = smoothing.top*0.7 + top*0.3;
  smoothing.center = smoothing.center*0.7 + center*0.3;
  smoothing.bottom = smoothing.bottom*0.7 + bottom*0.3;
  return { top: smoothing.top, center: smoothing.center, bottom: smoothing.bottom, ambient, threshold };
}

// ping logic: realistic variable frequency
function stopPing(){
  if(pingTimer){ clearInterval(pingTimer); pingTimer = null; }
  stopTone(oscHigh); stopTone(oscLow); stopTone(oscCenter);
  if(fallbackAudio){ try{ fallbackAudio.pause(); fallbackAudio.currentTime = 0; }catch(e){} }
}
function startPing(distanceRatio){
  stopPing();
  if(soundMode.value === 'off') return;
  if(soundMode.value === 'simple'){
    if(distanceRatio < 0.1){ if(prepareAudio()) setTone(oscCenter, 0.02); else playFallback(); }
    else if(distanceRatio < 0.4){ pingTimer = setInterval(()=>{ if(prepareAudio()){ setTone(oscHigh,0.02); setTimeout(()=>stopTone(oscHigh),80);} else playFallback(); }, 500); }
    else { pingTimer = setInterval(()=>{ if(prepareAudio()){ setTone(oscLow,0.02); setTimeout(()=>stopTone(oscLow),80);} else playFallback(); }, 1100); }
    return;
  }
  // realistic mode
  if(distanceRatio <= 0.03){ if(prepareAudio()) setTone(oscCenter, 0.03); else { pingTimer = setInterval(()=>playFallback(), 60); } return; }
  const minI = 250, maxI = 1200;
  const interval = Math.round(minI + Math.min(1, distanceRatio)*(maxI - minI));
  pingTimer = setInterval(()=>{ if(prepareAudio()){ setTone(oscCenter, 0.02); setTimeout(()=>stopTone(oscCenter), 90);} else playFallback(); }, interval);
}

function updateIcons(state){
  iconUp.classList.remove('active'); iconCenter.classList.remove('active'); iconDown.classList.remove('active');
  if(state === 'center') iconCenter.classList.add('active');
  else if(state === 'up') iconUp.classList.add('active');
  else if(state === 'down') iconDown.classList.add('active');
}

// main loop
let lastTime = performance.now(), frames = 0, lastFpsTime = performance.now();
function detectLoop(){
  if(!stream) return;
  const res = analyzeFrame();
  if(res){
    const total = res.top + res.center + res.bottom;
    const strongest = Math.max(res.top, res.center, res.bottom);
    let state = 'neutral';
    if(total < 6) state = 'neutral';
    else {
      if(res.center >= strongest*1.15 && res.center > res.top && res.center > res.bottom) state = 'center';
      else if(res.top === strongest) state = 'up';
      else if(res.bottom === strongest) state = 'down';
    }
    if(state !== lastState){
      lastState = state;
      updateIcons(state);
      const distanceRatio = 1 - (res.center / (res.top + res.center + res.bottom || 1));
      startPing(distanceRatio);
    } else {
      const distanceRatio = 1 - (res.center / (res.top + res.center + res.bottom || 1));
      startPing(distanceRatio); // adjust interval dynamically (stopPing + startPing handles reschedule)
    }
  }
  frames++;
  const now = performance.now();
  if(now - lastFpsTime > 500){ fpsEl.textContent = Math.round(frames*1000/(now - lastFpsTime)) + ' fps'; frames = 0; lastFpsTime = now; }
  requestAnimationFrame(detectLoop);
}

// device orientation bubble
window.addEventListener('deviceorientation', (ev)=>{
  const maxTilt = 30;
  const gx = Math.max(-maxTilt, Math.min(maxTilt, ev.gamma || 0));
  const gy = Math.max(-maxTilt, Math.min(maxTilt, ev.beta || 0));
  const px = (gx / maxTilt) * 20, py = (gy / maxTilt) * 20;
  bubble.style.transform = `translate(${px}px, ${py}px)`;
});

// UI actions
settingsBtn.onclick = ()=> settingsModal.classList.remove('hidden');
closeSettings.onclick = ()=>{ settingsModal.classList.add('hidden'); saveSettings(); };
testSound.onclick = ()=>{ if(prepareAudio()){ setTone(oscCenter,0.02); setTimeout(()=>stopTone(oscCenter),220); } else if(fallbackAudio){ fallbackAudio.volume = volumeInput.value/100; fallbackAudio.play().catch(()=>{}); } };
resetBtn.onclick = ()=>{ localStorage.removeItem(SETTINGS_KEY); location.reload(); };

// start/stop
startBtn.onclick = async ()=>{
  await listCameras();
  const ok = await startStream(cameraSelect.value);
  if(!ok){ alert('Не вдається запустити камеру'); return; }
  prepareAudio(); if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  detecting = true; startBtn.classList.add('hidden'); stopBtn.classList.remove('hidden');
  detectLoop();
};
stopBtn.onclick = ()=>{ detecting = false; stopStream(); startBtn.classList.remove('hidden'); stopBtn.classList.add('hidden'); stopPing(); updateIcons('neutral'); };

// misc
window.addEventListener('beforeunload', ()=>{ saveSettings(); if(audioCtx) try{ audioCtx.close(); }catch(e){} });
function saveSettings(){ settings.threshold = parseInt(thresholdInput.value); settings.color = laserColor.value; settings.soundMode = soundMode.value; settings.volume = parseInt(volumeInput.value); settings.autoAdapt = autoAdapt.checked; settings.deviceId = cameraSelect.value; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

// initial camera list
listCameras();