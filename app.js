// ------- DOM -------
const fileInput = document.getElementById('fileInput');
const cornerSection = document.getElementById('cornerSection');
const resultSection = document.getElementById('resultSection');
const cornerCanvas = document.getElementById('cornerCanvas');
const resultCanvas = document.getElementById('resultCanvas');
const magnifierCanvas = document.getElementById('magnifierCanvas');
const magnifierToggle = document.getElementById('magnifierToggle');
const resetCornersBtn = document.getElementById('resetCornersBtn');
const applyCornersBtn = document.getElementById('applyCornersBtn');
const backToCornersBtn = document.getElementById('backToCornersBtn');
const rotateBtn = document.getElementById('rotateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const autoEnhanceBtn = document.getElementById('autoEnhanceBtn');
const resetColorBtn = document.getElementById('resetColorBtn');
const brightnessInput = document.getElementById('brightness');
const contrastInput = document.getElementById('contrast');
const grayscaleToggle = document.getElementById('grayscaleToggle');
const binarizeToggle = document.getElementById('binarizeToggle');
const thresholdField = document.getElementById('thresholdField');
const thresholdInput = document.getElementById('threshold');
const colorControls = document.getElementById('colorControls');
const cornerHint = document.getElementById('cornerHint');
const ratioReadout = document.getElementById('ratioReadout');
const aspectRatioSelect = document.getElementById('aspectRatioSelect');
const applySuggestedRatioBtn = document.getElementById('applySuggestedRatioBtn');

// 「仕上がりのサイズ」で指定できる縦横比(高さ/幅)と表示名
const ASPECT_RATIOS = {
  'a4-portrait': 297 / 210,
  'a4-landscape': 210 / 297,
  'a5-portrait': 210 / 148,
  'a5-landscape': 148 / 210,
  'b5-portrait': 257 / 182,
  'b5-landscape': 182 / 257,
  'postcard-portrait': 148 / 100,
  'postcard-landscape': 100 / 148,
  'card-portrait': 88 / 63,
  'card-landscape': 63 / 88,
  'small-card-portrait': 86 / 59,
  'small-card-landscape': 59 / 86,
  'business-card': 55 / 91,
  'id-card': 54 / 85.6,
  square: 1,
};

const ASPECT_RATIO_LABELS = {
  'a4-portrait': 'A4・縦',
  'a4-landscape': 'A4・横',
  'a5-portrait': 'A5・縦',
  'a5-landscape': 'A5・横',
  'b5-portrait': 'B5・縦',
  'b5-landscape': 'B5・横',
  'postcard-portrait': 'はがき・縦',
  'postcard-landscape': 'はがき・横',
  'card-portrait': 'ポケモン/MTG等',
  'card-landscape': 'ポケモン/MTG等',
  'small-card-portrait': '遊戯王/デュエマ等',
  'small-card-landscape': '遊戯王/デュエマ等',
  'business-card': '名刺',
  'id-card': 'ICカード・クレジットカード',
  square: '正方形',
};

// 自動モード時、実測の比率に一番近いプリセットを提案する(この相対誤差以内なら提案する)
const RATIO_SUGGESTION_TOLERANCE = 0.06;

function findClosestPreset(measuredRatio) {
  let bestKey = null;
  let bestDiff = Infinity;
  for (const [key, ratio] of Object.entries(ASPECT_RATIOS)) {
    const diff = Math.abs(Math.log(measuredRatio / ratio));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestKey = key;
    }
  }
  if (bestKey === null) return null;
  const relError = Math.abs(ASPECT_RATIOS[bestKey] - measuredRatio) / ASPECT_RATIOS[bestKey];
  return relError <= RATIO_SUGGESTION_TOLERANCE ? bestKey : null;
}

const cornerCtx = cornerCanvas.getContext('2d');
const magnifierCtx = magnifierCanvas.getContext('2d');

