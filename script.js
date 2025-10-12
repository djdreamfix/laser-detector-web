// LaserReceiver Web Pro v5.7 — стабільне визначення центру + реалістичний звук Bosch

const video = document.getElementById('video'),
      canvas = document.getElementById('canvas'),
      ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn'),
      stopBtn = document.getElementById('stopBtn'),
      iconUp = document.getElementById('icon-up'),
      iconCenter = document.getElementById('icon-center'),
      iconDown = document.getElementById('icon-down'),
      thresholdInput = document.getElementById('threshold'),
      laserColor = document.getElementById('laserColor'),
      volumeInput = document.getElementById('volume'),
      fpsEl = document.getElementById('fps'),
      settingsBtn = document.getElementById('settingsBtn'),
      settingsModal = document.getElementById('settingsModal'),
      closeSettings = document.getElementById('closeSettings');

let stream = null, detecting = false, pingTimer = null;
let audioCtx, osc, gainNode, audioReady = false;

// --- AUDIO ---
function initAudio() {
  if (audioReady) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    osc = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    osc.type = 'sine';
    gainNode.gain.value = 0;
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    audioReady = true;
  } catch (e) {
    console.error('Audio init failed', e);
  }
}

// Розблокування аудіо на перший клік
function unlockAudio() {
  if (!audioCtx) return;
  audioCtx.resume().then(() => {
    console.log('Audio resumed');
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    setTimeout(() => gainNode.gain.setValueAtTime(0, audioCtx.currentTime), 150);
  });
  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('touchstart', unlockAudio);
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

function playTone(freq, vol) {
  if (!audioReady) return;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gainNode.gain.setTargetAtTime(vol * (volumeInput.value / 100), audioCtx.currentTime, 0.02);
}
function stopTone() {
  if (!audioReady) return;
  gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
}
function stopPing() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  stopTone();
}

// --- CAMERA ---
async function startStream() {
  stopStream();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
function stopStream() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  video.srcObject = null;
  stream = null;
}

// --- DETECTION ---
function analyzeFrame() {
  if (!video || video.readyState < 2) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data, w = canvas.width, h = canvas.height;
  const threshold = parseInt(thresholdInput.value);
  let sumY = 0, count = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (laserColor.value === 'green') {
        if (g > threshold && g > r * 1.8 && g > b * 1.8) { sumY += y; count++; }
      } else {
        if (r > threshold && r > g * 1.8 && r > b * 1.8) { sumY += y; count++; }
      }
    }
  }
  if (count < 30) return null;
  return sumY / count;
}

// --- UI ---
function updateIcons(state) {
  iconUp.classList.toggle('active', state === 'up');
  iconCenter.classList.toggle('active', state === 'center');
  iconDown.classList.toggle('active', state === 'down');
}

// --- SOUND ---
function playLaserSound(ratio, state) {
  stopPing();
  if (state === 'center') {
    playTone(700, 0.04);
    return;
  }
  stopTone();
  const interval = 1000 * Math.max(0.05, Math.min(ratio, 1));
  pingTimer = setInterval(() => {
    playTone(600, 0.05);
    setTimeout(stopTone, 100);
  }, interval);
}

// --- DETECTION LOOP з гістерезисом ---
let smoothY = null;
let inCenter = false;
const smoothFactor = 0.7;

function detectLoop() {
  if (!detecting) return;
  const y = analyzeFrame();
  if (y) {
    if (smoothY == null) smoothY = y;
    smoothY = smoothY * smoothFactor + y * (1 - smoothFactor);

    const mid = canvas.height / 2;
    const dist = Math.abs(smoothY - mid);
    const ratio = dist / (canvas.height / 2);

    if (inCenter) {
      if (ratio > 0.15) inCenter = false;
    } else {
      if (ratio < 0.1) inCenter = true;
    }

    const state = inCenter ? 'center' : (smoothY < mid ? 'up' : 'down');
    updateIcons(state);
    playLaserSound(ratio, state);
  } else {
    updateIcons('none');
    stopPing();
  }
  requestAnimationFrame(detectLoop);
}

// --- BUTTONS ---
startBtn.onclick = async () => {
  initAudio();
  const ok = await startStream();
  if (!ok) return alert('Не вдалося відкрити камеру');
  audioCtx.resume().catch(()=>{});
  detecting = true;
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  detectLoop();
};
stopBtn.onclick = () => {
  detecting = false;
  stopStream();
  stopPing();
  updateIcons('none');
  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
};

// --- SETTINGS ---
settingsBtn.onclick = () => settingsModal.classList.remove('hidden');
closeSettings.onclick = () => settingsModal.classList.add('hidden');