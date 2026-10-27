const preview = document.getElementById('preview');
const player = document.getElementById('player');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const recIndicator = document.getElementById('rec_indicator');
const btnStart = document.getElementById('btn_start');
const btnStop = document.getElementById('btn_stop');
const btnSave = document.getElementById('btn_save');
const videoList = document.getElementById('video_list');
const cameraSelect = document.getElementById('camera_select');
const micSelect = document.getElementById('mic_select');

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let timerId = null;
let elapsedSec = 0;
let audioContext = null;
let micSource = null;

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


let meterRunning = false;
let micAnalyser = null;

function setupMicMeter(stream) {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();
  if (micSource) micSource.disconnect();
  micSource = audioContext.createMediaStreamSource(stream);
  micAnalyser = audioContext.createAnalyser();
  micAnalyser.fftSize = 512;
  micSource.connect(micAnalyser);

  if (meterRunning) return;
  meterRunning = true;

  const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
  const micBar = document.getElementById('mic_bar');

  function updateMeter() {
    micAnalyser.getByteTimeDomainData(dataArray);
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

function fillSelect(select, devices, fallback) {
  const current = select.value;
  select.innerHTML = '';
  devices.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `${fallback} ${i + 1}`;
    select.appendChild(opt);
  });
  if (current && devices.some((d) => d.deviceId === current)) {
    select.value = current;
  }
}

async function refreshDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    fillSelect(cameraSelect, devices.filter((d) => d.kind === 'videoinput'), '摄像头');
    fillSelect(micSelect, devices.filter((d) => d.kind === 'audioinput'), '麦克风');
  } catch (err) {
    setStatus(`无法枚举设备：${err.message}`);
  }
}

async function initCamera() {
  try {
    const constraints = {
      video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : true,
      audio: micSelect.value ? { deviceId: { exact: micSelect.value } } : true
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    preview.srcObject = mediaStream;
    setupMicMeter(mediaStream);
    setStatus('摄像头、麦克风已就绪');
    await refreshDevices();
    const videoTrack = mediaStream.getVideoTracks()[0];
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (videoTrack) cameraSelect.value = videoTrack.getSettings().deviceId || '';
    if (audioTrack) micSelect.value = audioTrack.getSettings().deviceId || '';
  } catch (err) {
    setStatus(`无法访问摄像头/麦克风：${err.message}`);
  }
}

async function switchDevice() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') return;
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
  await initCamera();
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
    cameraSelect.disabled = false;
    micSelect.disabled = false;
    setStatus('录制完成，可保存');
  };

  mediaRecorder.start(1000);
  startTimer();
  recIndicator.hidden = false;
  btnStart.disabled = true;
  btnStop.disabled = false;
  btnSave.disabled = true;
  cameraSelect.disabled = true;
  micSelect.disabled = true;
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
cameraSelect.addEventListener('change', switchDevice);
micSelect.addEventListener('change', switchDevice);
navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

initCamera();
refreshList();