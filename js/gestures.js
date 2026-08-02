(function () {
  'use strict';
  var GF = window.GF = window.GF || {};

  function dist(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  }

  GF.HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
  ];

  GF.FINGERS = [
    { name: '拇指',   color: '#ff6b9d', joints: [1, 2, 3, 4], tip: 4 },
    { name: '食指',   color: '#7cf5ff', joints: [5, 6, 7, 8], tip: 8 },
    { name: '中指',   color: '#b18cff', joints: [9, 10, 11, 12], tip: 12 },
    { name: '无名指', color: '#ffd57d', joints: [13, 14, 15, 16], tip: 16 },
    { name: '小指',   color: '#7dffb0', joints: [17, 18, 19, 20], tip: 20 }
  ];

  GF.Gestures = {
    detect: function (lm) {
      var none = {
        name: '未检测到', pinch: false, pointing: false, fist: false, palm: false,
        pinchDist: 1, indexPoint: null, palmCenter: null, pinchCenter: null
      };
      if (!lm || lm.length < 21) return none;

      var thumbTip = lm[4], indexTip = lm[8], indexPip = lm[6];
      var middleTip = lm[12], middlePip = lm[10];
      var ringTip = lm[16], ringPip = lm[14];
      var pinkyTip = lm[20], pinkyPip = lm[18];
      var wrist = lm[0], middleMcp = lm[9];

      var tol = 0.035;
      function ext(tip, pip) { return tip.y < pip.y - tol; }
      var indexUp = ext(indexTip, indexPip);
      var middleUp = ext(middleTip, middlePip);
      var ringUp = ext(ringTip, ringPip);
      var pinkyUp = ext(pinkyTip, pinkyPip);

      var pinchDist = dist(thumbTip, indexTip);
      var allCurled = !indexUp && !middleUp && !ringUp && !pinkyUp;
      var pinch = pinchDist < 0.075;
      var pointing = indexUp && !middleUp && !ringUp && !pinkyUp;
      var palm = indexUp && middleUp && ringUp && pinkyUp;

      var fist = false;
      var name = '其他';
      if (allCurled) { fist = true; name = '握拳 ✊'; }
      else if (pinch) name = '捏合 🤏';
      else if (pointing) name = '指点 ☝️';
      else if (palm) name = '手掌 ✋';

      return {
        name: name,
        pinch: pinch, pointing: pointing, fist: fist, palm: palm,
        pinchDist: pinchDist,
        indexPoint: indexTip,
        pinchCenter: { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 },
        palmCenter: { x: (wrist.x + middleMcp.x) / 2, y: (wrist.y + middleMcp.y) / 2 },
        fingers: { indexUp: indexUp, middleUp: middleUp, ringUp: ringUp, pinkyUp: pinkyUp }
      };
    }
  };
})();
