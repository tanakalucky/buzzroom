# buzzroom

招待URLとパスワードで仲間が集まり、早押しと採点を行うWebアプリ。vinext + Cloudflare Workers + SQLite-backed Durable Objectsで動く。

## 現在の実装

- 作成は本人名と任意のパスワード。ルーム名・アカウント登録は不要。
- 招待URLの同じルーム画面で、本人名とパスワードを入力して入室。
- 1部屋1 RoomDO、単一WebSocketで参加者・押下順・回答権・得点を同期。受信順はサーバーが確定する。
- 誤答ロック、正解での次ターン、司会の手動リセット・得点編集・司会交代。
- HttpOnly Cookieとサーバー内のトークンハッシュで本人を復元。発行から固定24時間、アクセスでは延長しない。ルームの有効期限とは別。
- コンパクトなカード、右上の押下順、名前の全文表示、画面下部固定の早押しボタン。問題そのものは出題者が口頭等で読み上げる。音声は再生しない。

これは実ゲームの**ローカル実装**であり、この変更のpush・PR・hosted Preview・本番反映は行っていない。Sites保存版8はデザイン参照として保持し、変更していない。詳細と検証限界は [実装記録](docs/implementation-decisions.md)。

## ローカル開発

```sh
npm ci
npm run typegen
npm run dev
```

作成した任意のルームURLへ、別のブラウザプロファイルやプライベートウィンドウで参加する。同じブラウザの同じルームではCookieにより同一参加者となる。保存されるローカルのRoomDOデータを本番データとして扱わない。

## 検証

```sh
npm run lint
npm run fmt:check
npm run typegen
npm run typecheck
npm run build
npm test
```

テストはルール・セッションの純粋関数、生成フォーム経由のServer Actions、ビルド済みworkerd上の実WebSocketとSQLite永続化を検証する。テスト専用の保存先を使い、本番にはアクセスしない。

`npm run start` はビルド済みWorkerのローカルpreview。`npm run format` は整形。`npm run deploy` は本番操作になるため、今回の作業では実行しない。

## ドキュメント

- [全体要求と構成](docs/requirements.md)
- [ルーム](docs/features/room.md) / [早押し](docs/features/buzzer.md) / [採点](docs/features/score.md)
- [段階と進捗](docs/plan.md) / [デプロイ](docs/deploy.md)
- [実装・検証記録](docs/implementation-decisions.md)
- [作業規約](CLAUDE.md)
