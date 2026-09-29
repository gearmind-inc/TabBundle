// TabBundle のストア用スクリーンショットの「元になる生の画面キャプチャ」を撮る (吹き出しや仕上げは別の作業)。
//
// 準備 (package.json には足さない。この作業の間だけ入れる):
//   npm install
//   npm run build
//   npm i --no-save playwright
//   npx playwright install chromium
//
// 実行:
//   node store/screenshots/capture.mjs [出力フォルダ]
//   出力フォルダは引数か環境変数 TABBUNDLE_SHOTS_OUT で決める (既定は OS の一時フォルダの下の tabbundle-screenshots)
//   撮る場面を絞るときは環境変数 TABBUNDLE_SHOTS_SCENES=popup,bookmarks,menu (既定は全部)
//
// 使うもの:
//   - Playwright 同梱の Chromium (ブランドの Google Chrome は --load-extension を受け付けない)
//   - 毎回新しく作る一時フォルダのプロファイル (普段使いの Chrome のプロファイルには触れない)
//   - 見本のブックマークと本文はすべて架空のもの。拡張機能の service worker から chrome.bookmarks / chrome.storage で入れる
//   - menu の場面だけは macOS の screencapture でネイティブのメニューを撮る (画面収録の権限が要る)。
//     撮れなかったら作り物は描かず、理由を出して終わる
//
// 見本の「最後の保存」の日時について:
//   chrome.bookmarks.create は dateAdded を指定できない (作った瞬間の時刻になる)。
//   ポップアップの「最後の保存: …」を自然に見せるため、ポップアップのページの中だけで
//   chrome.bookmarks.getSubTree の結果の dateAdded を、フォルダ名の日時 (手動保存は下の SAVED_AT) に差し替える。
//   拡張機能のコードは変えない。ブックマークマネージャの画面には影響しない。

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "..", "..", "dist");
const OUT = path.resolve(process.argv[2] ?? process.env.TABBUNDLE_SHOTS_OUT ?? path.join(os.tmpdir(), "tabbundle-screenshots"));
const SCENES = new Set((process.env.TABBUNDLE_SHOTS_SCENES ?? "popup,bookmarks,menu").split(",").map((s) => s.trim()));

// ---- 見本データ (すべて架空) ----------------------------------------------------------

const PAGES = {
  mdnFetch: ["https://developer.mozilla.org/ja/docs/Web/API/Fetch_API", "Fetch API - Web API | MDN"],
  mdnPromise: ["https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Promise", "Promise - JavaScript | MDN"],
  mdnGrid: ["https://developer.mozilla.org/ja/docs/Web/CSS/grid-template-columns", "grid-template-columns - CSS: カスケーディングスタイルシート | MDN"],
  mdnSw: ["https://developer.mozilla.org/ja/docs/Web/API/Service_Worker_API", "サービスワーカー API - Web API | MDN"],
  ghNotes: ["https://github.com/example/tab-notes", "example/tab-notes: タブのメモを残すツール"],
  ghIssue: ["https://github.com/example/tab-notes/issues/42", "タブが多いと保存が遅い · Issue #42 · example/tab-notes"],
  ghDotfiles: ["https://github.com/example/dotfiles", "example/dotfiles: 設定ファイルの置き場"],
  gist: ["https://gist.github.com/example/3f2a9c1", "bookmarks-export.mjs"],
  ghActions: ["https://docs.github.com/ja/actions/quickstart", "GitHub Actions のクイックスタート - GitHub Docs"],
  carbonara: ["https://example.com/recipes/carbonara", "本格カルボナーラの作り方 | みんなの台所"],
  curry: ["https://example.com/recipes/curry", "スパイスから作るチキンカレー | みんなの台所"],
  miso: ["https://example.com/recipes/miso-soup", "毎日の味噌汁 基本のだしの取り方 | みんなの台所"],
  kyoto3: ["https://example.org/travel/kyoto-3days", "京都 3 日間のモデルコース | 旅のしおり"],
  kyotoHotel: ["https://example.org/travel/kyoto-hotels", "京都駅の近くのおすすめホテル 10 選 | 旅のしおり"],
  nara: ["https://example.org/travel/nara-day-trip", "奈良 日帰りの旅 | 旅のしおり"],
  news: ["https://news.example.net/tech/2026/09/browser-update", "ブラウザの新機能まとめ (2026 年 9 月) | Example News"],
  tsTips: ["https://example.net/blog/typescript-tips", "TypeScript で型を安全にするコツ | Example Blog"],
};

