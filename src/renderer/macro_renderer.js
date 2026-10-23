const preview = document.getElementById('preview');
const player = document.getElementById('player');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const recIndicator = document.getElementById('rec_indicator');
const btnStart = document.getElementById('btn_start');
const btnStop = document.getElementById('btn_stop');
const btnSave = document.getElementById('btn_save');
const videoList = document.getElementById('video_list');

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let timerId = null;
let elapsedSec = 0;

function setStatus(text) {
  statusEl.textContent = text;
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  elapsedSec = 0;
  timerEl.textContent = formatTime(0);
  timerId = setInterval(() => {
    elapsedSec += 1;
    timerEl.textContent = formatTime(elapsedSec);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}


function setupMicMeter(stream) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  const micBar = document.getElementById('mic_bar');

  function updateMeter() {
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    micBar.style.width = `${Math.min(100, rms * 250)}%`;
    requestAnimationFrame(updateMeter);
  }
  updateMeter();
}

async function initCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    preview.srcObject = mediaStream;
    setupMicMeter(mediaStream);
    setStatus('摄像头、麦克风已就绪');
  } catch (err) {
    setStatus(`无法访问摄像头/麦克风：${err.message}`);
  }
}

function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function showPlayback(src, name) {
  preview.hidden = true;
  player.hidden = false;
  player.src = src;
  player.play();
  setStatus(`回放中：${name}`);
}

function showLivePreview() {
  player.pause();
  player.removeAttribute('src');
  player.hidden = true;
  preview.hidden = false;
}

function startRecording() {
  if (!mediaStream) return;
  showLivePreview();
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: pickMimeType() });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    stopTimer();
    recIndicator.hidden = true;
    btnSave.disabled = recordedChunks.length === 0;
    setStatus('录制完成，可保存');
  };

  mediaRecorder.start(1000);
  startTimer();
  recIndicator.hidden = false;
  btnStart.disabled = true;
  btnStop.disabled = false;
  btnSave.disabled = true;
  setStatus('录制中…');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  btnStart.disabled = false;
  btnStop.disabled = true;
}

async function saveRecording() {
  if (recordedChunks.length === 0) return;
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const buffer = await blob.arrayBuffer();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const filename = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.webm`;

  const filePath = await window.diaryApi.saveVideo(buffer, filename);
  recordedChunks = [];
  btnSave.disabled = true;
  setStatus(`已保存：${filePath}`);
  await refreshList();
}

async function refreshList() {
  const files = await window.diaryApi.listVideos();
  videoList.innerHTML = '';
  for (const f of files) {
    const li = document.createElement('li');
    const icon = document.createElement('span');
    icon.className = 'play-icon';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = f;
    li.appendChild(icon);
    li.appendChild(name);
    li.addEventListener('click', async () => {
      const p = await window.diaryApi.getVideoPath(f);
      showPlayback(`file://${p}`, f);
    });
    videoList.appendChild(li);
  }
}


player.addEventListener('ended', () => {
  showLivePreview();
  setStatus('回放结束，已恢复实时画面');
});

btnStart.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnSave.addEventListener('click', saveRecording);

initCamera();
refreshList();