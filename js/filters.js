(function () {
  'use strict';
  var GF = window.GF = window.GF || {};

  GF.FILTERS = [
    { id: 'none',       label: '无（原始画面）' },
    { id: 'blur',       label: '模糊',     css: 'blur(14px)' },
    { id: 'pixel',      label: '像素化',   type: 'pixel', px: 12 },
    { id: 'mosaic',     label: '马赛克',   type: 'mosaic', block: 16 },
    { id: 'slim',       label: '瘦脸',     type: 'slim', amount: 0.16 },
    { id: 'zoom',       label: '放大镜',   type: 'zoom', zoom: 1.8 },
    { id: 'grayscale',  label: '灰度',     css: 'grayscale(1)' },
    { id: 'invert',     label: '反色',     css: 'invert(1)' },
    { id: 'sepia',      label: '怀旧',     css: 'sepia(0.85) contrast(1.1)' },
    { id: 'hue',        label: '色相偏移', css: 'hue-rotate(130deg) saturate(1.5)' },
    { id: 'vivid',      label: '鲜艳',     css: 'saturate(2.2) contrast(1.25)' }
  ];

  function ensureCanvases(w, h) {
    if (!GF._cvs) {
      GF._cvs = {
        base: document.createElement('canvas'),
        effect: document.createElement('canvas'),
        mask: document.createElement('canvas'),
        rectMask: document.createElement('canvas'),
        small: document.createElement('canvas')
      };
    }
    var list = [GF._cvs.base, GF._cvs.effect, GF._cvs.mask, GF._cvs.rectMask];
    for (var i = 0; i < list.length; i++) {
      if (list[i].width !== w || list[i].height !== h) { list[i].width = w; list[i].height = h; }
    }
    return GF._cvs;
  }

  function makeCircleMask(ctx, w, h, cx, cy, r) {
    ctx.clearRect(0, 0, w, h);
    if (r <= 0) return;
    var g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function makeRectMask(ctx, w, h, cx, cy, r) {
    ctx.clearRect(0, 0, w, h);
    if (r <= 0) return;
    var temp = GF._cvs.rectMask;
    var tctx = temp.getContext('2d');
    tctx.clearRect(0, 0, w, h);
    tctx.fillStyle = '#fff';
    tctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.filter = 'blur(10px)';
    ctx.drawImage(temp, 0, 0, w, h);
    ctx.filter = 'none';
  }

  function drawMosaic(ctx, src, w, h, block) {
    var blk = Math.max(4, block | 0);
    var small = GF._cvs.small;
    var sw = Math.max(1, Math.round(w / blk));
    var sh = Math.max(1, Math.round(h / blk));
    if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
    var sc = small.getContext('2d');
    sc.imageSmoothingEnabled = false;
    sc.clearRect(0, 0, sw, sh);
    sc.drawImage(src, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    // 网格线，增强马赛克质感
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = 0; gx <= w; gx += blk) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
    for (var gy = 0; gy <= h; gy += blk) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
    ctx.stroke();
  }

  // ---- 瘦脸：脸颊区域向脸中心方向采样外推，使脸廓看起来更窄 ----
  // 纯函数，便于测试：返回 (px,py) 处应采样的源点
  GF.slimDisplacement = function (px, py, Cx, Cy, Fx, Fy, R, amount) {
    var dxc = px - Cx, dyc = py - Cy;
    var dc = Math.sqrt(dxc * dxc + dyc * dyc);
    if (dc >= R || dc < 0.0001) return { x: px, y: py };
    var t = dc / R;
    var fall = Math.pow(Math.sin(Math.PI * 0.5 * t), 2);
    var k = amount * R * fall;
    var fx = px - Fx, fy = py - Fy;
    var fd = Math.sqrt(fx * fx + fy * fy) || 1;
    return { x: px + (fx / fd) * k, y: py + (fy / fd) * k };
  };

  function applySlim(ctx, w, h, face, filter) {
    if (!face || face.length < 468) return;
    var L = face[93], Rt = face[323], N = face[168] || face[1];
    if (!L || !Rt || !N) return;
    var F = { x: (L.x + Rt.x) / 2, y: (L.y + Rt.y) / 2 };
    var R = Math.hypot((L.x - Rt.x) * w, (L.y - Rt.y) * h) * 0.55;
    if (R < 10) return;
    var amount = (filter && filter.amount) || 0.16;
    var C1 = { x: L.x * w, y: L.y * h };
    var C2 = { x: Rt.x * w, y: Rt.y * h };
    var Fc = { x: F.x * w, y: F.y * h };

    var img = ctx.getImageData(0, 0, w, h);
    var out = new Uint8ClampedArray(img.data);
    var src = img.data;

    function warp(Cx, Cy) {
      var x0 = Math.max(0, Math.floor(Cx - R)), x1 = Math.min(w - 1, Math.ceil(Cx + R));
      var y0 = Math.max(0, Math.floor(Cy - R)), y1 = Math.min(h - 1, Math.ceil(Cy + R));
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var dx = x - Cx, dy = y - Cy;
          var dc = Math.sqrt(dx * dx + dy * dy);
          if (dc >= R || dc < 0.0001) continue;
          var t = dc / R;
          var fall = Math.pow(Math.sin(Math.PI * 0.5 * t), 2);
          var k = amount * R * fall;
          var fx = x - Fc.x, fy = y - Fc.y;
          var fd = Math.sqrt(fx * fx + fy * fy) || 1;
          var sx = x + (fx / fd) * k;
          var sy = y + (fy / fd) * k;
          var ix = Math.max(0, Math.min(w - 1, Math.round(sx)));
          var iy = Math.max(0, Math.min(h - 1, Math.round(sy)));
          var i = (iy * w + ix) * 4;
          var o = (y * w + x) * 4;
          out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = src[i + 3];
        }
      }
    }
    warp(C1.x, C1.y);
    warp(C2.x, C2.y);
    ctx.putImageData(new ImageData(out, w, h), 0, 0);
  }

  function drawEffect(ctx, filter, src, w, h, cx, cy, face) {
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    if (!filter || filter.id === 'none') {
      ctx.drawImage(src, 0, 0, w, h);
    } else if (filter.type === 'mosaic') {
      drawMosaic(ctx, src, w, h, filter.block);
    } else if (filter.type === 'pixel') {
      var s = Math.max(2, filter.px | 0);
      var small = GF._cvs.small;
      var sw = Math.max(1, Math.round(w / s));
      var sh = Math.max(1, Math.round(h / s));
      if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
      var sc = small.getContext('2d');
      sc.imageSmoothingEnabled = false;
      sc.clearRect(0, 0, sw, sh);
      sc.drawImage(src, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, w, h);
    } else if (filter.type === 'zoom') {
      ctx.translate(cx, cy);
      ctx.scale(filter.zoom, filter.zoom);
      ctx.drawImage(src, -cx, -cy, w, h);
    } else if (filter.type === 'slim') {
      ctx.drawImage(src, 0, 0, w, h);
      applySlim(ctx, w, h, face, filter);
    } else if (filter.css) {
      ctx.filter = filter.css;
      ctx.drawImage(src, 0, 0, w, h);
      ctx.filter = 'none';
    } else {
      ctx.drawImage(src, 0, 0, w, h);
    }
    ctx.restore();
  }

  // 每帧渲染：画面 → 多个区域蒙版 + 效果层 → 合成到显示画布
  GF.render = function (display, w, h, sourceDraw, filter, regions, face) {
    var cvs = ensureCanvases(w, h);
    var bctx = cvs.base.getContext('2d');
    bctx.clearRect(0, 0, w, h);
    sourceDraw(bctx, w, h);

    var dctx = display.getContext('2d');
    dctx.clearRect(0, 0, w, h);
    dctx.drawImage(cvs.base, 0, 0, w, h);

    if (!regions || !regions.length) return;
    if (!filter || filter.id === 'none') return;

    var ectx = cvs.effect.getContext('2d');
    var mctx = cvs.mask.getContext('2d');
    for (var i = 0; i < regions.length; i++) {
      var region = regions[i];
      if (!region || !region.active || region.visible <= 0.01) continue;

      drawEffect(ectx, filter, cvs.base, w, h, region.cx, region.cy, face);

      if (region.shape === 'rect') {
        makeRectMask(mctx, w, h, region.cx, region.cy, Math.max(1, region.r));
      } else {
        makeCircleMask(mctx, w, h, region.cx, region.cy, Math.max(1, region.r));
      }

      ectx.globalCompositeOperation = 'destination-in';
      ectx.drawImage(cvs.mask, 0, 0, w, h);
      ectx.globalCompositeOperation = 'source-over';

      dctx.save();
      dctx.globalAlpha = Math.max(0, Math.min(1, region.visible));
      dctx.drawImage(cvs.effect, 0, 0, w, h);
      dctx.restore();
    }
  };
})();
