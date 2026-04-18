/**
 * Kaigi-Support-Chrome-Extension
 * content.js
 */

(function() {
    'use strict';

    console.log("[KSCE] Content script loaded.");

    let lastGeneratedAgenda = "";

    const ROLES = {
        "アイデア出し": "進行（発言を促す）、記録（可視化する）、時間（テンポを作る）",
        "意思決定": "決定者（最終決断を下す）、提案者（判断材料を提示）、異論役（リスクを指摘）",
        "情報共有・調整": "報告者（現状を伝える）、調整者（利害を整える）、アクション確認（タスク復唱）"
    };

    const ONE_ON_ONE_CATEGORIES = [
        "1. 信頼関係の構築（プライベート・相互理解）",
        "2. 心身のコンディション確認（メンタル・健康）",
        "3. 業務課題の解決・支援（障害の除去）",
        "4. 戦略・目標のすり合わせ（アライメント）",
        "5. フィードバック（評価と改善）",
        "6. 能力開発・育成（スキルアップ）",
        "7. キャリア・ビジョン（中長期の展望）"
    ];

    const THREE_PROMISES = `
--- 【会議を「価値ある時間」にするための3つの約束】 ---
• 資産にする： ホワイトボードはチームの財産。記録を残し、次のアクションを明確にする。
• 熱量を生む： PCを閉じ、相手の話を聴く。その集中が、議論の質とスピードを上げる。
• 存在を示す： 会議にいる以上、あなたは当事者。必ず発言し、結論に責任を持つ。`;

    async function generateAgenda(data) {
        return new Promise((resolve) => {
            setTimeout(() => {
                let agenda = "";
                if (data.type === "1on1") {
                    agenda = `【種類】1on1
【概要】${data.summary || "定期1on1対話"}

--- 1on1の7つの目的カテゴリー（本日話す項目を参加者と選択） ---
${ONE_ON_ONE_CATEGORIES.join('\n')}
`;
                } else {
                    const role = ROLES[data.type] || "";
                    agenda = `【種類】${data.type}
【概要】${data.summary}
【ゴール】${data.goal}
【資料URL】${data.url}
【議事録】${data.minutes} / ${data.location}

--- 代表的な役割 ---
${role}
${THREE_PROMISES}`;
                }
                resolve(agenda);
            }, 500);
        });
    }

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
                    <option value="1on1">1on1</option>
                </select>
            </div>
            <div class="ksce-field" id="ksce-summary-wrapper">
                <label class="ksce-label">概要</label>
                <input type="text" id="ksce-summary" class="ksce-input" placeholder="会議の簡単な背景">
            </div>
            <div class="ksce-field ksce-optional-field">
                <label class="ksce-label">ゴール</label>
                <input type="text" id="ksce-goal" class="ksce-input" placeholder="この会議の着地点">
            </div>
            <div class="ksce-field ksce-optional-field">
                <label class="ksce-label">資料URL</label>
                <input type="text" id="ksce-url" class="ksce-input" placeholder="参照資料のリンク">
            </div>
            <div class="ksce-field ksce-optional-field">
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

        const typeSelect = panel.querySelector('#ksce-type');
        const optionalFields = panel.querySelectorAll('.ksce-optional-field');

        typeSelect.addEventListener('change', () => {
            const is1on1 = typeSelect.value === '1on1';
            optionalFields.forEach(field => {
                field.style.display = is1on1 ? 'none' : 'block';
            });
        });

        panel.querySelector('#ksce-btn-generate').addEventListener('click', async (e) => {
            e.preventDefault();
            const data = {
                type: typeSelect.value,
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

    function findDescriptionField() {
        const selectors = [
            'div[aria-label*="説明"]',
            'div[aria-label*="Description"]',
            'div#T2Ybvb',
            'div[contenteditable="true"][role="textbox"]'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.getAttribute('contenteditable') === 'true' || el.querySelector('[contenteditable="true"]')) {
                    return el.hasAttribute('contenteditable') ? el : el.querySelector('[contenteditable="true"]');
                }
            }
        }
        return null;
    }

    function applyToDescription(text) {
        const target = findDescriptionField();

        if (target) {
            target.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
            target.dispatchEvent(new Event('input', { bubbles: true }));
            console.log("[KSCE] Applied agenda to description field.");
        } else {
            alert("説明フィールドが見つかりませんでした。Googleカレンダーの仕様変更の可能性があります。");
        }
    }

    function injectPanel() {
        if (document.getElementById('ksce-panel')) return;

        const descField = findDescriptionField();
        if (!descField) return;

        console.log("[KSCE] Found description field, attempting injection.");

        // 注入場所の決定
        // 説明フィールドのコンテナ（ツールバーやアイコンを含めた親要素）
        const wrapper = descField.closest('.p97G6c, .j0S6Zc, .X76S9d') || descField.parentElement;

        if (wrapper && wrapper.parentNode) {
            const panel = createPanel();
            if (panel) {
                console.log("[KSCE] Injecting panel before description wrapper.");
                wrapper.parentNode.insertBefore(panel, wrapper);
            }
        }
    }

    // 定期的なチェック（MutationObserverが反応しない場合へのバックアップ）
    setInterval(injectPanel, 3000);

    const observer = new MutationObserver((mutations) => {
        injectPanel();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log("[KSCE] Observer started.");
})();