/** 自動バックアップ/ の日時フォルダ (名前は src/core/folderName.ts の形式。中のブックマーク数 = 名前の N タブ) */
const AUTO_FOLDERS = [
  ["2026-09-25 21:40 ウィンドウ (12 タブ)", ["mdnFetch", "mdnPromise", "ghNotes", "ghIssue", "ghActions", "tsTips", "mdnSw", "mdnGrid", "news", "carbonara", "curry", "miso"]],
  ["2026-09-25 09:15 (再起動前) ウィンドウ (5 タブ)", ["kyoto3", "kyotoHotel", "nara", "carbonara", "news"]],
  ["2026-09-24 18:30 ウィンドウ (8 タブ)", ["ghNotes", "ghDotfiles", "gist", "ghActions", "mdnFetch", "mdnPromise", "tsTips", "mdnGrid"]],
  ["2026-09-23 12:05 ウィンドウ (6 タブ)", ["curry", "miso", "carbonara", "news", "kyoto3", "tsTips"]],
  ["2026-09-22 22:10 ウィンドウ (9 タブ)", ["mdnFetch", "mdnGrid", "mdnSw", "ghNotes", "ghIssue", "ghActions", "ghDotfiles", "mdnPromise", "gist"]],
];
const OLD_FOLDERS = [
  ["2026-09-17 18:02 ウィンドウ (8 タブ)", ["kyoto3", "kyotoHotel", "nara", "carbonara", "curry", "miso", "news", "tsTips"]],
];
/** 手動保存/ の中のフォルダ (名前は自由。中身は自分で入れる物) */
const MANUAL_FOLDERS = [
  ["京都旅行の計画", ["kyoto3", "kyotoHotel", "nara"]],
  ["開発メモ", ["ghDotfiles", "gist", "mdnFetch"]],
];
/** 日時が名前に入っていないフォルダの「保存日時」(ポップアップの表示用) */
const SAVED_AT = { 京都旅行の計画: [2026, 9, 20, 10, 30], 開発メモ: [2026, 9, 21, 15, 10] };

/** ON にしたサイトの見本の本文 (chrome.storage.local に入れる。形は src/core/pageText.ts の PageTextRecord) */
const PAGE_TEXTS = {
  carbonara: "卵黄と粉チーズを混ぜたソースを作る。パスタは表示より 1 分短くゆで、ソースとあえる。仕上げに半熟卵をのせると、まろやかに仕上がる。黒こしょうをたっぷりかける。",
  curry: "玉ねぎをあめ色になるまで炒める。クミンとコリアンダーを加えて香りを出す。食べる直前に半熟卵をのせると、食べごたえが出る。",
  miso: "だしは昆布と削り節でとる。味噌は火を止めてから溶き入れる。具は豆腐とわかめが定番。",
  ghNotes: "タブのメモを残すツールです。ブックマークに書き出して、あとで検索できます。",
  ghIssue: "タブを 500 個開いていると、保存に 10 秒ほどかかります。再現手順: 新しいウィンドウで 500 個のタブを開いて閉じる。",
};
const ON_HOSTS = ["github.com", "example.com"];

// ---- 補助 -----------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch(profileDir, { viewport, extraArgs = [] }) {
  return chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport,
    deviceScaleFactor: viewport ? 2 : undefined,
    locale: "ja-JP",
    colorScheme: "light",
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--lang=ja", ...extraArgs],
  });
}

async function getServiceWorker(context) {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  return { worker, extensionId: new URL(worker.url()).host };
}

