# 実ゲームの実装・検証記録

## 基準と変更範囲

origin/main `75e0a80` を基準に、別worktreeの `implement/room-game` で実装。元の `design/quiz-show-stage` と `25e32db`、Sites保存版8、元比較Site、本番は変更しない。承認後に作業ブランチをpushし、draft PR #2とWorker Preview `pr-2`を作成した。本番へのmerge/deployは未実行。

vinext / Cloudflare Workers、1部屋1 SQLite-backed RoomDO、単一WebSocket、配信前永続化、D→E→Fを継承。app/はルーティングとレイアウト、room/server/が認証・RoomDO、buzzer/scoreは純粋処理。ブラウザからserver/をimportしない。独立Worker層や差し替え抽象化は追加していない。

## 承認済みのセッション

- Cookieはルーム単位のHttpOnly、SameSite=Strict、ルーム配下のPath。本番HTTPSではSecure。localhostのHTTPだけ開発用にSecureを付けない。
- 暗号学的乱数32byteのトークンを発行し、RoomDOにはSHA-256ハッシュと参加者ID、期限だけ保存する。名前はIDでも本人証明でもない。
- 期限はRoomDOで発行から24時間に固定。CookieのExpiresも同じ時刻。ページ読込、再接続、操作で延長しない。
- 期限切れは接続時・各操作・alarmで検証。接続中も期限で切断する。期限切れ後は再入室となり、別参加者になる。ルーム状態や既存得点は削除しない。
- パスワードはルームごとのsaltとPBKDF2-SHA256（100,000回）で導出。平文を保存しない。秘密をURL・ログ・公開スナップショットへ含めない。
- 作成・入室はServer Actions。OriginとHostを照合する。WebSocketも完全一致のOriginを要求し、CookieをRoomDOで照合する。

## 同期と操作

- room/server/entry.tsは同じWorkerのクラス公開とWebSocket Upgradeの直結を担当。通常HTTPとServer Actionsはvinextへ渡す。POST本文はvinextと同じ1 MiB以内で読み込み、完全一致のOrigin検証を追加してから渡す。vinext 1.1のRoute Handlerは101応答を通常Responseへ再構築して失敗したため、この最小の結線を採用した。
- RoomDOのSQLiteに参加者・司会・得点・ラウンド・押下履歴を保存。各早押し操作は同期処理で、クライアント時刻を使わない。保存後に完全スナップショットを全クライアントへ配信。
- 認証済みソケットの参加者IDを使用する。クライアントが申告した名前・役割は認可に使わない。
- 押下履歴と回答待ちを分離。誤答後も順位は不変。正解／リセットで履歴とロックを消す。司会交代後も過去の押下履歴は再番号付けしない。
- 連打は一度だけ追加。ラウンドと採点対象を照合して、古い操作・二重判定・二重リセットを拒否する。司会以外の判定・編集・交代は拒否。
- 再接続時はコマンドを自動再送せず、認証後の最新スナップショットを取得。得点・役割・ロックを復元する。
- Hibernation WebSocket APIとソケット添付情報を使用。重要状態はメモリだけに置かない。接続表示は現在OPENの認証済みソケットから導出する。

## UI

白・青・黄色の選択済みデザインを継承。名前＋パスワード、ルーム名なし、同じルーム内での入室、URLだけをコピー、コンパクトな全員のカードと右上の押下順バッジ。長い名前は省略し、全文と得点編集をダイアログで開く。表示名1〜24文字・パスワード1〜128文字はサーバーでも検証する。

早押しボタンは参加者画面の下部に固定。safe areaを確保し、実測した高さを本文末尾の余白へ反映する。フォーム・ダイアログ中は操作を隠し、Spaceは入力やボタンのキー操作を妨げない。切断・再接続・送信中・誤答ロック中は押下不可。

## ローカル検証

