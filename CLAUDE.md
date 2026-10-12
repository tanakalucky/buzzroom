# CLAUDE.md

このリポジトリで作業する Claude Code エージェント向けのローカルルール。

## 言語

ユーザーとのやり取り・コミットメッセージ・ドキュメントは日本語で書く。

## 仕様とドキュメント

- 機能の境界と要求仕様は [docs/requirements.md](docs/requirements.md) と `docs/features/*.md`(room・buzzer・score)が正本。実装前に該当する doc を確認する。
- 進め方の区切りと進捗は [docs/plan.md](docs/plan.md) を参照する。
- 挙動・仕様を変える変更は、同じ PR で対応する doc(`docs/requirements.md` / `docs/features/*.md` / `docs/plan.md`)も更新する。doc だけを直す変更(typo 修正等)はこの逆を要求しない。

## npm コマンド

`package.json` の `scripts` が正本。現時点(tooling 追加前)にあるもの:

| コマンド          | 用途                              |
| ----------------- | --------------------------------- |
| `npm run dev`     | ローカル開発サーバの起動          |
| `npm run build`   | Cloudflare Worker 向け build       |
| `npm run start`   | build 済み Worker のローカル preview |
| `npm run deploy`  | Cloudflare Worker への deploy       |

lint・format・typecheck・test 用のコマンドは tooling 導入後にここへ追記する。

## main・リリース

- `main` ブランチへの直接の変更はしない。変更は PR 経由で行う。
- このエージェントが PR の merge・deploy を実行することはない(承認・実行はユーザー/コーディネーターが行う)。

## レビューの前提

`/review` とそこから呼ばれる `review-correctness` / `review-design` / `review-tests` skill を使うレビューは、このリポジトリでは次を前提にする。

- `review-correctness`: 実装と `docs/requirements.md` / `docs/features/*.md` の内容が矛盾していないか、挙動・仕様を変えた変更で対応する doc の更新が漏れていないかを確認する。
- `review-design`: コードおよび doc の明確さ・構成の重複を確認する。
- doc のみの変更は、それだけを理由に対応するコードのテストを機械的に要求しない(doc とコードの不整合チェックは `review-correctness` が行う)。
