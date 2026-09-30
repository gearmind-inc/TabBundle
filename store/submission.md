# Chrome ウェブストアへの申請

掲載本文は [listing.md](listing.md)、利用者向けの説明は [PRIVACY.md](../PRIVACY.md) にあります。このファイルは申請者向けです。

## 登録するリンクと提供者

| 項目 | 入力内容 |
|---|---|
| 提供者 | GearMind Inc. |
| 登記上の法人名を求められた場合 | 株式会社GearMind |
| 製品ホームページ | https://github.com/gearmind-inc/TabBundle |
| プライバシーポリシー | https://github.com/gearmind-inc/TabBundle/blob/main/PRIVACY.md |
| お問い合わせ | https://gearmind.cc/contact/ |

製品ホームページの README から、ポリシーへリンクします。会社サイトのポリシーはお問い合わせ用なので、製品ポリシーの代わりには登録しません。メールアドレスはダッシュボードに直接入力してください。

## 単一の目的 / Single purpose

開いていたタブをブックマークに保存し、保存したページを後から検索できるようにします。サイトごとの本文保存は、検索を補助する任意の機能です。

Save open tabs as bookmarks and make saved pages searchable later. Optional page-text saving for selected sites supports that search.

## 権限ごとの理由

- `tabs`: 通常ウィンドウの開いているタブの URL、タイトル、固定の有無、並びを読み、バックアップするためです。
- `bookmarks`: TabBundle フォルダにバックアップを書き、保存済みページの検索と期限切れの自動バックアップの片付けをするためです。
- `storage`: タブの控え、保存後の確認待ち、ON のホスト名、本文、古いバックアップの移動時刻を `chrome.storage.local` に保存し、セッション ID を `chrome.storage.session` に保存するためです。
- `alarms`: 1 日 1 回の片付けを実行するためです。
- `contextMenus`: サイトごとの本文保存を ON / OFF する右クリックメニューを表示するためです。
- `scripting`: ON にしたサイトで、同梱の関数を実行してページ本文を読むためです。
- `unlimitedStorage`: 保存する本文が増えても、通常の 10 MB の保存上限で止まらないようにするためです。
- `https://*/*`（任意のサイト権限）: HTTPS サイトで本文保存を ON にしたとき、そのホストに限ってアクセス許可を求め、本文を読むためです。インストール時には要求しません。
- `http://*/*`（任意のサイト権限）: HTTP サイトで本文保存を ON にしたとき、そのホストに限ってアクセス許可を求め、本文を読むためです。インストール時には要求しません。

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

## リモートコード / Remote code

申告: **No, I am not using remote code.**

外部のスクリプトは読み込みません。ページ本文の取得には、拡張機能に同梱した関数を使います。

TabBundle does not load external scripts. The function used to read page text is bundled with the extension.

## データの取り扱い

端末内で処理する情報も開示対象です。「外部へ送信しない」ことを理由に「データを扱わない」と申告しないでください。

| 扱う情報 | ダッシュボードで照合するデータ種別 |
|---|---|
| タブ・ブックマークの URL、タイトル、サイトのホスト名 | 閲覧履歴に関する区分 |
| ON にしたサイトの表示本文 | ウェブサイトのコンテンツに関する区分 |
| 本文などに含まれ得る氏名、メッセージ、健康・金融・認証などの情報 | 個人情報、個人的な通信、健康、金融、認証情報など、該当する各区分 |

上表は扱う情報との対応です。実際のチェック項目は、申請時の画面の定義に照らして確定してください。本文を任意のサイトから取得できるため、閲覧履歴とコンテンツの 2 区分だけで十分とは断定していません。

情報はバックアップと検索にのみ利用し、広告・アクセス解析、第三者への提供・販売、信用判断・貸付には利用しません。開発者が端末内の保存情報を取得・閲覧する機能はありません。Chrome によるブックマーク同期と、利用者が任意に送るお問い合わせは、製品ポリシーで区別しています。

## 申請前の確認

以下が未確認の間は、公開準備が完了したものとして扱わないでください。

- [ ] 保存データの保護が Chrome ウェブストアの要件を満たすことを確認する。公式 FAQ の「What type of encryption does the User Data Policy require?」には、保存時の暗号化も記載されている。TabBundle は独自に暗号化しないと説明しているため、端末内保存だけで適合すると判断せず、保存方式の確認と、必要なら Chrome ウェブストアへの照会を行う。適合しない場合は、実装対応後に再確認する。
- [ ] この変更を main に反映した後、製品ホームページとポリシーをログアウト状態で開き、更新後の本文とリンクを確認する。
- [ ] データ種別と Limited Use の認証欄を実画面で確認し、ポリシーと一致する申告を登録する。
- [ ] 提供者・連絡先・取引者（trader）情報を登録し、公開される情報をプレビューで確認する。
- [ ] 日英の掲載本文と画像を登録する。短い説明は 132 文字以内とし、日本語は manifest の description と一致させる。各欄の上限と掲載結果は実画面で確認する。

## 公式資料

- [プライバシーポリシーの要件](https://developer.chrome.com/docs/webstore/program-policies/privacy)
- [User Data FAQ（端末内保存・暗号化・開示）](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [プライバシー欄への入力](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [掲載情報の要件](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