/** service worker の中で、TabBundle フォルダの下に見本のブックマークと本文を入れる */
async function seed(worker) {
  const data = {
    pages: PAGES,
    autoFolders: AUTO_FOLDERS,
    oldFolders: OLD_FOLDERS,
    manualFolders: MANUAL_FOLDERS,
    texts: PAGE_TEXTS,
    onHosts: ON_HOSTS,
  };
  return worker.evaluate(async (d) => {
    const top = await chrome.bookmarks.getChildren("0");
    const others = top.filter((node) => node.folderType === "other");
    if (others.length === 0) throw new Error("その他のブックマークが見つかりません");
    let other = others[0];
    for (const candidate of others) {
      const children = await chrome.bookmarks.getChildren(candidate.id);
      if (children.some((node) => node.title === "TabBundle" && node.url === undefined)) other = candidate;
    }
    const ensure = async (parentId, title) => {
      const children = await chrome.bookmarks.getChildren(parentId);
      return children.find((node) => node.title === title && node.url === undefined) ?? (await chrome.bookmarks.create({ parentId, title }));
    };
    // 拡張機能の ensureBookmarkLayout と同じ順 (手動保存 → 自動バックアップ → old)。既にあれば再利用する
    const root = await ensure(other.id, "TabBundle");
    const manual = await ensure(root.id, "手動保存");
    const auto = await ensure(root.id, "自動バックアップ");
    const old = await ensure(root.id, "old");
    const oldAuto = await ensure(old.id, "自動バックアップ");

    const ids = {};
    // 古い順に index 0 へ入れて、新しい物が上に来るようにする (拡張機能の並びと同じ)
    const addFolders = async (parentId, folders) => {
      for (const [title, keys] of [...folders].reverse()) {
        const folder = await chrome.bookmarks.create({ parentId, index: 0, title });
        ids[title] = folder.id;
        for (const key of keys) {
          const [url, pageTitle] = d.pages[key];
          await chrome.bookmarks.create({ parentId: folder.id, title: pageTitle, url });
        }
      }
    };
    await addFolders(manual.id, d.manualFolders);
    await addFolders(auto.id, d.autoFolders);
    await addFolders(oldAuto.id, d.oldFolders);

    const items = { pageTextHosts: d.onHosts };
    for (const [key, text] of Object.entries(d.texts)) {
      const [url] = d.pages[key];
      items[`pageText:${url}`] = { url, host: new URL(url).hostname, text, capturedAt: Date.now() };
    }
    await chrome.storage.local.set(items);

    const rootCount = (await chrome.bookmarks.getChildren(other.id)).filter((node) => node.title === "TabBundle").length;
    return { ...ids, __rootId: root.id, __autoId: auto.id, __oldAutoId: oldAuto.id, __manualId: manual.id, __rootCount: rootCount };
  }, data);
}

/** ポップアップのページの中だけ、getSubTree の dateAdded を「フォルダ名の日時」に差し替える (上の説明を見る) */
function datePatchScript(savedAt) {
  return `(() => {
    const savedAt = ${JSON.stringify(savedAt)};
    const parse = (title) => {
      const m = /^(\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}):(\\d{2})/.exec(title);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
      const s = savedAt[title];
      return s ? new Date(s[0], s[1] - 1, s[2], s[3], s[4]).getTime() : undefined;
    };
    const walk = (node, inherited) => {
      const own = node.url === undefined ? parse(node.title) : undefined;
      const time = own ?? inherited;
      if (time !== undefined) node.dateAdded = time;
      for (const child of node.children ?? []) walk(child, time);
    };
    const original = chrome.bookmarks.getSubTree.bind(chrome.bookmarks);
    chrome.bookmarks.getSubTree = async (id) => {
      const tree = await original(id);
      for (const node of tree) walk(node, undefined);
      return tree;
    };
  })();`;
}

async function shoot(target, name, options = {}) {
  const file = path.join(OUT, `${name}.png`);
  await target.screenshot({ path: file, ...options });
  console.log(`saved: ${file}`);
}

// ---- 場面 1・2: ポップアップ検索とブックマークマネージャ ---------------------------------

