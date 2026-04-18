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
            }, 300);
        });
    }

    function createPanel(isPopupMode = false) {
        const panelId = isPopupMode ? 'ksce-panel-popup' : 'ksce-panel';
        if (document.getElementById(panelId)) return null;

        const panel = document.createElement('div');
        panel.id = panelId;
        panel.className = 'ksce-panel' + (isPopupMode ? ' ksce-popup-mode' : '');

        panel.innerHTML = `
            <div class="ksce-title">🗓 会議アジェンダ作成支援</div>
            <div class="ksce-field">
                <label class="ksce-label">種類</label>
                <select class="ksce-type ksce-select">
                    <option value="アイデア出し">アイデア出し</option>
                    <option value="意思決定">意思決定</option>
                    <option value="情報共有・調整">情報共有・調整</option>
                    <option value="1on1">1on1</option>
                </select>
            </div>
            <div class="ksce-field ksce-summary-wrapper">
                <label class="ksce-label">概要</label>
                <input type="text" class="ksce-summary ksce-input" placeholder="会議の簡単な背景">
            </div>
            <div class="ksce-field ksce-optional-field">
                <label class="ksce-label">ゴール</label>
                <input type="text" class="ksce-goal ksce-input" placeholder="この会議の着地点">
            </div>
            <div class="ksce-field ksce-optional-field">
                <label class="ksce-label">資料URL</label>
                <input type="text" class="ksce-url ksce-input" placeholder="参照資料のリンク">
            </div>
            <div class="ksce-field ksce-optional-field">
                <label class="ksce-label">議事録の要否</label>
                <div style="display: flex; gap: 8px;">
                    <select class="ksce-minutes-needed ksce-select" style="flex: 1;">
                        <option value="要">要</option>
                        <option value="不要">不要</option>
                    </select>
                    <input type="text" class="ksce-minutes-location ksce-input" style="flex: 2;" placeholder="記録場所">
                </div>
            </div>
            <div class="ksce-button-group">
                <button class="ksce-button ksce-btn-generate">文言生成</button>
                <button class="ksce-button ksce-btn-apply">反映</button>
            </div>
            <div class="ksce-preview ksce-preview-area"></div>
        `;

        const typeSelect = panel.querySelector('.ksce-type');
        const optionalFields = panel.querySelectorAll('.ksce-optional-field');

        typeSelect.addEventListener('change', () => {
            const is1on1 = typeSelect.value === '1on1';
            optionalFields.forEach(field => {
                field.style.display = is1on1 ? 'none' : 'block';
            });
        });

        panel.querySelector('.ksce-btn-generate').addEventListener('click', async (e) => {
            e.preventDefault();
            const data = {
                type: typeSelect.value,
                summary: panel.querySelector('.ksce-summary').value,
                goal: panel.querySelector('.ksce-goal').value,
                url: panel.querySelector('.ksce-url').value,
                minutes: panel.querySelector('.ksce-minutes-needed').value,
                location: panel.querySelector('.ksce-minutes-location').value
            };

            const btn = e.target;
            btn.textContent = "生成中...";
            btn.disabled = true;

            lastGeneratedAgenda = await generateAgenda(data);

            const preview = panel.querySelector('.ksce-preview');
            preview.textContent = lastGeneratedAgenda;
            preview.style.display = 'block';

            btn.textContent = "文言生成";
            btn.disabled = false;
        });

        panel.querySelector('.ksce-btn-apply').addEventListener('click', (e) => {
            e.preventDefault();
            if (!lastGeneratedAgenda) {
                alert("先に「文言生成」を行ってください。");
                return;
            }

            if (confirm("カレンダーの説明欄にアジェンダを反映しますか？\n（既存の内容は上書きされます）")) {
                applyToDescription(lastGeneratedAgenda);
            }
        });

        return panel;
    }

    function findDescriptionField() {
        const selectors = [
            'div[aria-label*="説明"]',
            'div[aria-label*="Description"]',
            'div[contenteditable="true"][role="textbox"]',
            'textarea[aria-label*="説明"]',
            'textarea[aria-label*="Description"]'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                // クイック作成画面の「説明を追加」というプレースホルダ的な要素も拾う必要がある
                if (el.offsetParent !== null) { // 可視状態
                    if (el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true') {
                        return el;
                    }
                    const editable = el.querySelector('[contenteditable="true"]');
                    if (editable) return editable;
                }
            }
        }
        return null;
    }

    function applyToDescription(text) {
        let target = findDescriptionField();

        if (!target) {
            // クイック作成画面でまだ「説明を追加」がクリックされていない場合、それを探してクリックを試みる
            const addDescriptionBtn = Array.from(document.querySelectorAll('div[role="button"]'))
                .find(el => el.textContent.includes("説明を追加") || el.textContent.includes("Add description"));

            if (addDescriptionBtn) {
                addDescriptionBtn.click();
                setTimeout(() => {
                    target = findDescriptionField();
                    if (target) doApply(target, text);
                }, 100);
            } else {
                alert("説明フィールドが見つかりませんでした。");
            }
        } else {
            doApply(target, text);
        }
    }

    function doApply(target, text) {
        target.focus();
        if (target.tagName === 'TEXTAREA') {
            target.value = text;
        } else {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        console.log("[KSCE] Applied agenda.");
    }

    function injectPanel() {
        // 1. フル編集画面のチェック
        injectToFullEdit();

        // 2. クイック作成画面（ポップアップ）のチェック
        injectToPopup();
    }

    function injectToFullEdit() {
        if (document.getElementById('ksce-panel')) return;

        const descField = findDescriptionField();
        if (!descField) return;

        // フル編集画面特有のコンテナを探す
        const wrapper = descField.closest('.p97G6c, .j0S6Zc, .X76S9d');
        if (wrapper && wrapper.parentNode) {
            // すでにポップアップモードのパネルがある場合は消す
            const oldPopup = document.getElementById('ksce-panel-popup');
            if (oldPopup) oldPopup.remove();

            const panel = createPanel(false);
            if (panel) {
                wrapper.parentNode.insertBefore(panel, wrapper);
                console.log("[KSCE] Injected into full edit screen.");
            }
        }
    }

    function injectToPopup() {
        // クイック作成ポップアップ（通常 role="dialog" または特定のクラス）
        const popup = document.querySelector('div[role="dialog"][aria-labelledby*="title"], .F26OHc, .K9vS1c');
        if (!popup) {
            const oldPopupPanel = document.getElementById('ksce-panel-popup');
            if (oldPopupPanel) oldPopupPanel.remove();
            return;
        }

        if (document.getElementById('ksce-panel-popup')) {
            repositionPopupPanel(popup);
            return;
        }

        // フル編集画面が背後にある可能性があるので、フル編集画面内への注入は避ける
        if (document.getElementById('ksce-panel')) return;

        const panel = createPanel(true);
        if (panel) {
            document.body.appendChild(panel);
            repositionPopupPanel(popup);
            console.log("[KSCE] Injected beside popup.");
        }
    }

    function repositionPopupPanel(popup) {
        const panel = document.getElementById('ksce-panel-popup');
        if (!panel) return;

        const rect = popup.getBoundingClientRect();
        panel.style.top = rect.top + 'px';
        panel.style.left = (rect.right + 10) + 'px';

        // 画面外にはみ出す場合の調整
        if (rect.right + 10 + 320 > window.innerWidth) {
            panel.style.left = (rect.left - 330) + 'px';
        }
    }

    setInterval(injectPanel, 1000);

    const observer = new MutationObserver(injectPanel);
    observer.observe(document.body, { childList: true, subtree: true });

})();
