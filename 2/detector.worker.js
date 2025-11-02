// detector.worker.js - plain worker for pixel analysis
self.onmessage = function(e){
  const msg = e.data;
  if(msg.type === 'settings'){
    self.settings = msg.settings;
    return;
  }
  if(msg.type === 'frame'){
    // frame may contain imageData or bitmap
    if(msg.bitmap){
      try{
        const off = new OffscreenCanvas(msg.w, msg.h);
        const ctx = off.getContext('2d');
        ctx.drawImage(msg.bitmap,0,0);
        const img = ctx.getImageData(0,0,msg.w,msg.h);
        const yPos = detectLaser(img, msg.settings || self.settings, msg.w, msg.h);
        postMessage({ type:'result', yPos, w: msg.w, h: msg.h });
        if(msg.bitmap.close) try{ msg.bitmap.close(); }catch(e){}
      }catch(err){
        postMessage({ type:'log', msg: 'Offscreen draw failed, fallback' });
        if(msg.imageData){
          const yPos = detectLaser(msg.imageData, msg.settings || self.settings, msg.w, msg.h);
          postMessage({ type:'result', yPos, w: msg.w, h: msg.h });
        } else {
          postMessage({ type:'result', yPos: null, w: msg.w, h: msg.h });
        }
      }
    } else if(msg.imageData){
      const yPos = detectLaser(msg.imageData, msg.settings || self.settings, msg.w, msg.h);
      postMessage({ type:'result', yPos, w: msg.w, h: msg.h });
    } else {
      postMessage({ type:'result', yPos: null, w: msg.w, h: msg.h });
    }
  } else if(msg.type === 'calibrate'){
    postMessage({ type:'log', msg:'Calibration via worker requested - main thread should send frames' });
  }
};

function detectLaser(imageData, settingsLocal, w, h){
  if(!imageData) return null;
  const data = imageData.data;
  let sumY = 0, count = 0;
  const areaPct = Math.max(20, Math.min(100, settingsLocal.detectionArea || 100));
  const yMargin = Math.floor((1 - areaPct/100) * h / 2);
  const s = Math.max(1, settingsLocal.sensitivity || 200);
  const rRatio = settingsLocal.redRatio || 1.8;
  const bRatio = settingsLocal.blueRatio || 1.5;
  const minBlue = settingsLocal.minBlue || 100;
  const minBrightness = settingsLocal.minBrightness || 160;
  const maxColorDiff = settingsLocal.maxColorDiff || 90;
  const color = settingsLocal.laserColor || 'green';

  for(let i=0, len=data.length;i<len;i+=4){
    const idx = i/4;
    const y = Math.floor(idx / w);
    if(y < yMargin || y >= h - yMargin) continue;
    const r = data[i], g = data[i+1], b = data[i+2];
    const brightness = 0.299*r + 0.587*g + 0.114*b;

    if(color === 'green'){
      if(g > s && g > r * rRatio && g > b * bRatio && b > minBlue &&
         brightness > minBrightness && Math.abs(g - b) < maxColorDiff &&
         !(r > 120 && g > 120 && b > 120)){ sumY += y; count++; }
    } else if(color === 'red'){
      if(r > s && r > g * 1.6 && r > b * 1.4 && brightness > minBrightness &&
         !(r > 120 && g > 120 && b > 120)){ sumY += y; count++; }
    } else if(color === 'blue'){
      if(b > s && b > r * 1.6 && b > g * 1.4 && brightness > minBrightness &&
         !(r > 120 && g > 120 && b > 120)){ sumY += y; count++; }
    } else if(color === 'custom'){
      const hex = (settingsLocal.customLaserColor || '#04F8D4').replace('#','');
      const cr = parseInt(hex.substring(0,2),16);
      const cg = parseInt(hex.substring(2,4),16);
      const cb = parseInt(hex.substring(4,6),16);
      if((Math.abs(g - cg) < 120 && Math.abs(r - cr) < 120 && Math.abs(b - cb) < 120) && brightness > minBrightness){
        sumY += y; count++;
      }
    }
  }
  return count > 0 ? (sumY / count) : null;
}
