(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  GF.CONFIG = {
    visionVersion: '0.10.17',
    modelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    faceModelUrl: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    videoW: 640,
    videoH: 480,
    defaultRadius: 90,
    minRadius: 24,
    maxRadius: 200,
    smooth: 0.3,
    maxFps: 30,
    noHandTimeoutMs: 600
  };
})();