- 純粋処理：受信処理の順序、二重押下、途中参加、誤答、正解、全員誤答、手動リセット、手動採点、表示名。
- セッション：ランダムトークン、ハッシュ、ルーム別Cookie、24時間境界、salt付きパスワード、Origin照合。
- 生成フォームから実Server ActionsへHTTP POSTし、作成、未認証時の入室画面、誤パスワード、再試行、Cookie属性とExpiresを確認。
- ビルド済みWorkerをMiniflare/workerdで起動し、独立したCookieの実WebSocket3クライアントで権限・順序・二重送信・切断・復帰・役割と得点を確認。
- ランタイムを破棄して同じSQLite保存先で再起動し、得点・司会・押下履歴・誤答ロックを復元。テスト専用SQLアクセスでセッション期限を過去にし、認証拒否と1008切断を確認。本番用の時刻変更・テストAPIは追加していない。
- 実ブラウザで作成から実ルーム接続を確認。独立した15クライアントを加え、16人の実データで表示と押下順を確認。

## HTTP回帰テストの500の切り分け

作成・入室・偽装Originの403・存在しない部屋の404の後、正常な `/api/hello` が間欠的に500になる現象を調査した。古い開発サーバーと確認用クライアントを通常終了しても、変更前の完全フロー20回で2回再現した。Origin拒否と404だけの60回では再現しなかった。ローカル中継の診断で、失敗要求はアプリに届く前のUndici/MiniflareのHTTP接続リセット（ECONNRESET）と対応した。

テストは303・403応答の本文を読み残していた。同じ要求と同じ成否条件を維持して応答をすべて読み切る比較では60回成功、その後に読み残す条件へ戻すと40回中5回再現した。この観測に基づき、リダイレクト・拒否・起動確認の応答も読み切るようテストを修正した。アプリのAPIやOrigin拒否を削除したり、失敗した正常APIをリトライして通したりはしていない。

