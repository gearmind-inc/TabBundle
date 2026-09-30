# Chrome ウェブストア掲載文

登録欄への入力と公開前の確認は [申請手順](submission.md) を参照してください。

## 日本語

### 短い説明

開いていたタブをブックマークに自動保存。保存したページをタイトル・URL・ONにしたサイトの本文から検索できます。

### 詳しい説明

TabBundle は、通常ウィンドウで開いていたタブを Chrome のブックマークに残し、あとから探せるようにする拡張機能です。ウィンドウを閉じたときや Chrome を再起動したときのタブを「その他のブックマーク/TabBundle/自動バックアップ/」にまとめます。

- ツールバーのポップアップから、保存したページをタイトルと URL で検索できます。
- 右クリックメニューでサイトごとの本文保存を ON にすると、そのサイトのページ本文の先頭 20,000 字も検索に使えます。初期状態は全サイト OFF です。サイトへのアクセスは ON にするときだけ求めます。
- 固定タブ、新しいタブ、拡張機能のページ、URL が空のタブ、シークレットウィンドウのタブはバックアップしません。
- 終了直前の変更や保存に失敗したタブは、残らないことがあります。
- 自動バックアップは作成から 7 日を過ぎた後の片付けで old に移り、old に入ってから 7 日を過ぎた後の片付けで削除されます。残したいブックマークは「手動保存/」へ移してください。このフォルダは自動削除しません。
- 拡張機能は外部通信をしません。ただし、Chrome のブックマーク同期を有効にしている場合、作成したブックマークは Chrome によって同期されることがあります。保存した本文は端末内に置かれ、ブックマーク同期の対象ではありません。

プライバシーポリシー: https://github.com/gearmind-inc/TabBundle/blob/main/PRIVACY.md
お問い合わせ: https://gearmind.cc/contact/

## English

### Short description

Automatically back up open tabs as bookmarks and search saved pages by title, URL, or text from sites you enable.

### Detailed description

TabBundle saves tabs from normal Chrome windows as bookmarks so you can find those pages later. It groups tabs from closed windows and previous Chrome sessions under “Other bookmarks/TabBundle/自動バックアップ/”.

- Search saved pages by title or URL in the toolbar popup.
- Optionally turn on page-text saving for a site from the right-click menu. TabBundle then uses up to the first 20,000 characters of visible text from that site's pages in search. This is OFF for every site by default. Site access is requested only when you turn it ON.
- Pinned tabs, new tabs, extension pages, tabs with empty URLs, and tabs in incognito windows are excluded from backups.
- Changes made just before closing and tabs that fail to save may be missing from backups.
- Automatic backups move to the old folder at the next cleanup after seven days, then are deleted at the next cleanup after another seven days there. Move bookmarks you want to keep to “手動保存/”; this folder is not automatically deleted.
- The extension makes no external requests. If Chrome bookmark sync is enabled, Chrome may sync the bookmarks it creates. Saved page text stays on the device and is not part of bookmark sync.

Privacy policy: https://github.com/gearmind-inc/TabBundle/blob/main/PRIVACY.md
Contact: https://gearmind.cc/contact/
