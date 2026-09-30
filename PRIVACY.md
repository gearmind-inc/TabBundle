# TabBundle プライバシーポリシー

最終更新日: 2026-09-30

## 日本語

### 提供者と適用範囲

TabBundle は [GearMind Inc.（株式会社GearMind）](https://gearmind.cc/) が提供する Chrome 拡張機能です。このポリシーは、TabBundle が扱う情報について説明します。

### 取得する情報と利用目的

通常ウィンドウのタブの URL、タイトル、固定の有無、並び順を取得し、ブックマークへの自動保存と検索に使います。保存・復旧に必要なウィンドウなどの識別子と日時も記録します。

固定タブ、新しいタブ、拡張機能のページ、URL が空のタブは、ブックマークへの自動保存から除きます。自動保存前のタブ一覧には含まれます。シークレットウィンドウのタブは取得しません。

ページ本文の保存は、初期状態ではすべてのサイトで OFF です。右クリックメニューで ON にしたサイトのホスト名と、表示本文の先頭 20,000 字までを保存し、検索に使います。同じ URL の本文は上書きします。対象はホスト名の完全一致で判定するため、例えば `github.com` を ON にしても `gist.github.com` は対象になりません。休止中のタブや読み取れないページの本文は保存しません。

保存した URL、タイトル、本文には、閲覧したページによって個人情報や私的な内容が含まれることがあります。

### 保存場所と共有

情報は利用者の Chrome 内に保存します。TabBundle 自体は外部へ送信せず、開発者が保存データを取得・閲覧する機能もありません。アカウント登録は不要です。

ブックマークは「その他のブックマーク/TabBundle/」以下に保存します。Chrome のブックマーク同期が有効な場合、Chrome の機能によって Google に同期されることがあります。ページ本文は端末内に保存し、この同期の対象にはなりません。

TabBundle は保存データを独自に暗号化していません。端末や Chrome のプロファイルにアクセスできる人が、保存内容を読める可能性があります。

取得した情報は、タブのバックアップと保存済みページの検索にだけ使います。広告・アクセス解析、第三者への提供・販売、信用判断・貸付には利用しません。この情報の利用は、Chrome ウェブストアの [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) の制限に従います。

### 保存期間と削除方法

- 自動バックアップは、作成から 7 日を過ぎた後の整理で「old/自動バックアップ/」へ移し、移動から 7 日を過ぎた後の整理で削除します。整理は 1 日 1 回と Chrome の起動時に行います。Chrome が動いていない間は削除されません。自分で「old/自動バックアップ/」へ入れたフォルダも、整理で最初に見つかった時点から 7 日を過ぎた後の整理で削除します。
- 「手動保存/」内のブックマークは自動削除しません。残したいものは、このフォルダへ移してください。ブックマークは Chrome のブックマーク管理画面から削除できます。
- 本文保存を OFF にすると、そのサイトの保存済み本文とアクセス許可を削除します。Chrome の設定からサイトへのアクセスを取り消した場合も同様です。ON にしたサイトの設定は、OFF にするまで保持します。
- TabBundle 内にブックマークがなくなったページの本文は、削除・移動の数秒後、または 1 日 1 回の本文整理で削除します。ただし、開いているタブや自動バックアップの処理待ちのページの本文は残します。本文に一律の日数による保存期限はありません。
- 復旧用のタブ一覧は、タブの変更に合わせて更新します。閉じたウィンドウの情報は、保存処理を終えた後の更新時に削除します。保存直後の確認用データは、通常、保存から 60 秒以上経過した後の処理で削除します。Chrome の終了などで処理できなかった分は、次回起動時の復旧・確認まで残ります。
- 起動を区別する一時的な識別子は、Chrome の再起動や拡張機能の更新・再読み込み・無効化で消えます。復旧用データ内の識別子は、そのデータとともに削除します。古いバックアップの移動日時は、対象がその保存先からなくなった後の整理で削除します。

アンインストールすると、本文や復旧用データなど拡張機能内の保存情報は削除されます。作成済みのブックマークは残るため、不要なものは Chrome のブックマーク管理画面から削除してください。

### お問い合わせと変更

お問い合わせは [GearMind のフォーム](https://gearmind.cc/contact/) で受け付けます。送信する名前・メールアドレス・お問い合わせ内容には、[会社サイトのプライバシーポリシー](https://gearmind.cc/privacy/) が適用されます。

不具合や機能の要望は [GitHub Issues](https://github.com/gearmind-inc/TabBundle/issues) でも受け付けます。投稿は公開されます。個人情報や機密情報を含む URL・本文・画像は投稿しないでください。

このポリシーを変更した場合は、このページに変更後の内容と最終更新日を掲載します。

## English

Last updated: 2026-09-30

### Provider and scope

TabBundle is a Chrome extension provided by [GearMind Inc. (株式会社GearMind)](https://gearmind.cc/). This policy explains how TabBundle handles data.

### Data collected and its purpose

TabBundle reads the URLs, titles, pinned status, and order of tabs in normal windows for automatic bookmark backups and search. It also records identifiers, such as window identifiers, and timestamps needed for saving and recovery.

Pinned tabs, new tabs, extension pages, and tabs with empty URLs are excluded from automatic bookmark backups. They are included in the local tab snapshot before backup. Incognito tabs are not collected.

Page-text saving is OFF for every site by default. When enabled through the right-click menu, TabBundle saves the site's hostname and up to the first 20,000 characters of visible page text for search. Text saved for the same URL is replaced. Hostnames must match exactly: enabling `github.com` does not enable `gist.github.com`. Text from discarded tabs or unreadable pages is not saved.

Depending on the pages visited, saved URLs, titles, and text may contain personal information or private content.

### Storage and sharing

Data is stored in the user's Chrome browser. TabBundle itself does not send it externally and has no feature that lets the developer retrieve or read it. No account registration is required.

Bookmarks are saved under “Other bookmarks/TabBundle/”. If Chrome bookmark sync is enabled, Chrome may sync them to Google. Page text is stored on the device and is not included in bookmark sync.

TabBundle does not encrypt stored data itself. Someone with access to the device or Chrome profile may be able to read it.

Data is used only for tab backups and searching saved pages. It is not used for advertising, analytics, credit decisions, or lending, or shared or sold to third parties. This use of information adheres to the Chrome Web Store's [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) restrictions.

### Retention and deletion

- Automatic backups move to “old/自動バックアップ/” at the next cleanup after they become more than seven days old. They are deleted at the next cleanup after more than seven days in that folder. Cleanup runs daily and when Chrome starts. Data is not deleted while Chrome is not running. Folders you place in “old/自動バックアップ/” yourself are also deleted at the next cleanup after more than seven days from when cleanup first finds them.
- Bookmarks in “手動保存/” are not automatically deleted. Move bookmarks there to keep them. You can delete bookmarks in Chrome's bookmark manager.
- Turning page-text saving OFF deletes the site's saved text and removes its access permission. Revoking site access in Chrome's settings does the same. Enabled-site settings are kept until turned OFF.
- Text for pages no longer bookmarked under TabBundle is deleted a few seconds after bookmarks are deleted or moved, or during daily text cleanup, except for open tabs and pages awaiting automatic backup. Page text has no fixed retention period.
- The recovery snapshot is updated as tabs change. Information about a closed window is removed during a snapshot update after its save operation completes. Data kept to check a recent save is normally removed during processing after at least 60 seconds have passed. If Chrome closes before processing completes, data remains until recovery and verification on the next startup.
- The temporary identifier used to distinguish browser sessions is cleared when Chrome restarts or the extension is updated, reloaded, or disabled. Identifiers in recovery data are deleted with that data. Backup move timestamps are deleted during cleanup after the corresponding items leave the old-backup folder.

Uninstalling TabBundle deletes its internal data, including saved text and recovery data. Created bookmarks remain. Delete unwanted bookmarks in Chrome's bookmark manager.

### Contact and changes

For questions, use the [GearMind contact form](https://gearmind.cc/contact/). Names, email addresses, and messages submitted through the form are covered by the [company website's privacy policy](https://gearmind.cc/privacy/).

Bug reports and feature requests are also welcome in [GitHub Issues](https://github.com/gearmind-inc/TabBundle/issues). Posts are public. Do not post URLs, text, or images containing personal or confidential information.

If this policy changes, the revised text and last-updated date will be posted on this page.
