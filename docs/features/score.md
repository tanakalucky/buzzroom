# score

正解数・誤答数の採点に関する機能仕様。

## カウンタ

- 参加者ごとに correctcount(正解数)と wrongcount(誤答数)を持つ。
- [features/buzzer.md](buzzer.md) の正解・誤答判定に応じて自動で加算される。
- ラウンドが切り替わっても(自動開始・手動リセットのいずれでも)カウンタの値は保持される。

## 手動編集

- host(quizmaster)は、参加者の correctcount・wrongcount を手動で編集できる。

## 表示

- 参加者ごとの correctcount・wrongcount は参加者全員に表示される。

## 再接続

- 同じブラウザからの再接続では、その参加者の correctcount・wrongcount が復元される。
