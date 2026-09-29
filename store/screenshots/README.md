# ストア用スクリーンショット

Chrome ウェブストアに載せるスクリーンショットです (どれも 1280x800 の PNG)。

| ファイル | 中身 |
|---|---|
| `01-popup-search.png` | ポップアップ検索。タイトル・URL で探せる、入力中にドメインの候補が出て、押すとそのドメインで探せる、最後に保存した日時が新しい順 |
| `02-popup-body-search.png` | 本文の言葉で見つかる。「半熟卵」はタイトルにも URL にも無いが、保存した本文にあるページが出る |
| `03-auto-backup-folders.png` | ブックマークマネージャの「自動バックアップ」。閉じたウィンドウごとの日時のフォルダ、「(再起動前)」の意味、7 日を過ぎると old へ移ること |
| `04-folder-contents.png` | 日時のフォルダの中身。開いていたタブが並び順のまま全部残る |

## 撮り方 (作り直すとき)

リポジトリの直下で実行します。Playwright は package.json に足さず、この作業の間だけ入れます。

```
npm install
npm run build
npm i --no-save playwright
npx playwright install chromium
node store/screenshots/capture.mjs <生キャプチャの出力先>
node store/screenshots/compose.mjs <生キャプチャの出力先> [仕上がりの出力先]
```

- `capture.mjs` は生の画面キャプチャ (吹き出しなし) を撮ります。出力先は引数か環境変数 `TABBUNDLE_SHOTS_OUT` (既定は OS の一時フォルダの下の `tabbundle-screenshots`)。撮る場面は環境変数 `TABBUNDLE_SHOTS_SCENES=popup,bookmarks,menu` で絞れます
- `compose.mjs` は生キャプチャに見出しと吹き出しを足して、1280x800 に仕上げます。生キャプチャのフォルダは 1 つ目の引数か `TABBUNDLE_SHOTS_OUT`、仕上がりの出力先は 2 つ目の引数か `TABBUNDLE_SHOTS_FINAL` (既定はこのフォルダ)
- 画面の中身は生キャプチャをそのまま使います (切り抜き・縮小・枠・影だけ)。ブックマークマネージャの左上の Chromium のロゴは白で隠します

## 撮るときの決まり

- 毎回新しく作る一時フォルダのプロファイルで、Playwright 同梱の Chromium に `dist/` を読み込んで撮ります。普段使いの Chrome のプロファイルには触れません
- ブックマークと本文は、すべて架空の見本データです。拡張機能の service worker から `chrome.bookmarks` / `chrome.storage` で入れます
- ポップアップの「最後の保存」の日時: `chrome.bookmarks.create` は作った瞬間の時刻になるため、撮影スクリプトがポップアップのページの中だけで `chrome.bookmarks.getSubTree` の結果の `dateAdded` を、見本のフォルダ名の日時 (名前に日時の無い手動保存のフォルダは、スクリプトに書いた日時) に差し替えています。拡張機能のコードは変えず、ブックマークマネージャの画面にも影響しません
- 右クリックメニュー (本文の保存の ON / OFF) の場面は、ネイティブのメニューを macOS の `screencapture` で撮るため画面収録の権限が要ります。権限の無い環境では撮れないので、今回の画像には入っていません