// ------- 状態 -------
let sourceImage = null;      // 読み込んだ元画像(Image)
let sourceCanvasClean = null; // 補正計算用(オーバーレイなしの元画像)
let corners = [];             // [{x,y} x4] 画像ピクセル座標、順序: 左上,右上,右下,左下
let draggingIndex = -1;
let userHasAdjustedCorners = false; // 手動でドラッグしたら、後から自動検出結果で上書きしないためのフラグ
let correctedCanvas = null;   // 表示・保存用の画像(自動調整などを反映した状態)
let pristineCanvas = null;    // 正面補正直後の未加工画像(自動調整を毎回ここから計算し直すための原本)
let binarizeDebounceTimer = null;

function cloneCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// ------- OpenCV.js(自動四隅検出用) -------
let cvReady = false;
if (typeof cv !== 'undefined') {
  cv['onRuntimeInitialized'] = () => {
    cvReady = true;
  };
}

// ------- 画像の読み込み -------
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadImage(file);
});

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const image = new Image();
    image.onload = () => {
      sourceImage = image;

      sourceCanvasClean = document.createElement('canvas');
      sourceCanvasClean.width = image.naturalWidth;
      sourceCanvasClean.height = image.naturalHeight;
      sourceCanvasClean.getContext('2d').drawImage(image, 0, 0);

      cornerCanvas.width = image.naturalWidth;
      cornerCanvas.height = image.naturalHeight;
      corners = defaultCorners(image.naturalWidth, image.naturalHeight);
      userHasAdjustedCorners = false;

      drawCornerOverlay();
      resultSection.hidden = true;
      cornerSection.hidden = false;

      // まずデフォルト位置を表示しつつ、自動検出できればすぐに四隅を差し替える
      if (cvReady) {
        cornerHint.textContent = '書類の四隅を自動検出しています...';
        setTimeout(() => {
          const detected = autoDetectCorners(sourceCanvasClean);
          // 検出待ちの間にユーザーが先に手動調整していたら、その操作を上書きしない
          if (detected && !userHasAdjustedCorners) {
            corners = orderPoints(detected);
            drawCornerOverlay();
          }
          cornerHint.textContent = '紙・書類の4つの角に、丸いハンドルを合わせてください';
        }, 30);
      }
    };
    image.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 撮影された写真から、書類らしき最大の四角形の輪郭を自動検出する
