# TabBundle プライバシーポリシー

最終更新日: 2026-09-29

## 日本語

### 集める情報と使い方

TabBundle は、通常ウィンドウで開いているタブの URL、タイトル、固定の有無、並び順を読みます。タブの一覧を控え、自動バックアップ用のブックマークを作るために使います。保存したブックマークのタイトルと URL は、ポップアップの検索にも使います。

ページ本文の保存は、最初はすべてのサイトで OFF です。右クリックメニューで ON にしたホスト名と、該当ページの表示本文の先頭 20,000 字を扱います。ON の判定はホスト名の完全一致です。本文は URL ごとに保存し、ポップアップの検索に使います。休止中のタブや読み取れないページの本文は保存しません。本文には、開いたページによって個人情報が含まれる可能性があります。

固定タブ、新しいタブ、拡張機能のページ、URL が空のタブはバックアップしません。シークレットウィンドウのタブは、タブの控えにも本文の保存にも含めません。

### 保存場所と共有

情報はこの PC の Chrome 内に保存します。ブックマークは「その他のブックマーク/TabBundle/」以下に置きます。タブの控え、保存後の確認待ち情報、ON のホスト名、本文、古いバックアップを移した時刻は `chrome.storage.local` に置きます。一時的なセッション ID は `chrome.storage.session` に置きます。`chrome.storage.sync` は使いません。保存データを拡張機能で暗号化していません。

TabBundle 自体はデータを外部へ送信せず、第三者に提供・販売しません。広告や解析にも使いません。アカウント登録、メールアドレスの入力、`chrome.identity` は使いません。取得した情報は、タブのバックアップと保存済みページの検索という目的にだけ使います。個人向け広告、広告プラットフォームやデータブローカーへの提供、信用判断や貸付には使いません。開発者やその関係者が保存データを閲覧する機能もありません。この取り扱いは Chrome ウェブストアの User Data Policy と Limited Use の制限に従います。

TabBundle が作るブックマークは、Chrome の通常のブックマークです。Chrome のブックマーク同期を有効にしている場合、Chrome 自身の機能として Google に同期されることがあります。これは TabBundle による送信ではありません。`chrome.storage.local` にある本文は Chrome のブックマーク同期の対象ではありません。

### 保存期間と削除

自動バックアップは作成から 7 日を過ぎた後の次の片付けで「old/自動バックアップ/」へ移します。そこに移ってから 7 日を過ぎた後の次の片付けで削除します。「手動保存/」は自動で移動・削除しません。

サイトを OFF にすると、そのホストの保存済み本文をすべて消し、サイトへのアクセス許可を外します。Chrome の拡張機能設定でサイトへのアクセスを外した場合も、OFF にして本文を消します。TabBundle 内のブックマークから URL がなくなった本文は、片付けの際に消します。ただし、現在開いているタブと、まだバックアップを書いていないウィンドウの URL の本文は残します。

右クリックメニューからサイトを OFF にできます。TabBundle のブックマークは Chrome のブックマーク管理画面で削除できます。Chrome の仕様で、TabBundle をアンインストールすると `chrome.storage.local` のデータは削除されますが、作成済みのブックマークは残ります。不要なブックマークはご自身で削除できます。

### 権限と理由

| 権限 | 理由 |
|---|---|
| `tabs` | 開いているタブの URL とタイトルを読んで、自動バックアップに残すため |
| `bookmarks` | TabBundle フォルダに書き込み、検索のために読むため |
| `storage` | 控え、本文、ON のサイトの一覧を、この PC の中に置くため |
| `alarms` | 1 日 1 回の片付けのため |
| `contextMenus` | 本文の保存を ON / OFF する右クリックメニューのため |
| `scripting` | ON にしたサイトのページから本文を読むため |
| `unlimitedStorage` | 本文がたまっても保存の上限（10 MB）で止まらないようにするため |
| サイトへのアクセス（`optional_host_permissions`） | インストール時には求めず、本文の保存を ON にしたサイトだけ、そのときに許可を求めるため |

### 問い合わせと変更

問い合わせは GitHub の TabBundle リポジトリの Issues で受け付けます。このポリシーを変更した場合は、ここに変更後の内容と最終更新日を掲載します。

## English

Last updated: 2026-09-29

### Data collected and how it is used

TabBundle reads the URL, title, pinned status, and order of tabs in normal windows. It keeps a local snapshot of open tabs to create automatic bookmark backups. It also uses the titles and URLs of saved bookmarks for search in the popup.

Saving page text is OFF for every site by default. When you turn it ON through the right-click menu, TabBundle stores the exact hostname and up to the first 20,000 characters of visible page text. Hostnames must match exactly. Text is stored by URL and used for search in the popup. It does not save text from discarded tabs or pages it cannot read. Depending on the page, the saved text may contain personal information.

Pinned tabs, new tabs, extension pages, and tabs with empty URLs are excluded from backups. Tabs in incognito windows are excluded from both the tab snapshot and page-text saving.

### Storage and sharing

Data is stored in Chrome on this computer. Bookmarks are placed under “Other bookmarks/TabBundle/”. The tab snapshot, pending verification data, enabled hostnames, page text, and timestamps for moved backups are stored in `chrome.storage.local`. A temporary session ID is stored in `chrome.storage.session`. TabBundle does not use `chrome.storage.sync`. TabBundle does not encrypt stored data itself.

TabBundle does not send data outside the extension, share it with third parties, or sell it. It does not use data for advertising or analytics. It does not require account registration or an email address, and it does not use `chrome.identity`. It uses the data only to back up tabs and search saved pages. It does not use data for personalized advertising, provide it to ad platforms or data brokers, or use it for credit decisions or lending. The developer and their staff have no feature for reading stored user data. This use complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

Bookmarks created by TabBundle are ordinary Chrome bookmarks. If Chrome bookmark sync is enabled, Chrome itself may sync them to Google. TabBundle does not send them. Page text in `chrome.storage.local` is not part of Chrome bookmark sync.

### Retention and deletion

At the next cleanup after an automatic backup becomes more than seven days old, TabBundle moves it to “old/自動バックアップ/”. At the next cleanup after it has spent more than seven days there, TabBundle deletes it. TabBundle does not automatically move or delete items in “手動保存/”.

Turning a site OFF deletes all saved page text for that hostname and removes its site access permission. Removing site access in Chrome's extension settings also turns it OFF and deletes that text. During cleanup, TabBundle deletes text for URLs no longer bookmarked under TabBundle. It keeps text for tabs that are still open and for windows whose backups have not yet been written.

You can turn a site OFF using the right-click menu and delete TabBundle bookmarks in Chrome's bookmark manager. Under Chrome's behavior, uninstalling TabBundle deletes its `chrome.storage.local` data, while its bookmarks remain. You can delete those bookmarks yourself.

### Permissions and reasons

| Permission | Reason |
|---|---|
| `tabs` | Read open-tab URLs and titles for automatic backups |
| `bookmarks` | Write to the TabBundle folder and read it for search |
| `storage` | Keep the tab snapshot, page text, and enabled hostnames in Chrome on this computer |
| `alarms` | Run daily cleanup |
| `contextMenus` | Provide the right-click menu for turning page-text saving ON or OFF |
| `scripting` | Read page text on sites where saving is ON |
| `unlimitedStorage` | Keep page-text storage from stopping at the 10 MB limit |
| Site access (`optional_host_permissions`) | Request access only when you turn on page-text saving for a site, not at installation |

### Contact and changes

For questions, use Issues in the TabBundle GitHub repository. If this policy changes, the revised text and last-updated date will be posted here.
