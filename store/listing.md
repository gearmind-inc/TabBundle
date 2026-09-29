# Chrome ウェブストア掲載文案 / Chrome Web Store listing copy

短い説明の文字数は、説明本文だけを JavaScript の文字列の `.length`（UTF-16 コード単位）で数えました。日本語・英語とも公式の上限 132 文字以下です。詳しい説明の公式な文字数上限は確認できていません。

## 日本語

### 短い説明（文字数: 57）

開いていたタブをブックマークに自動保存。保存したページをタイトル・URL・ONにしたサイトの本文から検索できます。

### 詳しい説明

TabBundle は、通常ウィンドウで開いていたタブを Chrome のブックマークに残し、あとから探せるようにする拡張機能です。ウィンドウを閉じたときや Chrome を再起動したときのタブを「その他のブックマーク/TabBundle/自動バックアップ/」にまとめます。

- ツールバーのポップアップから、保存したページをタイトルと URL で検索できます。
- 右クリックメニューでサイトごとの本文保存を ON にすると、そのサイトのページ本文の先頭 20,000 字も検索に使えます。初期状態は全サイト OFF です。サイトへのアクセスは ON にするときだけ求めます。
- 固定タブ、新しいタブ、拡張機能のページ、URL が空のタブ、シークレットウィンドウのタブはバックアップしません。
- 自動バックアップは作成から 7 日を過ぎた後の片付けで old に移り、old に入ってから 7 日を過ぎた後の片付けで削除されます。手動保存フォルダは自動削除しません。
- 拡張機能は外部通信をしません。ただし、Chrome のブックマーク同期を有効にしている場合、作成したブックマークは Chrome によって同期されることがあります。保存した本文は `chrome.storage.local` に置かれ、ブックマーク同期の対象ではありません。

### 単一の目的（single purpose）

開いていたタブをブックマークに保存し、保存したページを後から検索できるようにします。サイトごとの本文保存は、保存済みページの検索を補助する任意の機能です。

### 権限ごとの理由

- `tabs`: 通常ウィンドウの開いているタブの URL、タイトル、固定の有無、並びを読み、バックアップするためです。
- `bookmarks`: TabBundle フォルダにバックアップを書き、保存済みページの検索と期限切れの自動バックアップの片付けをするためです。
- `storage`: タブの控え、保存後の確認待ち、ON のホスト名、本文、古いバックアップの移動時刻を `chrome.storage.local` に保存し、セッション ID を `chrome.storage.session` に保存するためです。
- `alarms`: 1 日 1 回の片付けを実行するためです。
- `contextMenus`: サイトごとの本文保存を ON / OFF する右クリックメニューを表示するためです。
- `scripting`: ON にしたサイトで、同梱の関数を実行してページ本文を読むためです。
- `unlimitedStorage`: 保存する本文が増えても、通常の 10 MB の保存上限で止まらないようにするためです。
- `https://*/*`（任意のサイト権限）: HTTPS サイトで本文保存を ON にしたとき、そのホストに限ってアクセス許可を求め、本文を読むためです。インストール時には要求しません。
- `http://*/*`（任意のサイト権限）: HTTP サイトで本文保存を ON にしたとき、そのホストに限ってアクセス許可を求め、本文を読むためです。インストール時には要求しません。

### リモートコードの有無

選択: **No, I am not using remote code.** 外部のスクリプトを読み込まず、`eval` や `new Function` を使いません。`chrome.scripting.executeScript` で実行するのは拡張機能に同梱した本文取得関数だけです。

### データの扱いの申告

扱うデータは、通常ウィンドウで開いているタブの URL・タイトル・固定の有無・並び、TabBundle 内のブックマーク、ON にしたホスト名、そのサイトで読んだページ本文です。本文には、ページによって個人情報などが含まれる可能性があります。シークレットウィンドウのタブは保存しません。

ダッシュボードでは、閲覧したサイトの URL やホスト名に対応する「Web browsing activity」と、ON にしたサイトの本文に対応する「Website content and resources」を申告候補として確認します。本文に個人情報や認証情報が含まれる場合の区分も、実際の画面と説明に照らして確認します。これらはデータ種別の説明から考えた候補で、チェックボックスの正確な表示名ではありません。**ダッシュボードで確認してください。** ローカル保存だけでもデータの取り扱いの申告対象です。

Limited Use: データは、タブのバックアップと保存済みページの検索という単一の目的にだけ使います。第三者へ送信・提供・販売しません。個人向け広告に使わず、広告プラットフォームやデータブローカーへ渡しません。信用判断・貸付にも使いません。開発者などの人が保存データを閲覧する機能はありません。ダッシュボードの認証文言は実画面で確認します。

### 提供者・サイト・問い合わせ先の欄 (下書き)

