"use client";
import { useRef } from "react";
import "./sound-credit.css";

export function SoundCredit() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <div className="sound-credit-footer" aria-label="効果音クレジット">
        <div className="sound-credit">
          <span className="sound-credit-icon" aria-hidden="true">
            ♫
          </span>
          <span>
            効果音：
            <a href="https://otologic.jp/" target="_blank" rel="noopener noreferrer">
              OtoLogic
            </a>
          </span>
          <span className="sound-credit-divider" aria-hidden="true">
            /
          </span>
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.ja"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY 4.0
          </a>
          <button
            ref={trigger}
            className="sound-credit-details"
            aria-haspopup="dialog"
            onClick={() => {
              if (!dialog.current?.open) dialog.current?.showModal();
            }}
          >
            詳細 <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="sound-credit-dialog"
        aria-labelledby="sound-credit-title"
        aria-describedby="sound-credit-description"
        onClose={() => trigger.current?.focus()}
      >
        <div className="sound-credit-dialog-top">
          <span className="sound-credit-eyebrow">SOUND CREDITS</span>
          <button aria-label="クレジットを閉じる" autoFocus onClick={() => dialog.current?.close()}>
            ×
          </button>
        </div>
        <h2 id="sound-credit-title">効果音について</h2>
        <p id="sound-credit-description" className="sound-credit-lead">
          Buzzroomで使用している効果音です。外部リンクは新しいタブで開きます。
        </p>
        <div className="sound-credit-provider">
          <span className="sound-credit-provider-icon" aria-hidden="true">
            ♫
          </span>
          <div>
            <p>効果音</p>
            <a href="https://otologic.jp/" target="_blank" rel="noopener noreferrer">
              OtoLogic ↗
            </a>
          </div>
          <a
            className="sound-credit-license"
            href="https://creativecommons.org/licenses/by/4.0/deed.ja"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY 4.0 ↗
          </a>
        </div>
        <h3>使用している音素材</h3>
        <ul className="sound-credit-materials">
          <li>
            <span aria-hidden="true">ϟ</span>
            <div>
              <small>早押し</small>
              <strong>クイズ ボタン02-1（マルチ）</strong>
            </div>
          </li>
          <li>
            <span aria-hidden="true">○</span>
            <div>
              <small>正解</small>
              <strong>クイズ ピンポン02-1（速）</strong>
            </div>
          </li>
          <li>
            <span aria-hidden="true">×</span>
            <div>
              <small>不正解</small>
              <strong>クイズ ブザー02-1（中）</strong>
            </div>
          </li>
        </ul>
        <p className="sound-credit-source">
          <a
            href="https://otologic.jp/free/se/quiz01.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            配布元のクイズ効果音を見る ↗
          </a>
        </p>
        <p className="sound-credit-changes">
          音源ファイルは未改変です。編集・加工は行っていません。
        </p>
        <div className="sound-credit-links">
          <a href="https://otologic.jp/free/license.html" target="_blank" rel="noopener noreferrer">
            OtoLogic 利用規約 ↗
          </a>
          <a href="https://otologic.jp/free/faq.html" target="_blank" rel="noopener noreferrer">
            クレジット表記のFAQ ↗
          </a>
        </div>
        <button className="sound-credit-close" onClick={() => dialog.current?.close()}>
          ルームに戻る
        </button>
      </dialog>
    </>
  );
}
