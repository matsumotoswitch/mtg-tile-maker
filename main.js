const results = document.getElementById("results");
const dropArea = document.getElementById("dropArea");

let droppedCards = [];
let baseImageSize = null;

// Enterで検索
document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("searchBtn").click();
});

// 言語自動判定
function detectLang(query) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(query) ? "ja" : "en";
}

// 共通：画像URL取得ロジック（両面カード対応）
function getCardImageUrl(card) {
  if (card.image_uris) {
    return card.image_uris.png || card.image_uris.normal;
  } else if (card.card_faces && card.card_faces[0].image_uris) {
    return card.card_faces[0].image_uris.png || card.card_faces[0].image_uris.normal;
  }
  return "";
}

// 検索ボタンイベント
document.getElementById("searchBtn").addEventListener("click", async () => {
  const query = document.getElementById("searchInput").value.trim();
  const match = document.querySelector('input[name="match"]:checked').value;
  if (!query) return;

  const lang = detectLang(query);
  let q = (match === "exact") ? `!${query}` : query;
  q += ` lang:${lang}`;

  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=name`;
  results.innerHTML = "";

  try {
    let allCards = [];
    while (url) {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.data) break;
      allCards = allCards.concat(data.data);
      url = data.has_more ? data.next_page : null;
    }

    allCards.forEach(card => {
      const imgUrl = getCardImageUrl(card);
      if (!imgUrl) return;

      const el = document.createElement("div");
      el.className = "card-item";
      el.draggable = true;
      el.innerHTML = `
        <img src="${imgUrl}" crossorigin="anonymous" style="width:100%; display:block; pointer-events:none;" />
        <div class="card-overlay">
          <div class="name">${card.name}</div>
          <div class="size"></div>
        </div>
      `;
      results.appendChild(el);

      const img = el.querySelector("img");
      img.onload = () => {
        el.dataset.w = img.naturalWidth;
        el.dataset.h = img.naturalHeight;
        el.querySelector(".size").textContent = `${img.naturalWidth}×${img.naturalHeight}px`;
      };

      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/json", JSON.stringify({
          url: imgUrl, w: el.dataset.w, h: el.dataset.h
        }));
      });
    });
  } catch (e) {
    results.innerHTML = "<p>検索エラーが発生しました</p>";
  }
});

// ドロップエリアの基本イベント
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("dragover");
});
dropArea.addEventListener("dragleave", () => dropArea.classList.remove("dragover"));

dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("dragover");
  if (e.dataTransfer.getData("text/reorder-idx")) return;

  const json = e.dataTransfer.getData("application/json");
  if (json) {
    const { url, w, h } = JSON.parse(json);
    if (!baseImageSize) baseImageSize = { w: Number(w), h: Number(h) };
    droppedCards.push(url);
    renderDropPreview();
    updateSizeInfo();
  }
});

// プレビューレンダリング（Flexboxによる寄せ制御版）
function renderDropPreview() {
  dropArea.innerHTML = "";
  if (droppedCards.length === 0) {
    dropArea.innerHTML = '<p>ここにカードをドラッグ＆ドロップ</p>';
    baseImageSize = null;
    return;
  }

  const columns = parseInt(document.getElementById("columns").value) || 1;
  const cardWidth = parseInt(document.getElementById("cardWidth").value) || 200;
  const gap = parseInt(document.getElementById("gap").value) || 0;
  const userTotalWidth = parseInt(document.getElementById("totalWidth").value) || 0;
  const align = document.getElementById("align").value;

  const contentWidth = (columns * cardWidth) + ((columns - 1) * gap);
  const finalCanvasWidth = Math.max(contentWidth, userTotalWidth);

  // 外枠
  dropArea.style.display = "block";
  dropArea.style.padding = "10px";

  // アートボード(出力サイズの枠)
  const artboard = document.createElement("div");
  artboard.className = "artboard";
  artboard.style.width = finalCanvasWidth + "px";
  artboard.style.minWidth = finalCanvasWidth + "px";
  artboard.style.display = "flex";
  artboard.style.justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  artboard.style.border = "1px solid #666";
  artboard.style.background = "#1a1a1a";
  artboard.style.padding = "0";

  // カードを並べるGridコンテナ
  const inner = document.createElement("div");
  inner.style.display = "grid";
  inner.style.gridTemplateColumns = `repeat(${columns}, ${cardWidth}px)`;
  inner.style.gap = gap + "px";
  inner.style.width = contentWidth + "px";
  
  artboard.appendChild(inner);

  droppedCards.forEach((url, idx) => {
    const card = document.createElement("div");
    card.className = "canvas-card";
    card.draggable = true;
    card.style.width = cardWidth + "px";
    card.innerHTML = `
      <img src="${url}" style="pointer-events:none; width:100%; display:block;" />
      <button class="remove-btn" style="pointer-events:auto;">×</button>
    `;

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/reorder-idx", idx);
      card.style.opacity = "0.4";
    });
    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", (e) => {
      e.preventDefault(); e.stopPropagation();
      const fromIdx = e.dataTransfer.getData("text/reorder-idx");
      if (fromIdx !== "" && parseInt(fromIdx) !== idx) {
        const item = droppedCards.splice(parseInt(fromIdx), 1)[0];
        droppedCards.splice(idx, 0, item);
        renderDropPreview(); updateSizeInfo();
      }
    });
    card.addEventListener("dragend", () => card.style.opacity = "1");
    card.querySelector(".remove-btn").onclick = () => {
      droppedCards.splice(idx, 1);
      renderDropPreview(); updateSizeInfo();
    };
    inner.appendChild(card);
  });
  dropArea.appendChild(artboard);
}

// 画像生成
document.getElementById("generateBtn").addEventListener("click", async () => {
  if (droppedCards.length === 0) return;
  const columns = parseInt(document.getElementById("columns").value);
  const cardWidth = parseInt(document.getElementById("cardWidth").value);
  const gap = parseInt(document.getElementById("gap").value);
  const userTotalWidth = parseInt(document.getElementById("totalWidth").value);
  const align = document.getElementById("align").value;

  const imgs = await Promise.all(droppedCards.map(url => loadImage(url)));
  const cardHeight = Math.round((cardWidth * imgs[0].naturalHeight) / imgs[0].naturalWidth);
  const rows = Math.ceil(imgs.length / columns);
  const contentWidth = (columns * cardWidth) + ((columns - 1) * gap);
  const canvasWidth = Math.max(contentWidth, userTotalWidth);
  const canvasHeight = (rows * cardHeight) + ((rows - 1) * gap);

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  let offsetX = (align === "center") ? (canvasWidth - contentWidth) / 2 : (align === "right") ? (canvasWidth - contentWidth) : 0;

  imgs.forEach((img, i) => {
    const x = offsetX + (i % columns) * (cardWidth + gap);
    const y = Math.floor(i / columns) * (cardHeight + gap);
    const radius = Math.round(cardWidth * 0.045);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, cardWidth, cardHeight, radius);
    ctx.clip();
    ctx.drawImage(img, x, y, cardWidth, cardHeight);
    ctx.restore();
  });

  const link = document.createElement("a");
  link.download = `${new Date().getTime()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = url + "?t=" + new Date().getTime();
  });
}

function updateSizeInfo() {
  const sizeInfo = document.getElementById("sizeInfo");
  if (droppedCards.length === 0 || !baseImageSize) {
    sizeInfo.textContent = "画像サイズ: ―"; return;
  }
  const columns = parseInt(document.getElementById("columns").value);
  const cardWidth = parseInt(document.getElementById("cardWidth").value);
  const gap = parseInt(document.getElementById("gap").value);
  const userTotalWidth = parseInt(document.getElementById("totalWidth").value);
  const cardHeight = Math.round((cardWidth * baseImageSize.h) / baseImageSize.w);
  const rows = Math.ceil(droppedCards.length / columns);
  const finalWidth = Math.max((columns * cardWidth) + ((columns - 1) * gap), userTotalWidth);
  const finalHeight = (rows * cardHeight) + ((rows - 1) * gap);
  sizeInfo.textContent = `出力予定: ${finalWidth} × ${finalHeight}px`;
}

["columns", "cardWidth", "gap", "totalWidth", "align"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    renderDropPreview(); updateSizeInfo();
  });
});