function autoDetectCorners(canvas) {
  if (typeof cv === 'undefined' || !cvReady) return null;

  const maxDetectSize = 900; // 検出処理を軽くするため縮小して解析する
  const scale = Math.min(1, maxDetectSize / Math.max(canvas.width, canvas.height));
  const detectCanvas = document.createElement('canvas');
  detectCanvas.width = Math.max(1, Math.round(canvas.width * scale));
  detectCanvas.height = Math.max(1, Math.round(canvas.height * scale));
  detectCanvas.getContext('2d').drawImage(canvas, 0, 0, detectCanvas.width, detectCanvas.height);

  function isConvexQuad(pts) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const c = pts[(i + 2) % 4];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 1e-6) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  // 点群(輪郭全体)に対し、辺ごとに直線を当てはめて交点から角を求める
  // (輪郭の一部が途切れていても、辺全体の傾向から角を復元できるため頑丈)
  function fitQuadByLines(contourPts, seedBox) {
    function pointToLineDist(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    }

    const seedEdges = [
      [seedBox[0], seedBox[1]],
      [seedBox[1], seedBox[2]],
      [seedBox[2], seedBox[3]],
      [seedBox[3], seedBox[0]],
    ];
    const rectDiag = dist(seedBox[0], seedBox[2]) || 1;
    const threshold = rectDiag * 0.04;

    const groups = [[], [], [], []];
    for (const p of contourPts) {
      let bestIdx = -1;
      let bestDist = Infinity;
      seedEdges.forEach(([a, b], idx) => {
        const d = pointToLineDist(p, a, b);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      if (bestDist < threshold) groups[bestIdx].push(p);
    }

    // 各辺の点群に対し、全最小二乗(主成分方向)で直線を1本求める
    function fitLineTLS(pts) {
      if (pts.length < Math.max(10, contourPts.length * 0.02)) return null;
      const n = pts.length;
      let mx = 0;
      let my = 0;
      pts.forEach((p) => {
        mx += p.x;
        my += p.y;
      });
      mx /= n;
      my /= n;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      pts.forEach((p) => {
        const dx = p.x - mx;
        const dy = p.y - my;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
      });
      const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      return { x0: mx, y0: my, dx: Math.cos(theta), dy: Math.sin(theta) };
    }

    const lines = groups.map(fitLineTLS);
    if (lines.some((l) => !l)) return null;

    function intersect(l1, l2) {
      const denom = l1.dx * l2.dy - l1.dy * l2.dx;
      if (Math.abs(denom) < 1e-9) return null;
      const dx = l2.x0 - l1.x0;
      const dy = l2.y0 - l1.y0;
      const t = (dx * l2.dy - dy * l2.dx) / denom;
      return { x: l1.x0 + t * l1.dx, y: l1.y0 + t * l1.dy };
    }

    const corners = [
      intersect(lines[3], lines[0]),
      intersect(lines[0], lines[1]),
      intersect(lines[1], lines[2]),
      intersect(lines[2], lines[3]),
    ];
    if (corners.some((c) => !c)) return null;
    return corners;
  }

  // 二値化マスク(輪郭候補の領域)から、書類らしい4隅を検出する
  // まず直線フィッティングで高精度に求め、失敗した場合のみ多角形近似にフォールバックする
  function findQuadFromMask(mask) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    // CHAIN_APPROX_NONE: 直線フィッティングに使う点を間引かず全て残す
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

    const imgArea = detectCanvas.width * detectCanvas.height;
    const detectDiag = Math.hypot(detectCanvas.width, detectCanvas.height);
    const EPSILON_RATIOS = [0.01, 0.02, 0.03, 0.05];

    let candidates = [];
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area >= imgArea * 0.1) {
        candidates.push({ cnt, area });
      } else {
        cnt.delete();
      }
    }
    candidates.sort((a, b) => b.area - a.area);

    function isValidQuad(pts) {
      if (!isConvexQuad(pts)) return false;
      const sideLengths = [
        dist(pts[0], pts[1]),
        dist(pts[1], pts[2]),
        dist(pts[2], pts[3]),
        dist(pts[3], pts[0]),
      ];
      return Math.min(...sideLengths) > detectDiag * 0.15;
    }

    let found = null;
    for (const { cnt } of candidates) {
      if (found) break;

      // 1) 直線フィッティングによる高精度検出
      const rect = cv.minAreaRect(cnt);
      const seedBox = cv.RotatedRect.points(rect);
      const contourPts = [];
      for (let i = 0; i < cnt.data32S.length; i += 2) {
        contourPts.push({ x: cnt.data32S[i], y: cnt.data32S[i + 1] });
      }
      const refined = fitQuadByLines(contourPts, seedBox);
      if (refined && isValidQuad(refined)) {
        found = refined.map((p) => ({ x: p.x / scale, y: p.y / scale }));
        break;
      }

      // 2) だめなら多角形近似(許容誤差を複数試す)にフォールバック
      const peri = cv.arcLength(cnt, true);
      for (const ratio of EPSILON_RATIOS) {
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, ratio * peri, true);
        if (approx.rows === 4) {
          const pts = [];
          for (let i = 0; i < 4; i++) {
            pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
          }
          if (isValidQuad(pts)) {
            found = pts.map((p) => ({ x: p.x / scale, y: p.y / scale }));
            approx.delete();
            break;
          }
        }
        approx.delete();
      }
    }

    candidates.forEach(({ cnt }) => cnt.delete());
    contours.delete();
    hierarchy.delete();
    return found;
  }

  let src, gray, blurred, edges, dilated, kernel, rgb, hsv, satMask, satKernel;
  let resultPoints = null;

  try {
    src = cv.imread(detectCanvas);

    // 1) エッジ(Canny)ベースの検出。背景と被写体の境界がはっきりしている場合に有効
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 40, 140);
    dilated = new cv.Mat();
    kernel = cv.Mat.ones(7, 7, cv.CV_8U);
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2);
    resultPoints = findQuadFromMask(dilated);

    // 2) 彩度ベースの検出(色付きの被写体を、彩度の低い机・床などの背景から切り分ける)
    //    エッジ検出だけでは境界に切れ目ができて失敗するケースの補完として試す
    if (!resultPoints) {
      rgb = new cv.Mat();
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
      hsv = new cv.Mat();
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      satMask = new cv.Mat();
      // S(彩度)チャンネルだけを閾値処理する(HSVは H,S,V の3チャンネル)
      const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 50, 0, 0]);
      const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [179, 255, 255, 255]);
      cv.inRange(hsv, low, high, satMask);
      low.delete();
      high.delete();
      satKernel = cv.Mat.ones(15, 15, cv.CV_8U);
      cv.morphologyEx(satMask, satMask, cv.MORPH_CLOSE, satKernel);
      cv.morphologyEx(satMask, satMask, cv.MORPH_OPEN, satKernel);
      resultPoints = findQuadFromMask(satMask);
    }
  } catch (err) {
    resultPoints = null;
  } finally {
    [src, gray, blurred, edges, dilated, kernel, rgb, hsv, satMask, satKernel].forEach((m) => {
      if (m && typeof m.delete === 'function') m.delete();
    });
  }

  return resultPoints;
}

