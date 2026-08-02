(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var CONFIG = GF.CONFIG;

  function $(id) { return document.getElementById(id); }
  var view = $('view');
  var srcVideo = $('src');
  var btnCam = $('btnCam');
  var btnMode = $('btnMode');
  var btnShot = $('btnShot');
  var btnFile = $('btnFile');
  var fileSrc = $('fileSrc');
  var selCam = $('selCam');
  var selFilter = $('selFilter');
  var selShape = $('selShape');
  var chkMirror = $('chkMirror');
  var rngRadius = $('rngRadius');
  var lblRadius = $('lblRadius');
  var chkSkeleton = $('chkSkeleton');
  var statusCamera = $('statusCamera');
  var statusModel = $('statusModel');
  var statusFace = $('statusFace');
  var statusGesture = $('statusGesture');
  var statusFps = $('statusFps');
  var overlayHint = $('overlayHint');
  var camDetail = $('camDetail');
  var toast = $('toast');

  var state = {
    cameraOn: false,
    stream: null,
    devices: [],
    sourceType: 'demo',   // 'camera' | 'image' | 'video' | 'demo'
    imageBitmap: null,
    fileUrl: null,
    handLandmarker: null,
    handsReady: false,
    handsLoading: false,
    hands: [],            // 本帧检测到的手：[{ lm, handedness }]
    faceLandmarker: null,
    faceReady: false,
    faceLoading: false,
    faceLandmarks: null,
    mode: 'hands',
    mousePos: null,
    mouseFilterOn: true,
    mirror: true,         // 摄像头画面镜像（自拍）
    shape: 'rect',        // 'rect' | 'circle'
    regions: [],          // 滤镜区域列表（每只手一个；鼠标模式一个）
    lastVideoTime: -1,
    gestureName: '--',
    lastHandAt: 0,
    fps: 0
  };

  // ---- 滤镜下拉 ----
  GF.FILTERS.forEach(function (f) {
    var o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.label;
    selFilter.appendChild(o);
  });

  function currentFilter() {
    var id = selFilter.value;
    for (var i = 0; i < GF.FILTERS.length; i++) {
      if (GF.FILTERS[i].id === id) return GF.FILTERS[i];
    }
    return GF.FILTERS[0];
  }

  function setStatus(el, text, ok) {
    el.textContent = text;
    el.classList.remove('ok', 'warn', 'err');
    if (ok === true) el.classList.add('ok');
    else if (ok === false) el.classList.add('err');
    else el.classList.add('warn');
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.classList.add('hidden'); }, 3200);
  }

  // ---- 摄像头错误分级提示 ----
  function cameraErrorMessage(e) {
    var name = (e && e.name) || '';
    switch (name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return {
          short: '权限被拒绝',
          detail: '浏览器阻止了摄像头权限：点击地址栏左侧的摄像头图标，选择"允许"，然后重新点击"开启摄像头"。'
        };
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return {
          short: '未检测到摄像头设备',
          detail: '系统里没有可用摄像头（或驱动未就绪）：请确认摄像头已连接、在系统设置中已启用；也可以使用"🖼 图片/视频源"或演示模式继续体验。'
        };
      case 'NotReadableError':
      case 'TrackStartError':
        return {
          short: '摄像头被占用',
          detail: '摄像头正被其他程序占用（如会议软件、相机应用），请关闭后再试。'
        };
      case 'OverconstrainedError':
        return {
          short: '设备不匹配',
          detail: '所选摄像头不支持当前画面参数，请在"画面源"里换一个摄像头，或选择"自动"。'
        };
      case 'SecurityError':
        return {
          short: '非安全上下文',
          detail: '摄像头仅允许在 localhost 或 https 页面使用：请双击 start.bat 启动（http://localhost:8000），不要直接双击打开 index.html。'
        };
      case 'AbortError':
        return { short: '请求被中止', detail: '摄像头请求被中止，请点击"开启摄像头"重试。' };
      default:
        return {
          short: '无法访问摄像头',
          detail: (e && e.message) ? e.message : '未知错误：请检查摄像头连接与浏览器权限。'
        };
    }
  }

  function updateCameraUI() {
    if (state.cameraOn) {
      btnCam.textContent = '⏹ 关闭摄像头';
    } else if (state.sourceType === 'image' || state.sourceType === 'video') {
      btnCam.textContent = '📷 切回摄像头';
    } else {
      btnCam.textContent = '📷 开启摄像头';
    }
  }

  // ---- 摄像头设备枚举 ----
  async function refreshDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      var devs = await navigator.mediaDevices.enumerateDevices();
      state.devices = devs.filter(function (d) { return d.kind === 'videoinput'; });
      var current = selCam.value;
      selCam.innerHTML = '';
      var auto = document.createElement('option');
      auto.value = '';
      auto.textContent = '自动';
      selCam.appendChild(auto);
      state.devices.forEach(function (d, i) {
        var o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || ('摄像头 ' + (i + 1));
        selCam.appendChild(o);
      });
      if (current) selCam.value = current;
      if (state.devices.length === 0) {
        setStatus(statusCamera, '摄像头: 未检测到设备', false);
        camDetail.textContent = '未检测到任何摄像头设备：请确认摄像头已连接并启用；也可用"🖼 图片/视频源"或演示模式继续。';
      }
    } catch (e) {
      console.warn('enumerateDevices error:', e);
    }
  }

  // ---- 摄像头 ----
  async function startCamera(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(statusCamera, '摄像头: 环境不支持（非安全上下文）', false);
      camDetail.textContent = '当前页面不是安全上下文：请双击 start.bat 启动（http://localhost:8000），不要直接打开 index.html。';
      overlayHint.textContent = '无法访问摄像头：请用 start.bat 启动后再试';
      overlayHint.classList.remove('hidden');
      return;
    }
    clearFileSource();
    var want = deviceId || selCam.value;
    var constraints = {
      audio: false,
      video: { width: { ideal: CONFIG.videoW }, height: { ideal: CONFIG.videoH } }
    };
    if (want) {
      constraints.video = {
        deviceId: { exact: want },
        width: { ideal: CONFIG.videoW },
        height: { ideal: CONFIG.videoH }
      };
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.stream = stream;
      srcVideo.srcObject = stream;
      srcVideo.src = '';
      await srcVideo.play();
      state.cameraOn = true;
      state.sourceType = 'camera';
      setStatus(statusCamera, '摄像头: 已开启', true);
      camDetail.textContent = '';
      overlayHint.classList.add('hidden');
      updateCameraUI();
      refreshDevices();
      if (state.handsReady) showToast('摄像头已开启，双手比出"捏合"手势试试！');
    } catch (e) {
      console.warn('Camera error:', e);
      state.cameraOn = false;
      if (state.stream) { state.stream.getTracks().forEach(function (t) { t.stop(); }); state.stream = null; }
      srcVideo.removeAttribute('src');
      srcVideo.load();
      var msg = cameraErrorMessage(e);
      setStatus(statusCamera, '摄像头: ' + msg.short, false);
      camDetail.textContent = msg.detail;
      overlayHint.textContent = '摄像头不可用：' + msg.short + '（可重试，或使用"🖼 图片/视频源"）';
      overlayHint.classList.remove('hidden');
      showToast('无法访问摄像头：' + msg.short);
      updateCameraUI();
      if (want && state.devices.length > 1) {
        startCamera();
      }
    }
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { t.stop(); });
      state.stream = null;
    }
    state.cameraOn = false;
    if (state.sourceType === 'camera') state.sourceType = 'demo';
    srcVideo.removeAttribute('src');
    srcVideo.srcObject = null;
    srcVideo.load();
    setStatus(statusCamera, '摄像头: 已关闭', false);
    updateCameraUI();
  }

  // ---- 图片/视频文件源 ----
  function clearFileSource() {
    if (state.fileUrl) {
      URL.revokeObjectURL(state.fileUrl);
      state.fileUrl = null;
    }
    state.imageBitmap = null;
    if (state.sourceType === 'image' || state.sourceType === 'video') {
      state.sourceType = 'demo';
    }
  }

  function useFileSource(file) {
    if (!file) return;
    stopCamera();
    clearFileSource();
    state.fileUrl = URL.createObjectURL(file);
    if (file.type.indexOf('image/') === 0) {
      state.sourceType = 'image';
      var img = new Image();
      img.onload = function () {
        state.imageBitmap = img;
        setStatus(statusCamera, '画面源: 本地图片', true);
        camDetail.textContent = '当前使用本地图片作为画面源；手势识别仅支持摄像头，请用"鼠标模式"控制区域。';
        overlayHint.classList.add('hidden');
        updateCameraUI();
        showToast('已切换为本地图片源');
      };
      img.onerror = function () {
        state.sourceType = 'demo';
        showToast('图片加载失败');
      };
      img.src = state.fileUrl;
    } else if (file.type.indexOf('video/') === 0) {
      state.sourceType = 'video';
      srcVideo.srcObject = null;
      srcVideo.src = state.fileUrl;
      srcVideo.muted = true;
      srcVideo.loop = true;
      srcVideo.play().catch(function () {});
      setStatus(statusCamera, '画面源: 本地视频', true);
      camDetail.textContent = '当前使用本地视频作为画面源；手势识别仅支持摄像头，请用"鼠标模式"控制区域。';
      overlayHint.classList.add('hidden');
      updateCameraUI();
      showToast('已切换为本地视频源');
    }
  }

  // ---- MediaPipe 视觉 API（ESM 动态加载，多 CDN 回退）----
  async function loadVisionApi() {
    if (window.FilesetResolver && window.FaceLandmarker) return;
    var cdns = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + CONFIG.visionVersion,
      'https://unpkg.com/@mediapipe/tasks-vision@' + CONFIG.visionVersion
    ];
    var lastErr;
    for (var i = 0; i < cdns.length; i++) {
      try {
        var mod = await import(cdns[i]);
        window.FilesetResolver = mod.FilesetResolver;
        window.HandLandmarker = mod.HandLandmarker;
        window.FaceLandmarker = mod.FaceLandmarker;
        return;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('MediaPipe CDN 不可用');
  }

  async function loadHandsModel() {
    if (state.handsReady || state.handsLoading) return;
    state.handsLoading = true;
    setStatus(statusModel, '手势模型: 加载中…', null);
    try {
      await loadVisionApi();
      var vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + CONFIG.visionVersion + '/wasm');
      var opts = {
        baseOptions: { modelAssetPath: CONFIG.modelUrl, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      };
      try {
        state.handLandmarker = await HandLandmarker.createFromOptions(vision, opts);
      } catch (e2) {
        opts.baseOptions.delegate = 'CPU';
        state.handLandmarker = await HandLandmarker.createFromOptions(vision, opts);
      }
      state.handsReady = true;
      setStatus(statusModel, '手势模型: 就绪（支持双手）', true);
      showToast('手势识别就绪：双手拇指+食指之间 = 滤镜区域');
    } catch (e) {
      console.warn('Hand model failed:', e);
      state.handLandmarker = null;
      state.handsReady = false;
      setStatus(statusModel, '手势模型: 不可用（鼠标模式）', false);
      if (state.mode === 'hands') {
        state.mode = 'mouse';
        btnMode.classList.add('active');
        btnMode.textContent = '🖱 鼠标模式（点击切回手势）';
      }
      showToast('手势模型加载失败，已切换到鼠标模式');
    } finally {
      state.handsLoading = false;
    }
  }

  async function loadFaceModel() {
    if (state.faceReady || state.faceLoading) return;
    state.faceLoading = true;
    setStatus(statusFace, '人脸模型: 加载中…', null);
    try {
      await loadVisionApi();
      var vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + CONFIG.visionVersion + '/wasm');
      var opts = {
        baseOptions: { modelAssetPath: CONFIG.faceModelUrl, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      };
      try {
        state.faceLandmarker = await FaceLandmarker.createFromOptions(vision, opts);
      } catch (e2) {
        opts.baseOptions.delegate = 'CPU';
        state.faceLandmarker = await FaceLandmarker.createFromOptions(vision, opts);
      }
      state.faceReady = true;
      setStatus(statusFace, '人脸模型: 就绪', true);
    } catch (e) {
      console.warn('Face model failed:', e);
      state.faceReady = false;
      setStatus(statusFace, '人脸模型: 不可用（瘦脸不可用）', false);
      showToast('瘦脸滤镜不可用（人脸模型加载失败）');
    } finally {
      state.faceLoading = false;
    }
  }

  // ---- 每帧检测：双手 + 人脸 ----
  function detectHands(ts) {
    state.hands = [];
    if (!state.handLandmarker || !state.cameraOn || srcVideo.readyState < 2 || srcVideo.paused) return;
    if (srcVideo.currentTime === state.lastVideoTime) return;
    state.lastVideoTime = srcVideo.currentTime;
    try {
      var res = state.handLandmarker.detectForVideo(srcVideo, ts);
      if (res && res.landmarks && res.landmarks.length) {
        for (var i = 0; i < res.landmarks.length; i++) {
          var lm = res.landmarks[i];
          if (state.mirror) {
            // 画面镜像后，坐标 x 取反以对齐显示
            lm = lm.map(function (p) { return { x: 1 - p.x, y: p.y, z: p.z }; });
          }
          var hd = '';
          if (res.handednesses && res.handednesses[i] && res.handednesses[i][0]) {
            hd = res.handednesses[i][0].categoryName || '';
          }
          state.hands.push({ lm: lm, handedness: hd });
        }
      }
    } catch (e) {
      state.hands = [];
    }
  }

  var faceDetectCanvas = document.createElement('canvas');
  faceDetectCanvas.width = 320;
  faceDetectCanvas.height = 240;

  function detectFace(frameCanvas) {
    state.faceLandmarks = null;
    if (!state.faceReady || !state.faceLandmarker) return;
    var f = currentFilter();
    if (!f || f.id !== 'slim') return;
    try {
      var fdc = faceDetectCanvas.getContext('2d');
      fdc.clearRect(0, 0, 320, 240);
      fdc.drawImage(frameCanvas, 0, 0, 320, 240);
      var res = state.faceLandmarker.detect(faceDetectCanvas);
      state.faceLandmarks = (res && res.faceLandmarks && res.faceLandmarks.length) ? res.faceLandmarks[0] : null;
    } catch (e) {
      state.faceLandmarks = null;
    }
  }

  // ---- 区域管理 ----
  function videoSize() {
    if (state.sourceType === 'image' && state.imageBitmap) {
      return { w: CONFIG.videoW, h: CONFIG.videoH };
    }
    if ((state.sourceType === 'camera' || state.sourceType === 'video') && srcVideo.videoWidth > 0) {
      return { w: srcVideo.videoWidth, h: srcVideo.videoHeight };
    }
    return { w: CONFIG.videoW, h: CONFIG.videoH };
  }

  function getRegion(i) {
    while (state.regions.length <= i) {
      state.regions.push({
        cx: CONFIG.videoW / 2, cy: CONFIG.videoH / 2,
        r: CONFIG.defaultRadius, targetR: CONFIG.defaultRadius,
        targetX: CONFIG.videoW / 2, targetY: CONFIG.videoH / 2,
        shape: state.shape, active: false, visible: 0
      });
    }
    return state.regions[i];
  }

  function regionScale() {
    return (parseFloat(rngRadius.value) || 100) / 100;
  }

  // 每只手：拇指与食指之间的区域
  function updateRegionsFromHands() {
    var hands = state.hands;
    var size = videoSize();
    var scale = regionScale();
    if (!hands || !hands.length) {
      state.gestureName = '未检测到';
      state.regions.forEach(function (r) { r.active = false; });
      return;
    }
    state.gestureName = '检测到 ' + hands.length + ' 只手';
    var total = Math.max(hands.length, state.regions.length);
    for (var h = 0; h < total; h++) {
      var reg = getRegion(h);
      var lm = hands[h] ? hands[h].lm : null;
      if (!lm) { reg.active = false; continue; }
      var g = GF.Gestures.detect(lm);
      if (g.fist) { reg.active = false; continue; }
      var t4 = lm[4], t8 = lm[8];
      if (!t4 || !t8) { reg.active = false; continue; }
      var midX = (t4.x + t8.x) / 2 * size.w;
      var midY = (t4.y + t8.y) / 2 * size.h;
      var dist = Math.hypot((t4.x - t8.x) * size.w, (t4.y - t8.y) * size.h);
      var tr = Math.max(CONFIG.minRadius, Math.min(CONFIG.maxRadius, dist * 0.9 * scale));
      reg.targetX = midX;
      reg.targetY = midY;
      reg.targetR = tr;
      reg.shape = state.shape;
      reg.active = true;
    }
  }

  function updateRegionsFromMouse() {
    state.gestureName = '鼠标';
    var reg = getRegion(0);
    if (state.mousePos) {
      reg.targetX = state.mousePos.x;
      reg.targetY = state.mousePos.y;
    }
    reg.targetR = CONFIG.defaultRadius * regionScale();
    reg.shape = state.shape;
    reg.active = state.mouseFilterOn;
    for (var i = 1; i < state.regions.length; i++) {
      state.regions[i].active = false;
    }
  }

  function smoothRegions() {
    var k = CONFIG.smooth;
    for (var i = 0; i < state.regions.length; i++) {
      var r = state.regions[i];
      if (r.targetX !== undefined) r.cx += (r.targetX - r.cx) * k;
      if (r.targetY !== undefined) r.cy += (r.targetY - r.cy) * k;
      r.r += (r.targetR - r.r) * k;
      r.visible += (r.active ? 1 : -1) * 0.12;
      r.visible = Math.max(0, Math.min(1, r.visible));
    }
  }

  // ---- 演示画面（无任何画面源时）----
  function drawDemoScene(ctx, w, h, t) {
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#16213e');
    g.addColorStop(0.5, '#1f3b6e');
    g.addColorStop(1, '#3d1e4f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    var i;
    for (i = 0; i < 6; i++) {
      var cx = ((t * 40 * (i + 1) * 0.4) % (w + 140)) - 70;
      var cy = h / 2 + Math.sin(t * (1 + i * 0.3) + i * 1.7) * (h / 2 - 40);
      ctx.fillStyle = 'hsla(' + ((i * 60 + (t * 40) % 360) | 0) + ', 80%, 60%, 0.75)';
      ctx.beginPath();
      ctx.arc(cx, cy, 16 + i * 7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('演示画面（无摄像头 / 未选择画面源）', 20, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '14px sans-serif';
    ctx.fillText('点击「开启摄像头」，或用「图片/视频源」加载本地画面', 20, 60);
  }

  // ---- 主循环 ----
  var lastFrame = 0, frameCount = 0, fpsTime = 0, frameCount2 = 0, faceTick = 0;
  var frameCanvas = document.createElement('canvas');

  function resizeView() {
    var s = videoSize();
    if (view.width !== s.w || view.height !== s.h) {
      view.width = s.w;
      view.height = s.h;
    }
  }

  function drawFrame(ctx, w, h, t) {
    ctx.save();
    if (state.mirror && state.sourceType === 'camera') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    if (state.sourceType === 'camera' && state.cameraOn && srcVideo.readyState >= 2 && srcVideo.videoWidth > 0) {
      ctx.drawImage(srcVideo, 0, 0, w, h);
    } else if (state.sourceType === 'image' && state.imageBitmap) {
      var iw = state.imageBitmap.naturalWidth, ih = state.imageBitmap.naturalHeight;
      var sc = Math.min(w / iw, h / ih);
      var dw = iw * sc, dh = ih * sc;
      ctx.drawImage(state.imageBitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else if (state.sourceType === 'video' && srcVideo.readyState >= 2 && srcVideo.videoWidth > 0) {
      ctx.drawImage(srcVideo, 0, 0, w, h);
    } else {
      drawDemoScene(ctx, w, h, t);
    }
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFingers(ctx, lm, W, H) {
    ctx.save();
    var i, j;
    for (i = 0; i < GF.FINGERS.length; i++) {
      var f = GF.FINGERS[i];
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(lm[f.joints[0]].x * W, lm[f.joints[0]].y * H);
      for (j = 1; j < f.joints.length; j++) {
        ctx.lineTo(lm[f.joints[j]].x * W, lm[f.joints[j]].y * H);
      }
      ctx.stroke();
    }
    if (chkSkeleton.checked) {
      ctx.font = '9px sans-serif';
      for (i = 0; i < lm.length; i++) {
        var jx = lm[i].x * W, jy = lm[i].y * H;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(jx, jy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillText(String(i), jx + 4, jy - 2);
      }
    }
    ctx.font = 'bold 13px sans-serif';
    for (i = 0; i < GF.FINGERS.length; i++) {
      var f2 = GF.FINGERS[i];
      var tip = lm[f2.tip];
      var tx = tip.x * W, ty = tip.y * H;
      var tw = ctx.measureText(f2.name).width + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(tx + 8, ty - 18, tw, 18);
      ctx.fillStyle = f2.color;
      ctx.fillText(f2.name, tx + 12, ty - 4);
      ctx.fillStyle = f2.color;
      ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 每只手一个坐标读数面板（左下角并排）
  function drawFingerReadout(ctx, lm, handLabel, panelX, W, H) {
    var lines = [];
    var i;
    for (i = 0; i < GF.FINGERS.length; i++) {
      var f = GF.FINGERS[i];
      var p = lm[f.tip];
      lines.push({ text: f.name + ' (' + Math.round(p.x * W) + ', ' + Math.round(p.y * H) + ')', color: f.color });
    }
    lines.push({ text: '手腕 (' + Math.round(lm[0].x * W) + ', ' + Math.round(lm[0].y * H) + ')', color: '#ffffff' });
    var lh = 17;
    var bw = 158, bh = lines.length * lh + 20;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(panelX, H - bh - 10, bw, bh);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#7cf5ff';
    ctx.fillText(handLabel, panelX + 6, H - bh + 4);
    ctx.font = '11px sans-serif';
    for (i = 0; i < lines.length; i++) {
      ctx.fillStyle = lines[i].color;
      ctx.fillText(lines[i].text, panelX + 6, H - bh + 20 + i * lh + lh - 4);
    }
  }

  function drawOverlay() {
    var ctx = view.getContext('2d');
    var W = view.width, H = view.height;

    // 滤镜区域轮廓（每只手一个）
    for (var ri = 0; ri < state.regions.length; ri++) {
      var r = state.regions[ri];
      if (!r.active || r.visible <= 0.02) continue;
      ctx.save();
      ctx.globalAlpha = r.visible;
      ctx.strokeStyle = '#7cf5ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      if (r.shape === 'rect') {
        roundRectPath(ctx, r.cx - r.r, r.cy - r.r, r.r * 2, r.r * 2, 10);
      } else {
        ctx.arc(r.cx, r.cy, r.r, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(r.cx - 8, r.cy); ctx.lineTo(r.cx + 8, r.cy);
      ctx.moveTo(r.cx, r.cy - 8); ctx.lineTo(r.cx, r.cy + 8);
      ctx.stroke();
      ctx.fillStyle = '#7cf5ff';
      ctx.font = '12px sans-serif';
      ctx.fillText('滤镜区域 ' + Math.round(r.r * 2) + 'px', r.cx + 14, r.cy - r.r + 14);
      ctx.restore();
    }

    var gname = state.mode === 'hands' ? state.gestureName : '鼠标控制';
    if (gname && gname !== '--' && gname !== '未检测到') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(10, 10, 170, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = '15px sans-serif';
      ctx.fillText(gname, 18, 31);
    }

    if (state.mode === 'hands' && state.hands.length) {
      for (var h = 0; h < state.hands.length; h++) {
        var hand = state.hands[h];
        drawFingers(ctx, hand.lm, W, H);
        var label = (hand.handedness === 'Left' ? '左手' : hand.handedness === 'Right' ? '右手' : '手 ' + (h + 1));
        if (state.mirror) label += '（镜像）';
        drawFingerReadout(ctx, hand.lm, label, 10 + h * 168, W, H);
      }
    }
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    var now = performance.now();
    if (now - lastFrame < 1000 / CONFIG.maxFps) return;
    lastFrame = now;

    frameCount++;
    if (now - fpsTime >= 1000) {
      state.fps = frameCount;
      frameCount = 0;
      fpsTime = now;
    }

    detectHands(now);
    if (state.mode === 'hands') updateRegionsFromHands();
    else updateRegionsFromMouse();
    smoothRegions();

    var size = videoSize();
    resizeView();
    if (frameCanvas.width !== size.w || frameCanvas.height !== size.h) {
      frameCanvas.width = size.w;
      frameCanvas.height = size.h;
    }
    var fctx = frameCanvas.getContext('2d');
    drawFrame(fctx, size.w, size.h, now / 1000);

    faceTick++;
    if (faceTick % 3 === 0) detectFace(frameCanvas);

    var filter = currentFilter();
    GF.render(view, size.w, size.h, function (ctx, w, h) {
      ctx.drawImage(frameCanvas, 0, 0, w, h);
    }, filter, state.regions, state.faceLandmarks);

    drawOverlay();

    // 调试钩子：每 15 帧把渲染统计写入 body.dataset.debug（便于自动化验证）
    frameCount2++;
    if (frameCount2 >= 15) {
      frameCount2 = 0;
      try {
        var dctx2 = view.getContext('2d');
        var imgData = dctx2.getImageData(0, 0, view.width, view.height).data;
        var sum = 0;
        for (var i = 0; i < imgData.length; i += 4999) sum += imgData[i];
        var fbx = null;
        if (state.faceLandmarks && state.faceLandmarks.length > 100) {
          var fminX = 1e9, fmaxX = -1e9, fminY = 1e9, fmaxY = -1e9;
          for (var fi = 0; fi < state.faceLandmarks.length; fi++) {
            var fp = state.faceLandmarks[fi];
            if (fp.x < fminX) fminX = fp.x;
            if (fp.x > fmaxX) fmaxX = fp.x;
            if (fp.y < fminY) fminY = fp.y;
            if (fp.y > fmaxY) fmaxY = fp.y;
          }
          fbx = { cx: Math.round(((fminX + fmaxX) / 2) * view.width), cy: Math.round(((fminY + fmaxY) / 2) * view.height), w: Math.round((fmaxX - fminX) * view.width) };
        }
        var regs = state.regions.map(function (r) {
          return { x: Math.round(r.cx), y: Math.round(r.cy), r: Math.round(r.r), a: r.active, v: Math.round(r.visible * 100) / 100 };
        });
        document.body.dataset.debug = JSON.stringify({
          sum: sum, nonBlack: sum > 0, fps: state.fps,
          gesture: state.gestureName, mode: state.mode,
          filter: currentFilter().id, shape: state.shape, mirror: state.mirror,
          hands: state.hands.length, face: state.faceLandmarks ? state.faceLandmarks.length : 0, faceBox: fbx,
          regions: regs, source: state.sourceType, devices: state.devices.length
        });
      } catch (e) {
        document.body.dataset.debug = 'err:' + e.message;
      }
    }

    statusGesture.textContent = '手势: ' + (state.mode === 'hands' ? state.gestureName : '鼠标控制');
    statusFps.textContent = 'FPS: ' + state.fps;
  }

  // ---- 交互 ----
  function clientToVideo(e) {
    var rect = view.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * view.width,
      y: (e.clientY - rect.top) / rect.height * view.height
    };
  }

  view.addEventListener('mousemove', function (e) {
    if (state.mode !== 'mouse') return;
    state.mousePos = clientToVideo(e);
  });

  view.addEventListener('wheel', function (e) {
    if (state.mode !== 'mouse') return;
    e.preventDefault();
    var v = parseFloat(rngRadius.value) || 100;
    v = Math.max(50, Math.min(250, v + (e.deltaY > 0 ? -10 : 10)));
    rngRadius.value = v;
    lblRadius.textContent = v + '%';
  }, { passive: false });

  view.addEventListener('click', function (e) {
    if (state.mode !== 'mouse') return;
    state.mousePos = clientToVideo(e);
    state.mouseFilterOn = !state.mouseFilterOn;
  });

  btnCam.addEventListener('click', function () {
    if (state.cameraOn) stopCamera();
    else startCamera();
  });

  btnFile.addEventListener('click', function () {
    fileSrc.value = '';
    fileSrc.click();
  });

  fileSrc.addEventListener('change', function () {
    useFileSource(fileSrc.files && fileSrc.files[0]);
  });

  selCam.addEventListener('change', function () {
    if (state.cameraOn) startCamera(selCam.value);
    else if (selCam.value) showToast('已选择摄像头，点击「开启摄像头」');
  });

  selShape.addEventListener('change', function () {
    state.shape = selShape.value;
    for (var i = 0; i < state.regions.length; i++) state.regions[i].shape = state.shape;
    showToast(selShape.value === 'rect' ? '区域形状：矩形' : '区域形状：圆形');
  });

  chkMirror.addEventListener('change', function () {
    state.mirror = chkMirror.checked;
    showToast(state.mirror ? '画面镜像：开' : '画面镜像：关');
  });

  btnMode.addEventListener('click', function () {
    state.mode = state.mode === 'hands' ? 'mouse' : 'hands';
    var isMouse = state.mode === 'mouse';
    btnMode.classList.toggle('active', isMouse);
    btnMode.textContent = isMouse ? '🖱 鼠标模式（点击切回手势）' : '🖱 鼠标模式';
    if (isMouse) showToast('鼠标模式：移动 / 滚轮缩放 / 单击开关');
    else showToast('手势模式：双手拇指+食指之间自动生成滤镜区域');
  });

  rngRadius.addEventListener('input', function () {
    lblRadius.textContent = rngRadius.value + '%';
  });

  btnShot.addEventListener('click', function () {
    var a = document.createElement('a');
    a.download = 'gesture-filter-' + Date.now() + '.png';
    a.href = view.toDataURL('image/png');
    a.click();
    showToast('已保存截图');
  });

  // ---- 启动 ----
  async function loadQuerySource() {
    var src = new URLSearchParams(location.search).get('src');
    if (!src) return;
    try {
      var resp = await fetch(src);
      var blob = await resp.blob();
      var name = src.split('/').pop() || 'source';
      var f = new File([blob], name, { type: blob.type });
      useFileSource(f);
      showToast('已通过 ?src= 加载画面源');
    } catch (e) {
      console.warn('src param load failed:', e);
      showToast('?src= 画面源加载失败');
    }
  }

  function init() {
    resizeView();
    refreshDevices();
    loadHandsModel();
    loadFaceModel();
    startCamera();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', function () { refreshDevices(); });
    }
    loadQuerySource();
    requestAnimationFrame(loop);
  }

  init();
})();
