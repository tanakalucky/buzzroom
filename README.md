# buzzroom

パスワード制のルームでクイズの早押し(バズ)と採点を行う Web アプリ。[vinext](https://github.com/cloudflare/vinext) + Cloudflare Workers で動く。

## セットアップ

```sh
npm install
npm run dev
```

ターミナルに表示されるローカル URL を開く。

## スクリプト

| コマンド            | 用途                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | ローカル開発サーバの起動                                                                                                   |
| `npm run build`     | Cloudflare Worker 向け build                                                                                               |
| `npm run start`     | build 済み Worker のローカル preview                                                                                       |
| `npm run deploy`    | Cloudflare Worker への deploy                                                                                              |
| `npm run typegen`   | App Router のルート補助型を生成(`vinext typegen`)                                                                          |
| `npm run typecheck` | `tsc --noEmit` による型チェック                                                                                            |
| `npm run lint`      | oxlint によるチェック                                                                                                      |
| `npm run fmt:check` | oxfmt によるフォーマット確認                                                                                               |
| `npm run format`    | oxfmt によるフォーマット適用                                                                                               |
| `npm test`          | build 済み Worker を preview し、ホームページと `/api/hello` の実応答を確認するスモークテスト(先に `npm run build` が必要) |

## ドキュメント

- [docs/requirements.md](docs/requirements.md) - 全体スコープ・非目標・ディレクトリ構成
- [docs/features/room.md](docs/features/room.md) / [buzzer.md](docs/features/buzzer.md) / [score.md](docs/features/score.md) - 機能ごとの仕様
- [docs/plan.md](docs/plan.md) - PR の段階分割と進捗
- [docs/deploy.md](docs/deploy.md) - CI/CD の構成・必要な secret・未決事項
- [CLAUDE.md](CLAUDE.md) - このリポジトリで作業する際のローカルルール
