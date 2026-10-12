# plan

PR を小さく分割するための区切りと、それぞれの受け入れ確認(観測可能な基準)。完了したものにチェックを付ける。
各スライスは [requirements.md](requirements.md) と対応する `features/*.md` の範囲を変えない。仕様そのものを変える場合は、先に対応する doc を更新する。

## 進捗

- [x] A. ドキュメントとレビュールール(本ファイル・requirements・features/*・CLAUDE.md)
- [ ] B. 品質チェックとスモークテストの tooling
- [ ] C. CI/CD(GitHub Actions)
- [ ] D. room: 作成・参加(パスワード・ニックネーム)の UI(ローカル状態のみ、サーバ未接続)
- [ ] E. server: RoomDO の骨格(SQLite 永続化・WebSocket 1 本・状態スナップショット配信)
- [ ] F. buzzer: キュー・解答権・ラウンドリセットの結線
- [ ] G. score: カウンタ表示・host による手動編集
- [ ] H. 再接続による識別・カウント・解答権制限の復元
- [ ] I. quizmaster 譲渡

## 各スライスの受け入れ確認

- **B**: `npm run lint` `npm run fmt:check` `npm run typecheck` `npm test` がいずれもローカルで実行でき、ビルド済み starter のホームページと `/api/hello` の応答をスモークテストが検証する。
- **C**: PR と main への push で CI が通る。PR では Worker Preview が作成され、PR を閉じると削除される。main への push では検証が通った場合のみ本番 deploy job が実行される(実際の deploy 成功は Cloudflare 側の secret 設定に依存)。
- **D**: ブラウザでルーム作成フォームからパスワードを設定して作成でき、招待 URL にパスワードなしでアクセスした場合は参加できないことを手動で確認できる。
- **E**: RoomDO に対する最小限の読み書きで状態が永続化され、Worker を再起動(hibernation 相当)しても同じルームの状態が復元されることを確認できる。
- **F**: 複数クライアントでボタンを押した順にキューへ入り、誤答でブロック・キュー送りが、正解でラウンドリセットが起きることを手動で確認できる。
- **G**: 正解・誤答に応じてカウンタが増え、host の編集操作でカウンタが即時に変わることを確認できる。
- **H**: 同じブラウザで再読み込みしても、参加者の識別・カウント・現在ラウンドの解答権制限が変わらないことを確認できる。
- **I**: quizmaster が参加者に役割を譲渡した後、新 quizmaster がボタンを押せず、元 quizmaster が参加者としてボタンを押せることを確認できる。

## 範囲外(現時点では着手しない)

[requirements.md](requirements.md) の非目標を参照。ルームの有効期限・参加人数上限は未決定の将来課題であり、上記スライスには含めない。
