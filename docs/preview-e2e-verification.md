# Preview E2E の接続確認

PR #15 で導入した Preview 完了後の API 起動経路を、最新 main から確認するための一時的な文書です。
この検証用 PR はアプリのコードを変更せず、検証後はマージせずに閉じます。

- Preview deploy と PR head の一致。
- deploy 完了を受けた dispatcher からの GitHub API 起動。
- 公式 immutable Preview URL での Hosted E2E 完走と実行後の同一性照合。
- PR を閉じた後の Preview cleanup。