async function sceneAppPages() {
  const profile = await mkdtemp(path.join(os.tmpdir(), "tabbundle-shots-"));
  const context = await launch(profile, { viewport: { width: 1280, height: 800 } });
  try {
    const { worker, extensionId } = await getServiceWorker(context);
    // 拡張機能が起動時に自分の作業 (onInstalled) を終えるのを待ってから、見本を入れる
    await sleep(4000);
    const ids = await seed(worker);
    if (ids.__rootCount !== 1) throw new Error(`TabBundle フォルダが ${ids.__rootCount} 個あります (1 個のはず)`);
    console.log("seeded folders:", JSON.stringify(ids));

    if (SCENES.has("popup")) {
      const page = await context.newPage();
      await page.addInitScript(datePatchScript(SAVED_AT));
      await page.setViewportSize({ width: 560, height: 700 });
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      const input = page.locator("#query");
      await sleep(800);

      // (a) タイトルに合う検索
      await input.fill("MDN");
      await input.press("Enter");
      await page.waitForSelector("#results li");
      await sleep(300);
      await shoot(page.locator("body"), "popup-1-results-title");

      // (b) 本文だけに合う検索 (タイトルにも URL にも無い言葉)
      await input.fill("半熟卵");
      await input.press("Enter");
      await page.waitForSelector("#results li");
      await sleep(300);
      await shoot(page.locator("body"), "popup-2-results-body");

      // (c) 検索した後、続けて打っているところ: ドメインの候補が出る (結果は前の検索のまま)
      await input.fill("github");
      await input.press("Enter");
      await page.waitForSelector("#results li");
      await input.fill("git");
      await page.waitForSelector("#suggestions li");
      await sleep(300);
      await shoot(page.locator("body"), "popup-3-suggest-domains");

      // (d) 空白で区切った複数の言葉 (AND)
      await input.fill("example tab");
      await input.press("Enter");
      await page.waitForSelector("#results li");
      await sleep(300);
      await shoot(page.locator("body"), "popup-4-results-and");

      // (e) 古い日付の保存 (再起動前の自動バックアップ分) が出る検索
      await input.fill("京都");
      await input.press("Enter");
      await page.waitForSelector("#results li");
      await sleep(300);
      await shoot(page.locator("body"), "popup-5-results-kyoto");
      await page.close();
    }

    if (SCENES.has("bookmarks")) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      // 左の木で TabBundle > 自動バックアップ を開き、右に日時フォルダが並ぶ
      await page.goto(`chrome://bookmarks/?id=${ids.__autoId}`);
      await sleep(2500);
      await shoot(page, "bookmarks-1-auto-folders@2x");
      await shoot(page, "bookmarks-1-auto-folders@1x", { scale: "css" });
      // 日時フォルダの中身 (タブの並び順のブックマーク)
      await page.goto(`chrome://bookmarks/?id=${ids[AUTO_FOLDERS[0][0]]}`);
      await sleep(2500);
      await shoot(page, "bookmarks-2-folder-contents@2x");
      await shoot(page, "bookmarks-2-folder-contents@1x", { scale: "css" });
      await page.close();
    }
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

// ---- 場面 3: 右クリックのメニュー (ネイティブなので macOS の screencapture で撮る) ------------

const SAMPLE_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>本格カルボナーラの作り方 | みんなの台所</title>
<style>body{font:16px/1.7 system-ui,sans-serif;margin:0;background:#fffaf3;color:#333}main{max-width:720px;margin:40px auto;padding:0 20px}
h1{font-size:28px}.tag{color:#b45f06;font-size:13px}li{margin:4px 0}</style></head>
<body><main><p class="tag">みんなの台所 &gt; パスタ</p><h1>本格カルボナーラの作り方</h1>
<p>卵黄と粉チーズで作る、生クリームなしのカルボナーラです。15 分でできます。</p>
<h2>材料 (2 人分)</h2><ul><li>スパゲッティ 200g</li><li>ベーコン 80g</li><li>卵黄 2 個分</li><li>粉チーズ 40g</li><li>黒こしょう 適量</li></ul>
<h2>作り方</h2><ol><li>パスタを表示より 1 分短くゆでる。</li><li>ベーコンを炒め、ゆで汁を少し加える。</li><li>火を止めて、卵黄とチーズのソースとあえる。</li></ol></main></body></html>`;

async function sceneMenu() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(SAMPLE_HTML);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const profile = await mkdtemp(path.join(os.tmpdir(), "tabbundle-shots-"));
  // recipes.example.com を 127.0.0.1 の見本サーバに向ける (メニューに出るホスト名を自然にするため)
  const context = await launch(profile, {
    viewport: null,
    extraArgs: ["--window-position=80,60", "--window-size=1100,780", "--host-resolver-rules=MAP recipes.example.com 127.0.0.1"],
  });
  try {
    await getServiceWorker(context);
    await sleep(3000);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`http://recipes.example.com:${port}/recipes/carbonara`);
    await page.bringToFront();
    await sleep(2500); // タブが変わったあと、拡張機能がメニューの文字をこのサイトに合わせるのを待つ

    const box = await page.evaluate(() => ({
      x: window.screenX,
      y: window.screenY,
      w: window.outerWidth,
      h: window.outerHeight,
    }));
    await page.mouse.click(700, 450, { button: "right" });
    await sleep(1200);

    const file = path.join(OUT, "menu-1-context-menu-window.png");
    const region = `${box.x},${box.y},${box.w},${box.h}`;
    const result = spawnSync("screencapture", ["-x", "-R", region, file], { encoding: "utf8" });
    if (result.status !== 0) {
      console.log(`menu: screencapture に失敗しました (${result.stderr || result.status})`);
    } else {
      console.log(`saved: ${file} (region ${region})`);
    }
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
    server.close();
  }
}

// ---- 実行 -----------------------------------------------------------------------------

await mkdir(OUT, { recursive: true });
if (SCENES.has("popup") || SCENES.has("bookmarks")) await sceneAppPages();
if (SCENES.has("menu")) await sceneMenu();