ただし応答の読み切りだけでは、後の強化テストで404が500となって再発した。根本修正とは区別する。[workerd既知不具合 #7634](https://github.com/cloudflare/workerd/issues/7634) は、service bindingを通過した未読リクエスト本文を残して早期応答するとTCP接続をresetすることを報告しており、今回の診断と一致する。Worker入口でPOST本文を上限1 MiB（vinext既定と同じ）まで読み切ってからOriginを照合し、正当な要求だけをvinextへ渡すよう修正した。Origin拒否を緩めず、schemeも含めた完全一致と欠落時の403を検証する。巨大本文は無制限に読み込まず413で拒否するため、上限を超える未読本文の接続処理自体はworkerd側の制約が残る。

回帰テストは完全フローを20回繰り返し、各回403・404の後も正常APIの200とJSON内容を検証する。HTTPテストのSQLite保存先は一時ディレクトリへ分離し、通常の開発状態と混ぜない。DOテストのruntimeは開発Worker登録を無効にし、独立した保存先で再起動・復元する。

## 最終検証結果（2026-10-25）

- `npm run typegen`、`npm run typecheck`、`npm run lint`、`npm run fmt:check`、`npm run build`、`git diff --check` は成功。
- `npm test` は16件成功（失敗0）。HTTP全フロー20回を含む。先行する修正後スモーク20回も成功。
- 修正前に40回中5回失敗した「303/403応答を読み残す」診断を同じ条件で再実行し、修正後40回の失敗は0。正常API失敗のリトライは行っていない。
- 認証、固定24h期限、WebSocket完全一致Origin、操作認可、サーバー受信順、同期SQLite保存後の配信、再接続の状態復元、公開スナップショットの秘密非公開、司会操作を実装・テストと照合した。Cloudflare上の実hibernationは下記の未検証事項として区別する。
- 画面確認画像はtaskの `outputs/real-game-desktop.jpg`、`real-game-mobile-320.jpg`、`real-game-mobile-390.jpg`、`real-game-fixed-bottom.jpg`。16人表示と下部固定・本文余白を確認。今回のHTTP修正ではUIを変更していない。

## 残る検証と制約

hosted Previewの主要ゲーム操作は [hosted-qa.md](hosted-qa.md) の範囲で確認済み。実iOS/Androidキーボード・ノッチ、公開環境の負荷試験、実DO hibernationの独立した観測は未実施。待機後の再操作・再読み込み・ローカルSQLite cold restart復元とは区別する。

基盤のmainには既にPR #1のmerge commit `75e0a80` があるため、古い「mainへmergeしていない」という記述は現状ではない。既存本番の同SHAの成功はActions実行38195874159で確認した。Preview削除の今回の検証は行っていない。今回のコードを本番へ反映したことを意味しない。

参照：[Cloudflare WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)、[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)。

## PR Previewの結線修正

PR #2の初回Preview deployは10061で失敗した。cf/configの `bindings.durableObject({worker:"buzzroom",...})` は `script_name` を常に出力し、Preview内のクラスでなく既存本番Workerを参照するためだった。同Workerのloopback binding `exports.RoomDO` に修正し、既存の1部屋1DO・同Workerの設計を保持した。cfのexports宣言によるSQLite namespaceは維持し、資格情報やAccess設定は変更しない。

## PRとPreviewの確認結果（URL再有効化前）

- Draft PR: https://github.com/tanakalucky/buzzroom/pull/2 。mainへのmergeはしていない。
- 修正コミット `587131709e66102b869baed4ee5e036c1531947b` の [CI](https://github.com/tanakalucky/buzzroom/actions/runs/40148210584) と [Preview deploy](https://github.com/tanakalucky/buzzroom/actions/runs/40148210539) は成功。ローカルの全16テスト、型生成・型検査・lint・整形・buildも成功。
- Preview名 `pr-2`、ID `2cd17e3a07354f7fbb32bbb711ac5113`、deployment ID `b76a5056-d8e0-4e1a-af0b-03e5d8177573`。ただしAPIの `preview_urls` と `deployment_urls` は空配列。閲覧成功とは扱わない。
- 既存認証で `cf workers get buzzroom` を読み取り、Worker全体の `subdomain.enabled=false`、`subdomain.previews_enabled=false` を確認した。返された候補suffixは有効URLの証拠ではない。
- Worker全体のPreview URL有効化はPR単体に閉じた変更ではないため、共有範囲を広げない指示に従い保留。Access・本番コード・本番ルート・ドメイン設定は変更していない。
- 公開先のCookie・WebSocket・複数クライアント・再接続・hibernation検証は、安全なURL公開方法が確定するまで未実行。Dashboard専用タブはログイン画面だったが、CLI既存認証は読み取りに利用できた。新規ログイン・資格情報は作成していない。

## Preview URLの再有効化

PR #1の成功ログも同じ `cf previews deploy pr-1 --prebuilt` であり、別Worker方式ではなかった。本番初回のActions実行 `38195874159` に、workers.dev無効・preview_urls未指定のためPreview URLsを無効化した記録がある。

その後のユーザー承認に従い、Worker `buzzroom` の `subdomain.previews_enabled` だけをtrueにした。通常公開の `enabled=false` を維持し、API読み戻しでも両方を確認した。設定に `previewUrls: true` を明示し、後の本番デプロイで再度無効化されるのを防ぐ。

既存Accessアプリ `workers.dev` の対象は `*.luckyyeslucky777.workers.dev/*`。対象・許可ポリシー・IdP・セッション設定等は前後で一致し、追加・拡大していない。公式APIが返したURLは https://pr-2-buzzroom.luckyyeslucky777.workers.dev/ 。未認証で302により `tanakalucky.cloudflareaccess.com` へ遷移し、通常workers.dev URLは404を確認した。

当初はAccessログイン待ちだったが、その後ユーザーのChromeで認証後の実画面を確認し、専用テストルームで司会と参加者2人のhostedゲーム操作を検証した。確認範囲と未確認事項は [hosted-qa.md](hosted-qa.md) に記録する。Accessを回避する資格情報や許可ポリシーは追加しない。本番へのmerge/deployは行わない。
