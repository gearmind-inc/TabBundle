// capture.mjs で撮った「生の画面キャプチャ」に、見出しと吹き出しを足して、
// Chrome ウェブストア用のスクリーンショット (1280x800 の PNG) に仕上げる。
//
// 準備 (package.json には足さない。この作業の間だけ入れる):
//   npm i --no-save playwright
//   npx playwright install chromium
//
// 実行:
//   node store/screenshots/compose.mjs [生キャプチャのフォルダ] [出力フォルダ]
//   生キャプチャのフォルダは 1 つ目の引数か環境変数 TABBUNDLE_SHOTS_OUT
//     (既定は capture.mjs の既定の出力先と同じ、OS の一時フォルダの下の tabbundle-screenshots)
//   出力フォルダは 2 つ目の引数か環境変数 TABBUNDLE_SHOTS_FINAL (既定はこのスクリプトと同じフォルダ)
//
// 決まり:
//   - 画面の中身は生キャプチャをそのまま使う (切り抜き・縮小・枠・影だけ。中の文字は書き換えない)
//   - ブックマークマネージャの左上の Chromium のロゴ (「Test」入り) は白で隠す
//   - 座標はすべて生キャプチャの CSS ピクセル (ポップアップは 560 幅、ブックマークは 1280 幅) で書く

