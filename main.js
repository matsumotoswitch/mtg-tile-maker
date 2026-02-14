// DOM要素の参照取得
const results = document.getElementById("results");
const dropArea = document.getElementById("dropArea");

// 状態管理用変数
let droppedCards = [];
let baseImageSize = null;

// 検索入力欄でEnterキーが押されたら検索を実行
document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("searchBtn").click();
});

// 検索クエリから言語を自動判定（日本語文字が含まれる場合は 'ja'、それ以外は 'en'）
function detectLang(query) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(query) ? "ja" : "en";
}

// カードオブジェクトから画像URLを取得（通常カードと両面カードに対応）
function getCardImageUrl(card) {
  if (card.image_uris) {
    return card.image_uris.png || card.image_uris.normal;
  } else if (card.card_faces && card.card_faces[0].image_uris) {
    return card.card_faces[0].image_uris.png || card.card_faces[0].image_uris.normal;
  }
  return "";
}

// 検索ボタンクリック時の処理
document.getElementById("searchBtn").addEventListener("click", async () => {
  const query = document.getElementById("searchInput").value.trim();
  const match = document.querySelector('input[name="match"]:checked').value;
  if (!query) return;

  // 言語判定と検索クエリの構築
  const lang = detectLang(query);
  let q = (match === "exact") ? `!${query}` : query;
  q += ` lang:${lang}`;

  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=name`;
  results.innerHTML = "";

  // Scryfall APIからデータを取得（ページネーション対応）
  try {
    let allCards = [];
    while (url) {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.data) break;
      allCards = allCards.concat(data.data);
      url = data.has_more ? data.next_page : null;
    }

    // 取得したカードを画面に表示
    allCards.forEach(card => {
      addCardResult(card); // 整理された関数を呼び出す
    });
  } catch (e) {
    results.innerHTML = "<p>検索エラーが発生しました</p>";
  }
});

// 検索結果のカード要素を作成し、DOMに追加する
function addCardResult(card) {
  const imgUrl = getCardImageUrl(card);
  if (!imgUrl) return;

  // カード要素のHTML構造を作成
  const el = document.createElement("div");
  el.className = "card-item";
  el.draggable = true;
  el.innerHTML = `
    <img src="${imgUrl}" crossorigin="anonymous" style="width:100%; display:block; pointer-events:none;" />
    <div class="card-overlay">
      <div class="name">${card.name}</div>
      <div class="size"></div>
    </div>
    <div class="card-footer">
      <a class="card-link" href="${card.scryfall_uri}" target="_blank" title="Scryfallで詳細を見る">🌐</a>
      <div class="langArea"></div>
    </div>
  `;
  results.appendChild(el);

  // 画像読み込み完了時にサイズ情報を取得して表示
  const img = el.querySelector("img");
  img.onload = () => {
    el.dataset.w = img.naturalWidth;
    el.dataset.h = img.naturalHeight;
    el.querySelector(".size").textContent = `${img.naturalWidth}×${img.naturalHeight}px`;
  };

  // ドラッグ開始時のデータ設定（画像URLとサイズ）
  el.addEventListener("dragstart", (e) => {
    // 現在の img.src (言語切り替え後も考慮) を渡す
    e.dataTransfer.setData("application/json", JSON.stringify({
      url: img.src, w: el.dataset.w, h: el.dataset.h
    }));
  });

  // 他の言語版（プリント）を取得して切り替えボタンを生成
  fetchAllPrints(card.prints_search_uri).then(printCards => {
    const langs = {};
    printCards.forEach(p => {
      const pUrl = getCardImageUrl(p);
      if (pUrl) langs[p.lang] = pUrl;
    });
    renderLangButtons(el, langs, card.lang || "en");
  });
}

// 指定されたURLから全ページのデータを取得するヘルパー関数
async function fetchAllPrints(url) {
  let all = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    const data = await res.json();
    if (!data.data) break;
    all = all.concat(data.data);
    next = data.has_more ? data.next_page : null;
  }
  return all;
}

// 言語切り替えボタンを描画し、クリックイベントを設定する
function renderLangButtons(el, langs, initialLang) {
  const langArea = el.querySelector(".langArea");
  const flagMap = { ja: "JP", en: "US", fr: "FR", de: "DE", es: "ES", it: "IT", pt: "PT", ru: "RU", ko: "KR", zh: "CN" };
  const keys = Object.keys(langs);
  if (keys.length === 0) return;

  let currentLang = initialLang && langs[initialLang] ? initialLang : keys[0];
  
  // ボタンのハイライト状態を更新する関数
  const updateHighlight = () => {
    langArea.querySelectorAll(".langBtn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.lang === currentLang);
    });
  };

  keys.forEach(lang => {
    const btn = document.createElement("button");
    btn.className = "langBtn";
    btn.textContent = flagMap[lang] || lang.toUpperCase();
    btn.dataset.lang = lang;
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // ドラッグ開始を防ぐ
      el.querySelector("img").src = langs[lang];
      currentLang = lang;
      updateHighlight();
    });
    langArea.appendChild(btn);
  });
  updateHighlight();
}

// ドロップエリアのドラッグオーバー処理（スタイル変更）
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("dragover");
});
dropArea.addEventListener("dragleave", () => dropArea.classList.remove("dragover"));

// ドロップ処理：新規カードの追加または並び替え
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

// ドロップエリアの描画（プレビュー）
// グリッドレイアウトの計算と、ドラッグによる並び替え機能を提供
function renderDropPreview() {
  dropArea.innerHTML = "";
  if (droppedCards.length === 0) {
    dropArea.innerHTML = '<p>ここにカードをドラッグ＆ドロップ</p>';
    baseImageSize = null;
    return;
  }

  // 設定値の取得
  const columns = parseInt(document.getElementById("columns").value) || 1;
  const cardWidth = parseInt(document.getElementById("cardWidth").value) || 200;
  const gap = parseInt(document.getElementById("gap").value) || 0;
  const userTotalWidth = parseInt(document.getElementById("totalWidth").value) || 0;
  const align = document.getElementById("align").value;

  const contentWidth = (columns * cardWidth) + ((columns - 1) * gap);
  const finalCanvasWidth = userTotalWidth > 0 ? userTotalWidth : contentWidth;

  dropArea.style.display = "block";
  dropArea.style.padding = "10px";

  // アートボード（描画領域）の作成
  const artboard = document.createElement("div");
  artboard.className = "artboard";
  artboard.style.width = finalCanvasWidth + "px";
  artboard.style.minWidth = finalCanvasWidth + "px";
  artboard.style.display = "flex";
  artboard.style.justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  artboard.style.border = "1px solid #666";
  artboard.style.background = "#1a1a1a";
  artboard.style.padding = "0";

  const inner = document.createElement("div");
  inner.style.display = "grid";
  inner.style.gridTemplateColumns = `repeat(${columns}, ${cardWidth}px)`;
  inner.style.gap = gap + "px";
  inner.style.width = contentWidth + "px";
  
  artboard.appendChild(inner);

  // 各カードの描画と並び替えイベントの設定
  droppedCards.forEach((url, idx) => {
    const card = document.createElement("div");
    card.className = "canvas-card";
    card.draggable = true;
    card.style.width = cardWidth + "px";
    card.innerHTML = `
      <img src="${url}" style="pointer-events:none; width:100%; display:block;" />
      <button class="remove-btn" style="pointer-events:auto;">×</button>
    `;

    // 並び替えのためのドラッグイベント
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/reorder-idx", idx);
      card.style.opacity = "0.4";
    });
    card.addEventListener("dragover", (e) => e.preventDefault());
    // ドロップ時の入れ替え処理
    card.addEventListener("drop", (e) => {
      e.preventDefault(); e.stopPropagation();
      const fromIdx = e.dataTransfer.getData("text/reorder-idx");
      if (fromIdx !== "" && parseInt(fromIdx) !== idx) {
        const item = droppedCards.splice(parseInt(fromIdx), 1)[0];
        droppedCards.splice(idx, 0, item);
        renderDropPreview(); updateSizeInfo();
      } else if (!fromIdx) {
        const json = e.dataTransfer.getData("application/json");
        if (json) {
          const { url } = JSON.parse(json);
          droppedCards.splice(idx, 0, url);
          renderDropPreview(); updateSizeInfo();
        }
      }
    });
    card.addEventListener("dragend", () => card.style.opacity = "1");
    // 削除ボタン
    card.querySelector(".remove-btn").onclick = (e) => {
      e.stopPropagation();
      droppedCards.splice(idx, 1);
      renderDropPreview(); updateSizeInfo();
    };
    inner.appendChild(card);
  });
  dropArea.appendChild(artboard);
}

// 画像生成とダウンロード処理
// Canvasを使用してタイル状に画像を配置し、PNGとして出力する
document.getElementById("generateBtn").addEventListener("click", async () => {
  if (droppedCards.length === 0) return;
  const columns = parseInt(document.getElementById("columns").value);
  const cardWidth = parseInt(document.getElementById("cardWidth").value);
  const gap = parseInt(document.getElementById("gap").value);
  const userTotalWidth = parseInt(document.getElementById("totalWidth").value) || 0;
  const align = document.getElementById("align").value;

  // 全画像の読み込みを待機
  const imgs = await Promise.all(droppedCards.map(url => loadImage(url)));
  const cardHeight = Math.round((cardWidth * imgs[0].naturalHeight) / imgs[0].naturalWidth);
  const rows = Math.ceil(imgs.length / columns);
  const contentWidth = (columns * cardWidth) + ((columns - 1) * gap);
  const canvasWidth = userTotalWidth > 0 ? userTotalWidth : contentWidth;
  const canvasHeight = (rows * cardHeight) + ((rows - 1) * gap);

  // Canvasの作成
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  // 配置のオフセット計算（左寄せ、中央、右寄せ）
  let offsetX = (align === "center") ? (canvasWidth - contentWidth) / 2 : (align === "right") ? (canvasWidth - contentWidth) : 0;

  // 画像の描画（角丸クリッピング適用）
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

  // 画像のダウンロード
  const link = document.createElement("a");
  link.download = `${new Date().getTime()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// 画像読み込みのヘルパー関数（CORS対応）
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = url + (url.includes('?') ? '&' : '?') + "t=" + new Date().getTime();
  });
}

// 出力予定サイズの情報を更新して表示する
function updateSizeInfo() {
  const sizeInfo = document.getElementById("sizeInfo");
  if (droppedCards.length === 0 || !baseImageSize) {
    sizeInfo.textContent = "画像サイズ: ―"; return;
  }
  const columns = parseInt(document.getElementById("columns").value);
  const cardWidth = parseInt(document.getElementById("cardWidth").value);
  const gap = parseInt(document.getElementById("gap").value);
  const userTotalWidth = parseInt(document.getElementById("totalWidth").value) || 0;
  const cardHeight = Math.round((cardWidth * baseImageSize.h) / baseImageSize.w);
  const rows = Math.ceil(droppedCards.length / columns);
  const contentWidth = (columns * cardWidth) + ((columns - 1) * gap);
  const finalWidth = userTotalWidth > 0 ? userTotalWidth : contentWidth;
  const finalHeight = (rows * cardHeight) + ((rows - 1) * gap);
  sizeInfo.textContent = `出力予定: ${finalWidth} × ${finalHeight}px`;
}

// 設定入力欄の変更イベントリスナー
["columns", "cardWidth", "gap", "totalWidth", "align"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    renderDropPreview(); updateSizeInfo();
  });
});
