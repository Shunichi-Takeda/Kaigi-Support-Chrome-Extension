/**
 * Kaigi-Support-Chrome-Extension
 * content.js
 */

(function() {
    'use strict';

    let lastGeneratedAgenda = "";

    // 会議の種類に応じた役割の定義
    const ROLES = {
        "アイデア出し": "進行（発言を促す）、記録（可視化する）、時間（テンポを作る）",
        "意思決定": "決定者（最終決断を下す）、提案者（判断材料を提示）、異論役（リスクを指摘）",
        "情報共有・調整": "報告者（現状を伝える）、調整者（利害を整える）、アクション確認（タスク復唱）"
    };

    /**
     * アジェンダを生成する（プレースホルダ）
     */
    async function generateAgenda(data) {
        // 将来的なAPI連携を見据えた非同期処理の構造
        return new Promise((resolve) => {
            setTimeout(() => {
                const role = ROLES[data.type] || "";
                const agenda = `【種類】${data.type}
【概要】${data.summary}
【ゴール】${data.goal}
【資料URL】${data.url}
【議事録】${data.minutes} / ${data.location}

--- 代表的な役割 ---
${role}`;
                resolve(agenda);
            }, 500);
        });
    }

    /**
     * UIパネルを作成
     */
    function createPanel() {
        if (document.getElementById('ksce-panel')) return null;

        const panel = document.createElement('div');
        panel.id = 'ksce-panel';
        panel.className = 'ksce-panel';

        panel.innerHTML = `
            <div class="ksce-title">🗓 会議アジェンダ作成支援</div>
            <div class="ksce-field">
                <label class="ksce-label">種類</label>
                <select id="ksce-type" class="ksce-select">
                    <option value="アイデア出し">アイデア出し</option>
                    <option value="意思決定">意思決定</option>
                    <option value="情報共有・調整">情報共有・調整</option>
                </select>
            </div>
            <div class="ksce-field">
                <label class="ksce-label">概要</label>
                <input type="text" id="ksce-summary" class="ksce-input" placeholder="会議の簡単な背景">
            </div>
            <div class="ksce-field">
                <label class="ksce-label">ゴール</label>
                <input type="text" id="ksce-goal" class="ksce-input" placeholder="この会議の着地点">
            </div>
            <div class="ksce-field">
                <label class="ksce-label">資料URL</label>
                <input type="text" id="ksce-url" class="ksce-input" placeholder="参照資料のリンク">
            </div>
            <div class="ksce-field">
                <label class="ksce-label">議事録の要否</label>
                <div style="display: flex; gap: 8px;">
                    <select id="ksce-minutes-needed" class="ksce-select" style="flex: 1;">
                        <option value="要">要</option>
                        <option value="不要">不要</option>
                    </select>
                    <input type="text" id="ksce-minutes-location" class="ksce-input" style="flex: 2;" placeholder="記録場所">
                </div>
            </div>
            <div class="ksce-button-group">
                <button id="ksce-btn-generate" class="ksce-button ksce-btn-generate">文言生成</button>
                <button id="ksce-btn-apply" class="ksce-button ksce-btn-apply">反映</button>
            </div>
            <div id="ksce-preview" class="ksce-preview-area"></div>
        `;

        // イベントリスナーの追加
        panel.querySelector('#ksce-btn-generate').addEventListener('click', async (e) => {
            e.preventDefault();
            const data = {
                type: panel.querySelector('#ksce-type').value,
                summary: panel.querySelector('#ksce-summary').value,
                goal: panel.querySelector('#ksce-goal').value,
                url: panel.querySelector('#ksce-url').value,
                minutes: panel.querySelector('#ksce-minutes-needed').value,
                location: panel.querySelector('#ksce-minutes-location').value
            };

            const btn = e.target;
            btn.textContent = "生成中...";
            btn.disabled = true;

            lastGeneratedAgenda = await generateAgenda(data);

            const preview = panel.querySelector('#ksce-preview');
            preview.textContent = lastGeneratedAgenda;
            preview.style.display = 'block';

            btn.textContent = "文言生成";
            btn.disabled = false;
        });

        panel.querySelector('#ksce-btn-apply').addEventListener('click', (e) => {
            e.preventDefault();
            if (!lastGeneratedAgenda) {
                alert("先に「文言生成」を行ってください。");
                return;
            }

            if (confirm("カレンダーの説明欄を上書きしますか？")) {
                applyToDescription(lastGeneratedAgenda);
            }
        });

        return panel;
    }

    /**
     * カレンダーの説明欄に反映する
     */
    function applyToDescription(text) {
        // Googleカレンダーの説明欄（contenteditableのdiv）を探す
        // 複数の場所（簡易ポップアップ、詳細編集画面）に対応
        const selectors = [
            'div[aria-label="説明を追加"]',
            'div[aria-label="説明"]',
            'div#T2Ybvb', // 特定のID (変動の可能性あり)
            '.X76S9d div[contenteditable="true"]'
        ];

        let target = null;
        for (const selector of selectors) {
            target = document.querySelector(selector);
            if (target) break;
        }

        if (target) {
            target.focus();
            // contenteditableへの挿入
            // 単純に innerText を変えるだけでは React などの状態が更新されない場合があるため
            // execCommand を使用（非推奨だが多くのブラウザで動作し、UIの整合性を保ちやすい）
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
            console.log("Agenda applied to description field.");
        } else {
            alert("説明フィールドが見つかりませんでした。詳細画面を開いているか確認してください。");
        }
    }

    /**
     * DOMの変更を監視してパネルを注入する
     */
    const observer = new MutationObserver((mutations) => {
        // 説明フィールドの親要素や、特定のダイアログが表示されたかを確認
        // Google Calendarのクラス名は難読化されているため、aria-labelや構造を頼りにする

        // 「説明を追加」のプレースホルダやアイコンがある付近を探す
        const descContainers = document.querySelectorAll('.Yv9pS, .X76S9d, .RDv3Ec');

        descContainers.forEach(container => {
            if (container.querySelector('#ksce-panel')) return;

            // 適切な挿入位置を探す（説明欄の上）
            const panel = createPanel();
            if (panel) {
                container.prepend(panel);
            }
        });
    });

    // 監視開始
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log("Kaigi-Support-Chrome-Extension loaded.");
})();
