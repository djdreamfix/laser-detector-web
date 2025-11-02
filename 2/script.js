// script.js - plain files version (no bundler)
const defaultSettings = {
  sensitivity: 200,
  laserColor: 'green',
  customLaserColor: '#04F8D4',
  detectionArea: 100,
  soundMode: 'bosch',
  volume: 50,
  camera: 'environment',
  resolution: 'medium',
  tiltCalibration: { x: 0, y: 0 },
  tiltSensitivity: 5,
  laserThreshold: 200,
  redRatio: 1.8,
  blueRatio: 1.5,
  minBlue: 100,
  minBrightness: 160,
  maxColorDiff: 90
};

const $ = id => document.getElementById(id);
const storageKey = 'dreamfix_settings_v5';
let settings = loadSettings();

let stream = null;
let video = $('video');
let overlay = $('overlay');
let ctx = overlay.getContext('2d');
let processing = false;
let useFront = settings.camera === 'user';
let audioMgr = null;
let deviceOrientation = { beta: 0, gamma: 0 };

let worker = null;
let internalCanvas = document.createElement('canvas');
let internalW = 320;
let internalH = 180;

const startBtn = $('startBtn'), launchScreen = $('launchScreen'), app = $('app');
const statusEl = $('status');
const sensitivityEl = $('sensitivity');
const laserColorEl = $('laserColor');
const customColorEl = $('customColor');
const detectionAreaEl = $('detectionArea');
const soundModeEl = $('soundMode');
const volumeEl = $('volume');
const calibrateBtn = $('calibrateBtn');
const toggleCamBtn = $('toggleCamBtn');
const resetBtn = $('resetBtn');
const indicatorCenter = document.querySelector('.centerDot');
const indicatorTop = $('indicatorTop');
const indicatorBottom = $('indicatorBottom');
const bubble = $('bubble');

function loadSettings(){
  try{ const raw = localStorage.getItem(storageKey); if(raw) return Object.assign({}, defaultSettings, JSON.parse(raw)); }catch(e){}
  return Object.assign({}, defaultSettings);
}
function saveSettings(){ localStorage.setItem(storageKey, JSON.stringify(settings)); }
function showStatus(t){ statusEl.textContent = `Status: ${t}`; }

function bindUI(){
  sensitivityEl.value = settings.sensitivity;
  laserColorEl.value = settings.laserColor;
  customColorEl.value = settings.customLaserColor;
  detectionAreaEl.value = settings.detectionArea;
  soundModeEl.value = settings.soundMode;
  volumeEl.value = settings.volume;

  sensitivityEl.addEventListener('input', e=>{ settings.sensitivity=+e.target.value; saveSettings(); postSettings(); });
  laserColorEl.addEventListener('change', e=>{ settings.laserColor=e.target.value; saveSettings(); postSettings(); });
  customColorEl.addEventListener('input', e=>{ settings.customLaserColor=e.target.value; saveSettings(); postSettings(); });
  detectionAreaEl.addEventListener('input', e=>{ settings.detectionArea=+e.target.value; saveSettings(); postSettings(); });
  soundModeEl.addEventListener('change', e=>{ settings.soundMode=e.target.value; saveSettings(); });
  volumeEl.addEventListener('input', e=>{ settings.volume=+e.target.value; saveSettings(); if(audioMgr) audioMgr.setVolume(settings.volume/100); });

  calibrateBtn.addEventListener('click', startCalibration);
  toggleCamBtn.addEventListener('click', switchCamera);
  resetBtn.addEventListener('click', resetSettings);
}

startBtn.addEventListener('click', async ()=>{
  launchScreen.classList.add('hidden');
  app.classList.remove('hidden');
  bindUI();
  await initAudio();
  initWorker();
  await startCamera();
  attachOrientation();
  resizeOverlay();
  requestAnimationFrame(loopRender);
});

async function startCamera(){
  stopCamera();
  const constraints = {
    audio: false,
    video: {
      facingMode: useFront ? 'user' : 'environment',
      width: { ideal: settings.resolution === 'high' ? 1280 : 640 },
      height: { ideal: settings.resolution === 'high' ? 720 : 480 },
      frameRate: { ideal: 30, max: 60 }
    }
  };
  try{
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    showStatus('camera ready');
    video.addEventListener('loadedmetadata', resizeOverlay);
  }catch(err){
    console.error('camera error', err);
    showStatus('camera error');
  }
}
function stopCamera(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }

async function switchCamera(){
  useFront = !useFront;
  settings.camera = useFront ? 'user' : 'environment';
  saveSettings();
  await startCamera();
}

function resizeOverlay(){
  overlay.width = video.videoWidth || 1280;
  overlay.height = video.videoHeight || 720;
  overlay.style.width = `${video.clientWidth}px`;
  overlay.style.height = `${video.clientHeight}px`;
  internalH = Math.round((overlay.height / overlay.width) * internalW) || 180;
  internalCanvas.width = internalW;
  internalCanvas.height = internalH;
}

function loopRender(){
  if(video && !video.paused && !video.ended){
    if(!processing) captureAndSendFrame();
    updateLevelBubble();
  }
  requestAnimationFrame(loopRender);
}

function captureAndSendFrame(){
  const tctx = internalCanvas.getContext('2d');
  tctx.drawImage(video, 0, 0, internalW, internalH);

  if(window.createImageBitmap){
    createImageBitmap(internalCanvas).then(bitmap=>{
      if(worker) worker.postMessage({ type:'frame', bitmap, settings, w:internalW, h:internalH }, [bitmap]);
      else processFrameMainThread(tctx.getImageData(0,0,internalW,internalH));
    }).catch(()=>{ const img = tctx.getImageData(0,0,internalW,internalH); if(worker) worker.postMessage({ type:'frame', imageData: img, settings, w:internalW, h:internalH }); else processFrameMainThread(img); });
  } else {
    const img = tctx.getImageData(0,0,internalW,internalH);
    if(worker) worker.postMessage({ type:'frame', imageData: img, settings, w:internalW, h:internalH });
    else processFrameMainThread(img);
  }
  processing = true;
}

function initWorker(){
  try{
    worker = new Worker('detector.worker.js');
    worker.onmessage = onWorkerMessage;
    postSettings();
  }catch(e){
    console.warn('Worker init failed, falling back to main-thread detection', e);
    worker = null;
  }
}
function postSettings(){ if(worker) worker.postMessage({ type:'settings', settings }); }

function onWorkerMessage(e){
  const msg = e.data;
  if(msg.type === 'result'){
    processing = false;
    renderOverlay(msg.yPos, msg.w, msg.h);
    if(msg.yPos !== null){
      const norm = (msg.yPos / msg.h - 0.5) * 2;
      handleDetection(norm);
    } else {
      handleLost();
    }
  } else if(msg.type === 'log'){
    console.log('worker:', msg.msg);
  }
}

// Fallback main-thread processing (if Worker not available)
function processFrameMainThread(img){
  const y = detectLaser(img, settings, img.width, img.height);
  processing = false;
  renderOverlay(y, img.width, img.height);
  if(y !== null){
    const norm = (y / img.height - 0.5) * 2;
    handleDetection(norm);
  } else {
    handleLost();
  }
}

// Detection algorithm
function detectLaser(imageData, settingsLocal, w, h){
  const data = imageData.data;
  let sumY = 0, count = 0;
  const areaPct = Math.max(20, Math.min(100, settingsLocal.detectionArea));
  const yMargin = Math.floor((1 - areaPct/100) * h / 2);
  for(let i=0, len=data.length;i<len;i+=4){
    const idx = i/4;
    const y = Math.floor(idx / w);
    if(y < yMargin || y >= h - yMargin) continue;
    const r = data[i], g = data[i+1], b = data[i+2];
    const brightness = 0.299*r + 0.587*g + 0.114*b;
    if(settingsLocal.laserColor === 'green'){
      if(g > settingsLocal.sensitivity && g > r * settingsLocal.redRatio &&
         g > b * settingsLocal.blueRatio && b > settingsLocal.minBlue &&
         brightness > settingsLocal.minBrightness &&
         Math.abs(g - b) < settingsLocal.maxColorDiff &&
         !(r > 120 && g > 120 && b > 120)){ sumY += y; count++; }
    } else if(settingsLocal.laserColor === 'red'){
      if(r > settingsLocal.sensitivity && r > g * 1.6 && r > b * 1.4 && brightness > settingsLocal.minBrightness &&
         !(r > 120 && g > 120 && b > 120)){ sumY += y; count++; }
    } else if(settingsLocal.laserColor === 'blue'){
      if(b > settingsLocal.sensitivity && b > r * 1.6 && b > g * 1.4 && brightness > settingsLocal.minBrightness &&
         !(r > 120 && g > 120 && b > 120)){ sumY += y; count++; }
    } else if(settingsLocal.laserColor === 'custom'){
      const hex = settingsLocal.customLaserColor.replace('#','');
      const cr = parseInt(hex.substring(0,2),16);
      const cg = parseInt(hex.substring(2,4),16);
      const cb = parseInt(hex.substring(4,6),16);
      if((Math.abs(g - cg) < 120 && Math.abs(r - cr) < 120 && Math.abs(b - cb) < 120) && brightness > settingsLocal.minBrightness){
        sumY += y; count++;
      }
    }
  }
  return count > 0 ? (sumY / count) : null;
}

