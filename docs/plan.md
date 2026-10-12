# plan

PR を小さく分割するための区切りと、それぞれの受け入れ確認(観測可能な基準)。完了したものにチェックを付ける。
各スライスは [requirements.md](requirements.md) と対応する `features/*.md` の範囲を変えない。仕様そのものを変える場合は、先に対応する doc を更新する。

## 進捗

- [x] A. ドキュメントとレビュールール(本ファイル・requirements・features/*・CLAUDE.md)
- [x] B. 品質チェックとスモークテストの tooling
- [x] C. CI/CD(GitHub Actions)のワークフロー結線と、本番公開先ドメインを含む `cloudflare.config.ts` の設定。repository Actions secret の名前(`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`)は登録済みだが、実際の権限での動作と hosted な Preview・本番 deploy の受け入れ確認は未完了([deploy.md](deploy.md) の未決事項を参照)。
- [ ] D. room: 作成・参加・参加者一覧(パスワード・ニックネーム)を RoomDO + 単一 WebSocket のスナップショット配信 + UI まで一貫して実装(同一ブラウザでの参加者識別の再接続復元を含む)
- [ ] E. buzzer: キュー・解答権(誤答ブロック・正解時の自動ラウンドリセット・host の手動リセット)と correctcount・wrongcount の自動加算を RoomDO への永続化 + UI まで一貫して実装(今ラウンドの誤答ブロック状態の再接続・hibernation 復元を含む)
- [ ] F. host による採点カウンタの手動編集、quizmaster 譲渡、quizmaster 切断時の復帰待ちを RoomDO + UI まで一貫して実装

各スライスは「ブラウザ UI だけ」「サーバだけ」に分けず、該当する doc([requirements.md](requirements.md) の該当範囲・対応する `features/*.md`)の挙動をエンドツーエンドで満たす PR 単位にする。再接続・hibernation 後の状態復元の回帰確認は、独立したスライスにせず D・E それぞれの受け入れ確認に含める。

PR ごとの Worker Preview 上での動作確認も各スライスの受け入れ基準に含める。ただし repository Actions secret の実際の権限・hosted な Preview の作成・削除の成否は PR 経由の Actions 実行でまだ検証できていないため([deploy.md](deploy.md) 参照)、それが確認できるまで進捗チェックはワークフロー結線・ローカルでの動作確認の完了を指し、hosted な Preview 上での受け入れ確認の完了は意味しない。

## 各スライスの受け入れ確認

- **B**: `npm run lint` `npm run fmt:check` `npm run typecheck` `npm test` がいずれもローカルで実行でき、ビルド済み starter のホームページと `/api/hello` の応答をスモークテストが検証する。
- **C**: PR と main への push で CI が通る。PR では Worker Preview が作成され、PR を閉じると削除される。main への push では検証が通った場合のみ本番 deploy job が実行される(実際の deploy 成功は Cloudflare 側の secret 設定に依存)。
- **D**: ブラウザでルーム作成フォームからパスワードを設定して作成でき、ニックネームで参加できる。招待 URL にパスワードなしでアクセスした場合は参加できないことを手動で確認できる。複数クライアントの参加者一覧が単一 WebSocket のスナップショット配信で揃うこと、同じブラウザで再読み込みしてもニックネームでの識別が復元されることを確認できる。
  テスト: room 作成・参加・パスワード検証の純粋関数テスト、RoomDO の読み書き・スナップショット配信・再接続時の識別復元を検証する DO テスト、UI からの作成・参加・再読み込みを検証するブラウザテスト。
- **E**: 複数クライアントでボタンを押すと RoomDO がリクエストを受信した順(押下時刻やサーバ到着時刻同士の比較ではない)にキューへ入り、誤答でブロック・キュー送りが、正解で correctcount が +1 されて自動でラウンドがリセットされることを手動で確認できる。まだ押していない参加者がいる間はキューが空でもラウンドが継続し、全員が押してすべて誤答しキューが空になった場合にのみ host の手動リセットで次ラウンドへ進むこと、Worker 再起動(hibernation 相当)後も今ラウンドの誤答ブロック状態が復元されることを確認できる。
  テスト: キュー・解答権・ラウンドリセットの純粋関数テスト、correctcount/wrongcount の永続化とブロック状態の再接続・hibernation 復元を検証する DO テスト、複数クライアントでの押下順序と結果表示を検証するブラウザテスト。
- **F**: host の編集操作で参加者の correctcount・wrongcount が即時に変わることを確認できる。quizmaster が参加者に役割を譲渡した後、新 quizmaster がボタンを押せず元 quizmaster が参加者としてボタンを押せること、quizmaster が切断しても自動で他の参加者に役割が移らず本人の復帰を待つことを確認できる。
  テスト: カウンタ手動編集・役割譲渡の純粋関数テスト、権威を持つ RoomDO 側での編集・譲渡・切断時の状態保持を検証する DO テスト、UI からの編集・譲渡操作を検証するブラウザテスト。

## 範囲外(現時点では着手しない)

[requirements.md](requirements.md) の非目標を参照。ルームの有効期限・参加人数上限は未決定の将来課題であり、上記スライスには含めない。