function defaultCorners(w, h) {
  const mx = w * 0.08;
  const my = h * 0.08;
  return [
    { x: mx, y: my },         // 左上
    { x: w - mx, y: my },     // 右上
    { x: w - mx, y: h - my }, // 右下
    { x: mx, y: h - my },     // 左下
  ];
}

// ------- 四隅ハンドルの描画・操作 -------
function drawCornerOverlay() {
  cornerCtx.clearRect(0, 0, cornerCanvas.width, cornerCanvas.height);
  cornerCtx.drawImage(sourceImage, 0, 0, cornerCanvas.width, cornerCanvas.height);

  cornerCtx.strokeStyle = '#6366f1';
  cornerCtx.lineWidth = Math.max(2, cornerCanvas.width * 0.004);
  cornerCtx.beginPath();
  corners.forEach((p, i) => {
    if (i === 0) cornerCtx.moveTo(p.x, p.y);
    else cornerCtx.lineTo(p.x, p.y);
  });
  cornerCtx.closePath();
  cornerCtx.stroke();

  const r = cornerCanvas.width * 0.02;
  corners.forEach((p) => {
    cornerCtx.beginPath();
    cornerCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
    cornerCtx.fillStyle = 'rgba(99, 102, 241, 0.85)';
    cornerCtx.fill();
    cornerCtx.lineWidth = Math.max(2, cornerCanvas.width * 0.003);
    cornerCtx.strokeStyle = '#fff';
    cornerCtx.stroke();
  });

  updateRatioReadout();
}

// 四隅の現在位置から、仕上がりの横:縦比をリアルタイムで表示する
// (実物の比率が分かっている場合、この数字を見ながら角を微調整できるようにするため)
function updateRatioReadout() {
  if (corners.length !== 4) return;
  const ordered = orderPoints(corners);
  const widthTop = dist(ordered[0], ordered[1]);
  const widthBottom = dist(ordered[3], ordered[2]);
  const heightLeft = dist(ordered[0], ordered[3]);
  const heightRight = dist(ordered[1], ordered[2]);
  const w = Math.max(widthTop, widthBottom);
  const h = Math.max(heightLeft, heightRight);
  if (w <= 0) return;

  const measuredRatio = h / w;
  const forcedRatio = ASPECT_RATIOS[aspectRatioSelect.value];

  if (forcedRatio) {
    ratioReadout.textContent = `検出した比率 1 : ${measuredRatio.toFixed(2)} → 指定サイズに合わせて 1 : ${forcedRatio.toFixed(2)} にします`;
    applySuggestedRatioBtn.hidden = true;
  } else {
    ratioReadout.textContent = `現在の比率 横:縦 ≈ 1 : ${measuredRatio.toFixed(2)}`;

    // 自動モードのときは、実測の比率に近いプリセットがあれば提案する
    const suggestedKey = findClosestPreset(measuredRatio);
    if (suggestedKey) {
      applySuggestedRatioBtn.textContent = `この比率は「${ASPECT_RATIO_LABELS[suggestedKey]}」に近いです。合わせる`;
      applySuggestedRatioBtn.dataset.presetKey = suggestedKey;
      applySuggestedRatioBtn.hidden = false;
    } else {
      applySuggestedRatioBtn.hidden = true;
    }
  }
}