import { access, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(process.argv[2] ?? process.env.TABBUNDLE_SHOTS_OUT ?? path.join(os.tmpdir(), "tabbundle-screenshots"));
const OUT = path.resolve(process.argv[3] ?? process.env.TABBUNDLE_SHOTS_FINAL ?? here);

const W = 1280;
const H = 800;

// ---- 見た目 ---------------------------------------------------------------------------

const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", "Meiryo", "Noto Sans JP", "Noto Sans CJK JP", sans-serif`;

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    position: relative;
    font-family: ${FONT};
    background: linear-gradient(160deg, #f1f5fa 0%, #e2e9f3 100%);
    color: #1b2a3d;
  }
  .head { position: absolute; left: 64px; top: 48px; right: 64px; }
  .head h1 { font-size: 40px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.3; }
  .head p { margin-top: 10px; font-size: 20px; font-weight: 500; color: #4a5b70; line-height: 1.5; }
  .shot {
    position: absolute; overflow: hidden; background: #fff;
    border-radius: 14px;
    box-shadow: 0 18px 44px rgba(27, 42, 61, 0.18), 0 2px 6px rgba(27, 42, 61, 0.10);
    outline: 1px solid rgba(27, 42, 61, 0.08);
  }
  .shot img { position: absolute; display: block; }
  .mask { position: absolute; background: #fff; }
  .ring {
    position: absolute; border: 3px solid #f0a02c; border-radius: 10px;
    box-shadow: 0 0 0 4px rgba(240, 160, 44, 0.22);
  }
  svg.tails { position: absolute; left: 0; top: 0; }
  .bubble {
    position: absolute; background: #1f3b63; color: #fff;
    font-size: 24px; font-weight: 700; line-height: 1.45;
    padding: 12px 20px; border-radius: 14px;
    box-shadow: 0 8px 20px rgba(31, 59, 99, 0.28);
  }
`;

// ---- 各画像の中身 ----------------------------------------------------------------------
// shot.crop: 生キャプチャから切り抜く範囲 (CSS px)。shot.at: 置く左上。shot.scale: CSS px 1 つを何 px で描くか
// rings: 目立たせる枠 (CSS px)。masks: 白で隠す所 (CSS px)
// bubbles: { text, x, y, w (置き場所。仕上がりの px), tip: 尾の先 [x, y] (生キャプチャの CSS px) }

const LOGO_MASK = { x: 6, y: 4, w: 50, h: 44 };

const SHOTS = [
  {
    out: "01-popup-search.png",
    title: "残したページを、あとから検索",
    sub: "ツールバーの TabBundle のアイコンから開くポップアップで探せます",
    shot: { file: "popup-3-suggest-domains.png", dpr: 2, crop: { x: 0, y: 0, w: 560, h: 455 }, at: { x: 580, y: 196 }, scale: 1.15 },
    rings: [
      { x: 9, y: 9, w: 483, h: 38 },
      { x: 9, y: 49, w: 441, h: 30 },
      { x: 12, y: 153, w: 170, h: 20 },
    ],
    bubbles: [
      { text: "タイトルや URL の一部で探せる", x: 64, y: 196, w: 450, tip: [9, 28] },
      { text: "打っている言葉のドメインが出る。<br>押すとそのドメインで探せる", x: 64, y: 312, w: 450, tip: [9, 64] },
      { text: "最後に保存した日時が新しい順", x: 64, y: 436, w: 450, tip: [12, 163] },
    ],
  },
  {
    out: "02-popup-body-search.png",
    title: "ページの本文の言葉でも見つかる",
    sub: "本文の保存は、サイトごとに右クリックのメニューで ON にします (初めは全部 OFF)",
    shot: { file: "popup-2-results-body.png", dpr: 2, crop: { x: 0, y: 0, w: 560, h: 224 }, at: { x: 480, y: 222 }, scale: 1.3 },
    rings: [
      { x: 9, y: 9, w: 483, h: 38 },
      { x: 8, y: 80, w: 544, h: 132 },
    ],
    bubbles: [
      { text: "「半熟卵」は、タイトルにも<br>URL にも無い言葉", x: 64, y: 222, w: 360, tip: [9, 28] },
      { text: "保存した本文に「半熟卵」があるページが出る", x: 480, y: 578, w: 620, tip: [180, 212] },
    ],
  },
  {
    out: "03-auto-backup-folders.png",
    title: "閉じたウィンドウのタブが、自動で残る",
    sub: "その他のブックマーク › TabBundle › 自動バックアップ に、日時のフォルダで入ります",
    shot: { file: "bookmarks-1-auto-folders@2x.png", dpr: 2, crop: { x: 0, y: 0, w: 1280, h: 520 }, at: { x: 32, y: 180 }, scale: 0.95 },
    masks: [LOGO_MASK],
    rings: [
      { x: 286, y: 84, w: 966, h: 216 },
      { x: 70, y: 270, w: 70, h: 28 },
      { x: 344, y: 135, w: 318, h: 26 },
    ],
    bubbles: [
      { text: "保存対象のタブがある通常ウィンドウを<br>閉じると、日時のフォルダが増える<br>(新しい物が上)", x: 500, y: 520, w: 480, tip: [560, 300] },
      { text: "作成から 7 日を過ぎると、<br>次の片付けで old へ移る", x: 56, y: 520, w: 380, tip: [100, 298] },
      // (再起動前) の説明は 2 行目の右の空きに置く (尾が他の行の文字にかからないように)
      { text: "「(再起動前)」は、Chrome の終了や<br>再起動の前に開いていた分", x: 690, y: 262, w: 470, tip: [662, 148] },
    ],
  },
  {
    out: "04-folder-contents.png",
    title: "保存対象のタブを、並び順にブックマークへ",
    sub: "固定タブなどは対象外です。終了直前の変更や保存に失敗したタブは残らないことがあります",
    shot: { file: "bookmarks-2-folder-contents@2x.png", dpr: 2, crop: { x: 0, y: 0, w: 1280, h: 600 }, at: { x: 51, y: 184 }, scale: 0.92 },
    masks: [LOGO_MASK],
    rings: [
      { x: 338, y: 95, w: 184, h: 26 },
      { x: 338, y: 535, w: 308, h: 26 },
    ],
    bubbles: [
      { text: "保存対象のタブを元の順に", x: 600, y: 254, w: 440, tip: [522, 108] },
      { text: "この例では 12 件を保存", x: 720, y: 659, w: 380, tip: [646, 548] },
    ],
  },
];

// ---- HTML を組み立てる ------------------------------------------------------------------

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&lt;br&gt;/g, "<br>");

/** 生キャプチャの CSS px の点を、仕上がりの px に直す */
function toCanvas(shot, [x, y]) {
  return [shot.at.x + (x - shot.crop.x) * shot.scale, shot.at.y + (y - shot.crop.y) * shot.scale];
}

async function buildHtml(spec) {
  const { shot } = spec;
  const png = await readFile(path.join(RAW, shot.file));
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const img = await imageSize(png);
  const cssW = img.width / shot.dpr;
  const cssH = img.height / shot.dpr;
  const s = shot.scale;
  const box = (r) => `left:${(r.x - shot.crop.x) * s}px;top:${(r.y - shot.crop.y) * s}px;width:${r.w * s}px;height:${r.h * s}px`;

  const masks = (spec.masks ?? []).map((m) => `<div class="mask" style="${box(m)}"></div>`).join("");
  const rings = (spec.rings ?? [])
    .map((r) => {
      const [x, y] = toCanvas(shot, [r.x, r.y]);
      return `<div class="ring" style="left:${x}px;top:${y}px;width:${r.w * s}px;height:${r.h * s}px"></div>`;
    })
    .join("");
  const bubbleHtml = spec.bubbles
    .map((b) => {
      const [tx, ty] = toCanvas(shot, b.tip);
      return `<div class="bubble" data-tip="${tx},${ty}" style="left:${b.x}px;top:${b.y}px;max-width:${b.w}px">${esc(b.text)}</div>`;
    })
    .join("");

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <div class="head"><h1>${esc(spec.title)}</h1><p>${esc(spec.sub)}</p></div>
    <div class="shot" style="left:${shot.at.x}px;top:${shot.at.y}px;width:${shot.crop.w * s}px;height:${shot.crop.h * s}px">
      <img src="${dataUrl}" style="left:${-shot.crop.x * s}px;top:${-shot.crop.y * s}px;width:${cssW * s}px;height:${cssH * s}px">
      ${masks}
    </div>
    ${rings}
    <svg class="tails" width="${W}" height="${H}"></svg>
    ${bubbleHtml}
  </body></html>`;
}

/** PNG の幅と高さ (IHDR を読む) */
async function imageSize(buf) {
  if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error("PNG ではありません");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** 吹き出しの尾を描く (吹き出しの大きさは描いてみないと分からないので、ページの中で計算する) */
function drawTails() {
  const svg = document.querySelector("svg.tails");
  const ns = "http://www.w3.org/2000/svg";
  for (const el of document.querySelectorAll(".bubble")) {
    const [tx, ty] = el.dataset.tip.split(",").map(Number);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // 中心から尾の先へ向かう線が、吹き出しの枠を出る所
    const t = Math.min(dx === 0 ? Infinity : r.width / 2 / Math.abs(dx), dy === 0 ? Infinity : r.height / 2 / Math.abs(dy));
    const ex = cx + dx * t - ux * 14;
    const ey = cy + dy * t - uy * 14;
    const half = 13;
    const poly = document.createElementNS(ns, "polygon");
    poly.setAttribute("points", `${ex - uy * half},${ey + ux * half} ${tx},${ty} ${ex + uy * half},${ey - ux * half}`);
    poly.setAttribute("fill", "#1f3b63");
    svg.appendChild(poly);
  }
}

// ---- 実行 -----------------------------------------------------------------------------

for (const spec of SHOTS) {
  try {
    await access(path.join(RAW, spec.shot.file));
  } catch {
    throw new Error(`生キャプチャがありません: ${path.join(RAW, spec.shot.file)} (先に capture.mjs で撮る)`);
  }
}
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: "ja-JP" });
  for (const spec of SHOTS) {
    await page.setContent(await buildHtml(spec), { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
    });
    await page.evaluate(drawTails);
    const file = path.join(OUT, spec.out);
    await page.screenshot({ path: file });
    console.log(`saved: ${file}`);
  }
} finally {
  await browser.close();
}