- 提供者名: 株式会社GearMind
- サイト (ホームページの URL): https://gearmind.cc/
- 問い合わせ先 (サポートの URL): https://gearmind.cc/contact/
- メールアドレスの欄は、このファイルに書かずダッシュボードで直接入れる

### プライバシーポリシーの URL 欄

ユーザーが置き場所を決めてから入れる。

## English

### Short description (character count: 113)

Automatically back up open tabs as bookmarks and search saved pages by title, URL, or text from sites you enable.

### Detailed description

TabBundle saves tabs from normal Chrome windows as bookmarks so you can find those pages later. It groups tabs from closed windows and previous Chrome sessions under “Other bookmarks/TabBundle/自動バックアップ/”.

- Search saved pages by title or URL in the toolbar popup.
- Optionally turn on page-text saving for a site from the right-click menu. TabBundle then uses up to the first 20,000 characters of visible text from that site's pages in search. This is OFF for every site by default. Site access is requested only when you turn it ON.
- Pinned tabs, new tabs, extension pages, tabs with empty URLs, and tabs in incognito windows are excluded from backups.
- Automatic backups move to the old folder at the next cleanup after seven days, then are deleted at the next cleanup after another seven days there. The manual-save folder is not deleted automatically.
- The extension makes no external requests. If Chrome bookmark sync is enabled, Chrome may sync the bookmarks it creates. Saved page text stays in `chrome.storage.local` and is not part of bookmark sync.

### Single purpose

Save open tabs as bookmarks and make saved pages searchable later. Optional page-text saving for selected sites supports that search.

### Permission justifications

- `tabs`: Read the URLs, titles, pinned status, and order of tabs in normal windows for backups.
- `bookmarks`: Write backups in the TabBundle folder, search saved pages, and clean up expired automatic backups.
- `storage`: Keep the tab snapshot, pending verification data, enabled hostnames, page text, and backup move times in `chrome.storage.local`, and a session ID in `chrome.storage.session`.
- `alarms`: Run daily cleanup.
- `contextMenus`: Show the right-click menu that turns page-text saving ON or OFF for a site.
- `scripting`: Run the bundled function that reads page text on sites where saving is ON.
- `unlimitedStorage`: Prevent saved page text from reaching the normal 10 MB storage limit.
- `https://*/*` (optional site access): When you enable text saving for an HTTPS site, request access to that hostname to read page text. It is not requested at installation.
- `http://*/*` (optional site access): When you enable text saving for an HTTP site, request access to that hostname to read page text. It is not requested at installation.

### Remote code

Select **No, I am not using remote code.** TabBundle does not load external scripts or use `eval` or `new Function`. The function passed to `chrome.scripting.executeScript` is bundled with the extension.

### Data use disclosure

TabBundle handles URLs, titles, pinned status, and order of tabs in normal windows; bookmarks under TabBundle; enabled hostnames; and page text read on those sites. Depending on the page, saved text may contain personal information or other sensitive content. It does not save tabs in incognito windows.

In the dashboard, check categories corresponding to “Web browsing activity” for URLs and hostnames, and “Website content and resources” for enabled page text. Check the live descriptions for whether personal or authentication information within page text requires another category. These are suggested data types, not verified checkbox labels. **Confirm them in the dashboard.** Local-only handling still requires disclosure.

Limited Use: TabBundle uses data only to back up tabs and search saved pages. It does not send, share, or sell data to third parties. It does not use data for personalized advertising, pass it to ad platforms or data brokers, or use it for credit decisions or lending. No feature lets the developer or other people read stored user data. Confirm the exact certification wording in the dashboard.

### Provider, website, and support fields (draft)

- Publisher name: 株式会社GearMind
- Website (homepage URL): https://gearmind.cc/
- Support URL: https://gearmind.cc/contact/
- Enter the email address directly in the dashboard; do not write it in this file.

### Privacy policy URL field

Enter it after the user chooses where to host the policy.

## 公式ページで確認できなかった点 / Items to confirm in the dashboard

- 単一の目的欄と権限理由欄の文字数上限。/ Character limits for the single-purpose and permission-justification fields.
- データ種別のチェックボックスの正確な表示名。/ Exact names of the data-type checkboxes.
- Limited Use などの認証チェックボックスの正確な文言。/ Exact wording of the certification checkboxes.
- 詳しい説明の文字数上限。/ Character limit for the detailed description.
- 提供者名・サイト・問い合わせ先の欄の正確な名前と置き場所 (アカウント設定か掲載情報か)。/ Exact names and locations (account settings or store listing) of the publisher name, website, and support fields.
- 法人として公開するときの「取引者 (trader)」の申告と、そのとき表示される連絡先の項目。/ The trader declaration for publishing as a company and which contact details it displays.