aspectRatioSelect.addEventListener('change', updateRatioReadout);

applySuggestedRatioBtn.addEventListener('click', () => {
  const key = applySuggestedRatioBtn.dataset.presetKey;
  if (!key) return;
  aspectRatioSelect.value = key;
  updateRatioReadout();
});

function canvasPointFromEvent(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function hitTestCorner(p) {
  const hitRadius = cornerCanvas.width * 0.06;
  let bestIdx = -1;
  let bestDist = Infinity;
  corners.forEach((c, i) => {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < hitRadius && d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  });
  return bestIdx;
}

cornerCanvas.addEventListener('pointerdown', (e) => {
  if (!sourceImage) return;
  const p = canvasPointFromEvent(cornerCanvas, e);
  draggingIndex = hitTestCorner(p);
  if (draggingIndex !== -1) {
    userHasAdjustedCorners = true;
    updateMagnifier(corners[draggingIndex], e.clientX, e.clientY);
  }
});

cornerCanvas.addEventListener('pointermove', (e) => {
  if (draggingIndex === -1) return;
  const p = canvasPointFromEvent(cornerCanvas, e);
  corners[draggingIndex] = {
    x: Math.min(cornerCanvas.width, Math.max(0, p.x)),
    y: Math.min(cornerCanvas.height, Math.max(0, p.y)),
  };
  drawCornerOverlay();
  updateMagnifier(corners[draggingIndex], e.clientX, e.clientY);
  e.preventDefault();
});

window.addEventListener('pointerup', () => {
  draggingIndex = -1;
  hideMagnifier();
});

// ------- 角ドラッグ中の拡大ルーペ(指で隠れる部分を拡大表示して正確に合わせやすくする) -------
const MAGNIFIER_ZOOM = 3;

function updateMagnifier(canvasPoint, clientX, clientY) {
  if (!sourceImage) return;
  if (!magnifierToggle.checked) {
    hideMagnifier();
    return;
  }
  const size = magnifierCanvas.width;
  const srcHalf = size / MAGNIFIER_ZOOM / 2;

  magnifierCtx.clearRect(0, 0, size, size);
  magnifierCtx.drawImage(
    sourceImage,
    canvasPoint.x - srcHalf,
    canvasPoint.y - srcHalf,
    srcHalf * 2,
    srcHalf * 2,
    0,
    0,
    size,
    size
  );

  magnifierCtx.strokeStyle = 'rgba(99, 102, 241, 0.9)';
  magnifierCtx.lineWidth = 1.5;
  magnifierCtx.beginPath();
  magnifierCtx.moveTo(size / 2, 0);
  magnifierCtx.lineTo(size / 2, size);
  magnifierCtx.moveTo(0, size / 2);
  magnifierCtx.lineTo(size, size / 2);
  magnifierCtx.stroke();
  magnifierCtx.beginPath();
  magnifierCtx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
  magnifierCtx.strokeStyle = '#fff';
  magnifierCtx.stroke();

  // 指の真上ではなく、少し上にずらして表示する(指で隠れないように)
  const size2 = size; // 見やすさのための別名
  let left = clientX - size2 / 2;
  let top = clientY - size2 - 30;
  left = Math.max(4, Math.min(window.innerWidth - size2 - 4, left));
  top = Math.max(4, top);

  magnifierCanvas.style.left = `${left}px`;
  magnifierCanvas.style.top = `${top}px`;
  magnifierCanvas.style.display = 'block';
}

function hideMagnifier() {
  magnifierCanvas.style.display = 'none';
}

resetCornersBtn.addEventListener('click', () => {
  if (!sourceImage) return;
  corners = defaultCorners(cornerCanvas.width, cornerCanvas.height);
  userHasAdjustedCorners = true;
  drawCornerOverlay();
});

// ------- ホモグラフィ(4点透視変換)計算 -------
function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

// src の4点 -> dst の4点 に対応するホモグラフィ行列(3x3, 配列9要素)を求める
function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const h = solveLinearSystem(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 4点を実際の幾何位置から 左上,右上,右下,左下 の順に並べ直す
// (ドラッグ順が多少前後しても、透視変換が歪まないようにするため)
function orderPoints(pts) {
  const sums = pts.map((p) => p.x + p.y);
  const diffs = pts.map((p) => p.y - p.x);
  const tl = pts[sums.indexOf(Math.min(...sums))];
  const br = pts[sums.indexOf(Math.max(...sums))];
  const tr = pts[diffs.indexOf(Math.min(...diffs))];
  const bl = pts[diffs.indexOf(Math.max(...diffs))];
  return [tl, tr, br, bl];
}

const MAX_OUTPUT_SIZE = 4500; // 元写真とほぼ同等の解像度を保ちつつ、極端に大きい場合のみ抑制

function warpPerspective(srcCanvas, srcCorners, outW, outH) {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  const srcData = srcCanvas.getContext('2d').getImageData(0, 0, sw, sh).data;

  const dstCorners = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  // 出力画素 -> 元画像画素 への変換(逆マッピングでサンプリングするため dst->src で計算)
  const H = computeHomography(dstCorners, srcCorners);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  const outImageData = outCtx.createImageData(outW, outH);
  const outData = outImageData.data;

  for (let Y = 0; Y < outH; Y++) {
    for (let X = 0; X < outW; X++) {
      const w_ = H[6] * X + H[7] * Y + H[8];
      const sx = (H[0] * X + H[1] * Y + H[2]) / w_;
      const sy = (H[3] * X + H[4] * Y + H[5]) / w_;
      const outIdx = (Y * outW + X) * 4;

      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        outData[outIdx] = 255;
        outData[outIdx + 1] = 255;
        outData[outIdx + 2] = 255;
        outData[outIdx + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      for (let c = 0; c < 4; c++) {
        const top = srcData[i00 + c] * (1 - fx) + srcData[i10 + c] * fx;
        const bot = srcData[i01 + c] * (1 - fx) + srcData[i11 + c] * fx;
        outData[outIdx + c] = top * (1 - fy) + bot * fy;
      }
    }
  }

  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas;
}

// ラプラシアンを使った軽いシャープ化(アンシャープマスク相当)。
// 色を保ったまま文字の輪郭をくっきりさせ、読みやすさを上げる。
function sharpenCanvas(canvas, strength) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[o] = src[o];
        out[o + 1] = src[o + 1];
        out[o + 2] = src[o + 2];
        out[o + 3] = src[o + 3];
        continue;
      }
      const oUp = o - w * 4;
      const oDown = o + w * 4;
      const oLeft = o - 4;
      const oRight = o + 4;
      for (let c = 0; c < 3; c++) {
        const center = src[o + c];
        const lap = center * 4 - src[oUp + c] - src[oDown + c] - src[oLeft + c] - src[oRight + c];
        out[o + c] = Math.min(255, Math.max(0, center + lap * strength));
      }
      out[o + 3] = src[o + 3];
    }
  }

  imageData.data.set(out);
  ctx.putImageData(imageData, 0, 0);
}

