// Laser Level Detector PWA
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const btnStart = document.getElementById('btnStart');
const modeSel = document.getElementById('mode');
const sensitivityEl = document.getElementById('sensitivity');
const foundEl = document.getElementById('found');
const fpsEl = document.getElementById('fps');
const calibBtn = document.getElementById('calib');
const mirrorCheck = document.getElementById('mirror');
const smoothCheck = document.getElementById('smooth');
const flickerCheck = document.getElementById('flicker');
const status = document.getElementById('status');

let stream = null;
let running = false;
let fps = 0;
let lastTime = performance.now();
let frameCount = 0;
let calibBackground = null;
let flickerBuffer = [];
const flickerWindow = 5;

function setStatus(s){ status.textContent = s; }

async function startCamera(){
  if (running) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    resizeCanvas();
    running = true;
    requestAnimationFrame(processFrame);
    setStatus('Камера увімкнена');
  } catch (e) {
    setStatus('Помилка камери: ' + (e.message||e));
  }
}

function resizeCanvas(){
  overlay.width = video.videoWidth || overlay.clientWidth;
  overlay.height = video.videoHeight || overlay.clientHeight;
}

window.addEventListener('resize', resizeCanvas);
video.addEventListener('loadedmetadata', resizeCanvas);

btnStart.addEventListener('click', () => {
  if (!running) startCamera();
  else {
    stream.getTracks().forEach(t=>t.stop());
    stream = null;
    running = false;
    setStatus('Камера вимкнена');
  }
});

calibBtn.addEventListener('click', () => {
  if (!running) return;
  const off = document.createElement('canvas');
  off.width = overlay.width; off.height = overlay.height;
  const octx = off.getContext('2d');
  octx.drawImage(video,0,0,off.width,off.height);
  calibBackground = octx.getImageData(0,0,off.width,off.height);
  setStatus('Калібрування збережено');
});

function processFrame(){
  if (!running) return;
  if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) resizeCanvas();

  const w = Math.max(160, Math.floor(overlay.width/4));
  const h = Math.max(120, Math.floor(overlay.height/4));
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d');
  if (mirrorCheck.checked) { octx.translate(w,0); octx.scale(-1,1); }
  octx.drawImage(video,0,0,w,h);
  const img = octx.getImageData(0,0,w,h);
  const data = img.data;

  const mode = modeSel.value;
  const sensitivity = parseFloat(sensitivityEl.value);

  let sumX=0, sumY=0, sumI=0, maxI=0;
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const idx = (y*w + x)*4;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      const v = (r+g+b)/3;
      let score = 0;
      if (mode === 'red') score = r/255;
      if (mode === 'green') score = g/255;
      if (mode === 'bright' || mode === 'auto') score = v/255;
      if (calibBackground){
        const cidx = (y*w + x)*4;
        const cr = calibBackground.data[cidx], cg = calibBackground.data[cidx+1], cb = calibBackground.data[cidx+2];
        const bkg = (cr+cg+cb)/3;
        score = Math.max(0, score - (bkg/255));
      }
      score *= sensitivity;
      if (score > 0.02) {
        sumX += x * score;
        sumY += y * score;
        sumI += score;
      }
      if (score > maxI) maxI = score;
    }
  }

  let found = false;
  let cx = 0, cy = 0;
  if (sumI > 0) {
    cx = sumX / sumI;
    cy = sumY / sumI;
    found = maxI > 0.08;
  }

  if (flickerCheck.checked) {
    flickerBuffer.push(found?1:0);
    if (flickerBuffer.length > flickerWindow) flickerBuffer.shift();
    const s = flickerBuffer.reduce((a,b)=>a+b,0);
    found = s > Math.ceil(flickerWindow/2);
  }

  ctx.clearRect(0,0,overlay.width,overlay.height);
  if (found) {
    const sx = cx / w * overlay.width;
    const sy = cy / h * overlay.height;
    ctx.strokeStyle = 'lime';
    ctx.beginPath();
    ctx.moveTo(sx-20, sy); ctx.lineTo(sx+20,sy);
    ctx.moveTo(sx,sy-20); ctx.lineTo(sx,sy+20);
    ctx.stroke();
  }

  foundEl.textContent = found ? 'Промінь: Знайдено' : 'Промінь: Немає';
  foundEl.className = 'indicator ' + (found ? 'positive' : 'negative');

  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 500) {
    fps = Math.round((frameCount*1000)/(now-lastTime));
    fpsEl.textContent = 'FPS: ' + fps;
    lastTime = now;
    frameCount = 0;
  }

  requestAnimationFrame(processFrame);
}

modeSel.addEventListener('change', ()=>{ setStatus('Режим: '+modeSel.value); });
mirrorCheck.addEventListener('change', ()=>{ video.style.transform = mirrorCheck.checked ? 'scaleX(-1)' : 'none' ; });
