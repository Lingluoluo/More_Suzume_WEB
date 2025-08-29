// === 工具函数 ===
function updateProgress(percent, text) {
  document.getElementById("progressBar").style.width = percent + "%";
  document.getElementById("progressText").textContent = text;
}

function hasTransparency(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

async function classifyImages(files, nonTransparentPngBottom) {
  const baseLayer = [];
  const topLayer = [];

  for (let file of files) {
    if (!file.type.startsWith("image/")) continue;
    const img = await createImageBitmap(file);
    if (nonTransparentPngBottom && file.name.toLowerCase().endsWith(".png") && !hasTransparency(img)) {
      baseLayer.push(img);
    } else {
      topLayer.push(img);
    }
  }
  return { baseLayer, topLayer };
}

// === 矩形工具 ===
function iou(rectA, rectB) {
  const x1 = Math.max(rectA.x, rectB.x);
  const y1 = Math.max(rectA.y, rectB.y);
  const x2 = Math.min(rectA.x + rectA.w, rectB.x + rectB.w);
  const y2 = Math.min(rectA.y + rectA.h, rectB.y + rectB.h);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection === 0) return 0;

  const union = rectA.w * rectA.h + rectB.w * rectB.h - intersection;
  return intersection / union;
}

// 检查是否遮挡头部
function overlapsHead(newRect, placedRects, headRatio) {
  for (let rect of placedRects) {
    const headHeight = rect.h * headRatio;
    const headRect = { x: rect.x, y: rect.y, w: rect.w, h: headHeight };
    if (iou(newRect, headRect) > 0.01) {
      return true;
    }
  }
  return false;
}

// === 核心放置函数 ===
async function placeImages(canvas, baseLayer, topLayer, config) {
  const ctx = canvas.getContext("2d");
  canvas.width = config.canvasWidth;
  canvas.height = config.canvasHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const allImages = [...baseLayer, ...topLayer];
  const total = Math.min(config.imageCount, allImages.length);
  let placed = 0;
  const placedRects = [];

  for (let i = 0; i < total; i++) {
    const img = allImages[i];
    let success = false;

    for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
      const size = Math.floor(Math.random() * (config.maxSize - config.minSize) + config.minSize);
      const ratio = img.height / img.width;
      const drawW = size;
      const drawH = size * ratio;

      const x = Math.floor(Math.random() * (canvas.width - drawW));
      const y = Math.floor(Math.random() * (canvas.height - drawH));
      const angle = Math.random() * (config.rotationMax - config.rotationMin) + config.rotationMin;

      const newRect = { x, y, w: drawW, h: drawH };

      // 检查重叠 & 头部遮挡
      let valid = true;
      for (let rect of placedRects) {
        if (iou(newRect, rect) > config.maxIou) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      if (overlapsHead(newRect, placedRects, config.headRatio)) continue;

      // === 绘制 ===
      ctx.save();
      ctx.translate(x + drawW / 2, y + drawH / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      placedRects.push(newRect);
      placed++;
      success = true;
      break;
    }

    // 更新进度
    const percent = Math.floor((placed / total) * 100);
    updateProgress(percent, `正在放置第 ${placed} 张 / 共 ${total} 张`);
    await new Promise(r => setTimeout(r, 5)); // 给UI刷新
  }

  updateProgress(100, "生成完成 ✅");
  document.getElementById("saveBtn").disabled = false;
}

// === 事件绑定 ===
document.getElementById("useUploadImages").addEventListener("change", (e) => {
  const fileInputWrapper = document.getElementById("fileInputWrapper");
  if (e.target.checked) {
    fileInputWrapper.style.display = 'block';  // 显示文件选择框
  } else {
    fileInputWrapper.style.display = 'none';   // 隐藏文件选择框
  }
});

// 生成按钮点击事件
document.getElementById("generateBtn").addEventListener("click", async () => {
  const useUploadImages = document.getElementById("useUploadImages").checked;
  let files = [];

  if (useUploadImages) {
    // 获取上传的图片
    const fileInput = document.getElementById("fileInput");
    if (fileInput.files.length === 0) {
      alert("请先选择图片文件！");
      return;
    }
    files = Array.from(fileInput.files);
  } else {
    // 获取 images 文件夹内的所有图片（模拟）
    files = await fetchImagesFromFolder('./images');
  }

  if (files.length === 0) {
    alert("没有图片可用！");
    return;
  }

  updateProgress(0, "开始生成...");

  const config = {
    canvasWidth: parseInt(document.getElementById("canvasWidth").value),
    canvasHeight: parseInt(document.getElementById("canvasHeight").value),
    imageCount: parseInt(document.getElementById("imageCount").value),
    minSize: parseInt(document.getElementById("minSize").value),
    maxSize: parseInt(document.getElementById("maxSize").value),
    maxIou: parseFloat(document.getElementById("maxIou").value),
    maxAttempts: parseInt(document.getElementById("maxAttempts").value),
    rotationMin: parseInt(document.getElementById("rotationMin").value),
    rotationMax: parseInt(document.getElementById("rotationMax").value),
    anchorDensity: parseFloat(document.getElementById("anchorDensity").value),
    headRatio: parseFloat(document.getElementById("headRatio").value),
    visualizeAnchors: document.getElementById("visualizeAnchors").checked,
  };

  const putNonTransparentPngBottom = document.getElementById("nonTransparentPngBottom").checked;
  updateProgress(5, "正在分类图片...");
  const { baseLayer, topLayer } = await classifyImages(files, putNonTransparentPngBottom);

  updateProgress(10, "开始绘制...");
  const canvas = document.getElementById("canvas");
  await placeImages(canvas, baseLayer, topLayer, config);
});

// 保存按钮
document.getElementById("saveBtn").addEventListener("click", () => {
  const canvas = document.getElementById("canvas");
  const link = document.createElement("a");
  link.download = "collage.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// 从 GitHub 仓库加载图片文件名 JSON
async function fetchImagesFromGitHub() {
  const baseURL = 'https://raw.githubusercontent.com/Lingluoluo/More_Suzume_WEB/main/images/';  // GitHub raw 地址
  const jsonURL = 'https://raw.githubusercontent.com/Lingluoluo/More_Suzume_WEB/main/images.json';  // JSON 文件的 raw 地址
  
  // 请求 JSON 文件（图片文件名列表）
  const response = await fetch(jsonURL);
  const imageFiles = await response.json(); // 获取 JSON 中的文件名数组

  const files = [];
  
  // 遍历并加载每一张图片
  for (let file of imageFiles) {
    const img = new Image();
    img.src = `${baseURL}${file}`;  // 从 GitHub 仓库的 raw URL 加载图片
    await new Promise((resolve) => {
      img.onload = () => resolve();
    });
    files.push(img);
  }

  return files;
}

// 使用上述函数加载图片
fetchImagesFromGitHub().then((files) => {
  console.log("图片已加载:", files);
  // 继续处理图片生成逻辑
});