applyCornersBtn.addEventListener('click', () => {
  if (!sourceCanvasClean) return;
  applyCornersBtn.disabled = true;
  applyCornersBtn.textContent = '処理中...';

  setTimeout(() => {
    const ordered = orderPoints(corners);
    const widthTop = dist(ordered[0], ordered[1]);
    const widthBottom = dist(ordered[3], ordered[2]);
    const heightLeft = dist(ordered[0], ordered[3]);
    const heightRight = dist(ordered[1], ordered[2]);

    let outW = Math.round(Math.max(widthTop, widthBottom));
    let outH = Math.round(Math.max(heightLeft, heightRight));

    // 「仕上がりのサイズ」が指定されている場合は、実測の幅を基準に正しい比率へ高さを合わせ直す
    // (四隅の位置合わせに多少の誤差があっても、指定サイズの正しい比率になるようにするため)
    const forcedRatio = ASPECT_RATIOS[aspectRatioSelect.value];
    if (forcedRatio) {
      outH = Math.round(outW * forcedRatio);
    }

    const longSide = Math.max(outW, outH);
    if (longSide > MAX_OUTPUT_SIZE) {
      const scale = MAX_OUTPUT_SIZE / longSide;
      outW = Math.max(1, Math.round(outW * scale));
      outH = Math.max(1, Math.round(outH * scale));
    }

    correctedCanvas = warpPerspective(sourceCanvasClean, ordered, outW, outH);
    // カラーのままでも文字が読みやすくなるよう、正面補正の直後に軽くシャープ化しておく
    sharpenCanvas(correctedCanvas, 0.2);
    pristineCanvas = cloneCanvas(correctedCanvas);

    applyCornersBtn.disabled = false;
    applyCornersBtn.textContent = 'この形で正面補正する';
    cornerSection.hidden = true;
    resultSection.hidden = false;

    resetColorControls();
    renderResult();
  }, 30);
});