// Overlay rendering
function renderOverlay(yPos, w, h){
  ctx.clearRect(0,0,overlay.width,overlay.height);
  const dw = overlay.width, dh = overlay.height;
  const cx = dw/2, cy = dh/2;
  ctx.strokeStyle = 'rgba(4,248,212,0.45)';
  ctx.lineWidth = 2;
  const size = Math.min(dw,dh)*0.12;
  ctx.beginPath(); ctx.arc(cx,cy,size,0,Math.PI*2); ctx.stroke();

  if(yPos !== null){
    const mappedY = (yPos / h) * dh;
    ctx.fillStyle = 'rgba(4,248,212,0.15)';
    ctx.fillRect(0, mappedY-8, dw, 16);
    ctx.fillStyle = settings.laserColor==='red' ? 'rgba(255,0,0,0.9)' : 'rgba(4,248,212,0.9)';
    ctx.beginPath(); ctx.arc(cx, mappedY, 8, 0, Math.PI*2); ctx.fill();
  }
}

// Laser events and audio hookup
let lastNorm = null, lostTimer = null, flashTimeout = null;
function handleDetection(norm){
  lastNorm = norm;
  clearTimeout(lostTimer);
  if(Math.abs(norm) < 0.08){
    indicatorCenter.style.transform = 'scale(1)';
    flashCenter();
    indicatorTop.style.opacity = '0.4';
    indicatorBottom.style.opacity = '0.4';
    showStatus('laser center');
    if(audioMgr) audioMgr.centerTone();
  } else {
    indicatorCenter.style.transform = 'scale(0.55)';
    indicatorTop.style.opacity = '1';
    indicatorBottom.style.opacity = '1';
    if(norm < 0){
      showStatus('laser above center');
      if(audioMgr) audioMgr.beepForDistance(Math.abs(norm));
    } else {
      showStatus('laser below center');
      if(audioMgr) audioMgr.beepForDistance(Math.abs(norm));
    }
  }
  indicatorTop.style.display = norm < -0.08 ? 'block' : 'none';
  indicatorBottom.style.display = norm > 0.08 ? 'block' : 'none';
}
function handleLost(){
  lostTimer = setTimeout(()=>{
    indicatorCenter.style.transform = 'scale(0.55)';
    indicatorTop.style.opacity = '0.7';
    indicatorBottom.style.opacity = '0.7';
    indicatorTop.style.display = 'none';
    indicatorBottom.style.display = 'none';
    showStatus('no laser');
    if(audioMgr) audioMgr.stop();
  }, 120);
}
function flashCenter(){
  indicatorCenter.style.transform = 'scale(1)';
  indicatorCenter.style.opacity = '1';
  clearTimeout(flashTimeout);
  flashTimeout = setTimeout(()=>{ indicatorCenter.style.opacity = '0.9'; }, 200);
}