// 明るさ・コントラスト・グレースケール・二値化の状態を初期値に戻す
function resetColorControls() {
  brightnessInput.value = 100;
  contrastInput.value = 110;
  grayscaleToggle.checked = false;
  binarizeToggle.checked = false;
  thresholdInput.value = 0;
  thresholdField.hidden = true;
  colorControls.style.opacity = 1;
  brightnessInput.disabled = false;
  contrastInput.disabled = false;
  grayscaleToggle.disabled = false;
}

backToCornersBtn.addEventListener('click', () => {
  resultSection.hidden = true;
  cornerSection.hidden = false;
});

// 補正後、向きが横倒し・上下逆になった場合のための90度回転(時計回り)
function rotateCanvas90(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const rotated = document.createElement('canvas');
  rotated.width = h;
  rotated.height = w;
  const rctx = rotated.getContext('2d');
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate(Math.PI / 2);
  rctx.drawImage(canvas, -w / 2, -h / 2);
  return rotated;
}

rotateBtn.addEventListener('click', () => {
  if (!correctedCanvas) return;
  correctedCanvas = rotateCanvas90(correctedCanvas);
  // 自動調整のやり直しに使う原本も、向きを合わせて一緒に回転させておく
  if (pristineCanvas) pristineCanvas = rotateCanvas90(pristineCanvas);
  renderResult();
});

// 各色チャンネルのヒストグラムを自動で伸ばし(オートレベル)、彩度も少し持ち上げて鮮やかにする
function autoEnhance(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const n = w * h;

  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    histR[data[o]]++;
    histG[data[o + 1]]++;
    histB[data[o + 2]]++;
  }

  function computeBounds(hist) {
    const clip = n * 0.005; // 上下0.5%ずつは外れ値として無視する
    let lo = 0;
    let cum = 0;
    for (lo = 0; lo < 255; lo++) {
      cum += hist[lo];
      if (cum > clip) break;
    }
    let hi = 255;
    cum = 0;
    for (hi = 255; hi > 0; hi--) {
      cum += hist[hi];
      if (cum > clip) break;
    }
    if (hi <= lo) return [0, 255]; // 真っ白・真っ黒に近い画像への保険
    return [lo, hi];
  }

  const [rLo, rHi] = computeBounds(histR);
  const [gLo, gHi] = computeBounds(histG);
  const [bLo, bHi] = computeBounds(histB);

  function stretch(v, lo, hi) {
    return Math.min(255, Math.max(0, ((v - lo) / (hi - lo)) * 255));
  }

  const SATURATION_BOOST = 1.15;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r = stretch(data[o], rLo, rHi);
    let g = stretch(data[o + 1], gLo, gHi);
    let b = stretch(data[o + 2], bLo, bHi);

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * SATURATION_BOOST;
    g = gray + (g - gray) * SATURATION_BOOST;
    b = gray + (b - gray) * SATURATION_BOOST;

    data[o] = Math.min(255, Math.max(0, r));
    data[o + 1] = Math.min(255, Math.max(0, g));
    data[o + 2] = Math.min(255, Math.max(0, b));
  }
  ctx.putImageData(imageData, 0, 0);
}

autoEnhanceBtn.addEventListener('click', () => {
  if (!pristineCanvas) return;
  // 何度押しても同じ結果になるよう、必ず未加工の原本から計算し直す
  // (correctedCanvas に直接重ね掛けすると、押すたびに彩度などが増幅されてしまうため)
  correctedCanvas = cloneCanvas(pristineCanvas);
  autoEnhance(correctedCanvas);
  renderResult();
});

resetColorBtn.addEventListener('click', () => {
  if (!pristineCanvas) return;
  // 自動調整も含めて、正面補正した直後の状態に戻す
  correctedCanvas = cloneCanvas(pristineCanvas);
  resetColorControls();
  renderResult();
});

// ------- 文字などの補正(明るさ・コントラスト・グレースケール・二値化) -------
function boxBlurGray(gray, w, h, radius) {
  const size = radius * 2 + 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const xx = Math.min(w - 1, Math.max(0, k));
      sum += gray[rowOff + xx];
    }
    tmp[rowOff] = sum / size;
    for (let x = 1; x < w; x++) {
      const addX = Math.min(w - 1, x + radius);
      const subX = Math.max(0, x - radius - 1);
      sum += gray[rowOff + addX] - gray[rowOff + subX];
      tmp[rowOff + x] = sum / size;
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const yy = Math.min(h - 1, Math.max(0, k));
      sum += tmp[yy * w + x];
    }
    out[x] = sum / size;
    for (let y = 1; y < h; y++) {
      const addY = Math.min(h - 1, y + radius);
      const subY = Math.max(0, y - radius - 1);
      sum += tmp[addY * w + x] - tmp[subY * w + x];
      out[y * w + x] = sum / size;
    }
  }
  return out;
}

function applyBinarize(ctx, w, h, thresholdOffset) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  const radius = Math.max(5, Math.min(40, Math.round(Math.min(w, h) * 0.02)));
  const localMean = boxBlurGray(gray, w, h, radius);

  // 平坦な背景(gray ≈ localMean)を確実に白と判定するため、基準オフセットを設ける
  const BASELINE_C = 12;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const v = gray[i] > localMean[i] - (BASELINE_C + thresholdOffset) ? 255 : 0;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

// 明るさ・コントラスト・グレースケールを手動でピクセル処理する
// (Canvas の ctx.filter は Safari 系エンジンで反映されないことがあるため、
//  ブラウザ間で確実に同じ結果になるよう自前で計算する)
function renderResult() {
  if (!correctedCanvas) return;
  const w = correctedCanvas.width;
  const h = correctedCanvas.height;
  resultCanvas.width = w;
  resultCanvas.height = h;
  const ctx = resultCanvas.getContext('2d');

  const brightnessFactor = Number(brightnessInput.value) / 100; // 100% = 変化なし
  const contrastFactor = Number(contrastInput.value) / 100; // 100% = 変化なし
  const grayscaleOn = grayscaleToggle.checked;

  const srcCtx = correctedCanvas.getContext('2d');
  const imageData = srcCtx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const n = w * h;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r = data[o] * brightnessFactor;
    let g = data[o + 1] * brightnessFactor;
    let b = data[o + 2] * brightnessFactor;

    // CSS contrast() と同じ定義: (値-128)*係数+128
    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    if (grayscaleOn) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray;
      g = gray;
      b = gray;
    }

    data[o] = Math.min(255, Math.max(0, r));
    data[o + 1] = Math.min(255, Math.max(0, g));
    data[o + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imageData, 0, 0);

  if (binarizeToggle.checked) {
    applyBinarize(ctx, resultCanvas.width, resultCanvas.height, Number(thresholdInput.value));
  }
}

[brightnessInput, contrastInput].forEach((el) => {
  el.addEventListener('input', renderResult);
});

grayscaleToggle.addEventListener('change', renderResult);

binarizeToggle.addEventListener('change', () => {
  const on = binarizeToggle.checked;
  thresholdField.hidden = !on;
  colorControls.style.opacity = on ? 0.5 : 1;
  brightnessInput.disabled = on;
  contrastInput.disabled = on;
  grayscaleToggle.disabled = on;
  renderResult();
});

thresholdInput.addEventListener('input', () => {
  clearTimeout(binarizeDebounceTimer);
  binarizeDebounceTimer = setTimeout(renderResult, 120);
});

downloadBtn.addEventListener('click', () => {
  if (!correctedCanvas) return;
  resultCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scanned.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
});