// Audio manager
class AudioManager{
  constructor(){ this.ctx=null; this.gain=null; this.osc=null; this.volume=settings.volume/100; }
  async init(){ this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.gain = this.ctx.createGain(); this.gain.gain.value = this.volume; this.gain.connect(this.ctx.destination); if(this.ctx.state==='suspended'){await this.ctx.resume();} }
  setVolume(v){ this.volume=v; if(this.gain) this.gain.gain.value=v; }
  beep(freq=880,duration=0.06){ if(!this.ctx) return; const o=this.ctx.createOscillator(), g=this.ctx.createGain(); o.frequency.value=freq; o.type='sine'; g.gain.value=this.volume; o.connect(g); g.connect(this.gain); o.start(); g.gain.setValueAtTime(this.volume,this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,this.ctx.currentTime+duration); o.stop(this.ctx.currentTime+duration+0.02); }
  beepForDistance(norm){ const base = settings.soundMode==='leica'?1200:800; const freq = base + (1 - Math.min(1,norm))*1000; this.beep(freq,0.06); }
  centerTone(){ if(!this.ctx || this.osc) return; this.osc=this.ctx.createOscillator(); this.osc.type='sine'; this.osc.frequency.value=1000; const g=this.ctx.createGain(); g.gain.value=this.volume*0.7; this.osc.connect(g); g.connect(this.gain); this.osc.start(); this.centerGain=g; }
  stop(){ if(this.osc){ try{ this.osc.stop(); }catch(e){} this.osc.disconnect(); this.osc=null; } }
}
async function initAudio(){ audioMgr = new AudioManager(); await audioMgr.init(); audioMgr.setVolume(settings.volume/100); }

// Calibration (simple)
function startCalibration(){
  showStatus('calibrating...');
  // lightweight main-thread calibration: sample few frames and compute scene stats
  const samples = 12;
  const tctx = internalCanvas.getContext('2d');
  let avgB=0, maxG=0, maxR=0, maxB=0;
  let done=0;
  const collect = () => {
    tctx.drawImage(video,0,0,internalW,internalH);
    const img = tctx.getImageData(0,0,internalW,internalH);
    for(let i=0;i<img.data.length;i+=4){
      const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
      const br = 0.299*r + 0.587*g + 0.114*b;
      avgB += br;
      if(g>maxG) maxG=g;
      if(r>maxR) maxR=r;
      if(b>maxB) maxB=b;
    }
    done++;
    if(done < samples) setTimeout(collect, 120);
    else {
      const totalPixels = internalW*internalH*samples;
      avgB = Math.round(avgB / (internalW*internalH*samples));
      settings.minBrightness = Math.max(120, Math.round(avgB * 1.05));
      settings.sensitivity = Math.max(120, Math.round(Math.max(maxG,maxR,maxB) * 0.55));
      settings.minBlue = Math.max(60, Math.round(maxB * 0.15));
      saveSettings();
      sensitivityEl.value = settings.sensitivity;
      showStatus('calibration complete');
    }
  };
  collect();
}

// Device orientation
function attachOrientation(){
  if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
    DeviceOrientationEvent.requestPermission().then(permissionState=>{
      if(permissionState === 'granted') window.addEventListener('deviceorientation', onOrientation);
    }).catch(()=>{ window.addEventListener('deviceorientation', onOrientation); });
  } else {
    window.addEventListener('deviceorientation', onOrientation);
  }
}
function onOrientation(e){ deviceOrientation.beta = e.beta || 0; deviceOrientation.gamma = e.gamma || 0; }
function updateLevelBubble(){
  const gx = Math.max(-45, Math.min(45, deviceOrientation.gamma || 0));
  const by = Math.max(-45, Math.min(45, deviceOrientation.beta || 0));
  const normX = (gx + settings.tiltCalibration.x) / 45;
  const normY = (by + settings.tiltCalibration.y) / 45;
  const wrap = $('level3d'); if(!wrap) return;
  const boxW = wrap.clientWidth - 18; const boxH = wrap.clientHeight - 18;
  bubble.style.transform = `translate(${(normX*0.5+0.5)*boxW - boxW/2}px, ${(normY*0.5+0.5)*boxH - boxH/2}px)`;
}

function resetSettings(){
  settings = Object.assign({}, defaultSettings);
  saveSettings();
  sensitivityEl.value = settings.sensitivity;
  laserColorEl.value = settings.laserColor;
  customColorEl.value = settings.customLaserColor;
  detectionAreaEl.value = settings.detectionArea;
  soundModeEl.value = settings.soundMode;
  volumeEl.value = settings.volume;
  showStatus('settings reset');
}

window.addEventListener('beforeunload', ()=>{ if(audioMgr) audioMgr.stop(); stopCamera(); if(worker) worker.terminate(); });

// iOS audio unlock gesture
document.addEventListener('click', async ()=>{ if(audioMgr && audioMgr.ctx && audioMgr.ctx.state==='suspended'){ try{ await audioMgr.ctx.resume(); }catch(e){} } }, { once:true });
