/**
 * Kaigi-Support-Chrome-Extension
 * content.js
 */

(function() {
    'use strict';

    console.log("[KSCE] Content script loaded v1.3.0");

    const PREFIX_OPTIONS = ["", "内", "外", "Zoom", "Meet", "来", "移動", "確保", "飲"];

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

    const THREE_PROMISES = [
        "• 資産にする： ホワイトボードはチームの財産。記録を残し、次のアクションを明確にする。",
        "• 熱量を生む： PCを閉じ、相手の話を聴く。その集中が、議論の質とスピードを上げる。",
        "• 存在を示す： 会議にいる以上、あなたは当事者。必ず発言し、結論に責任を持つ。"
    ];

    // Gemini Nano Wrapper
    async function getAIResult(prompt) {
        if (!window.ai || !window.ai.languageModel) {
            console.warn("[KSCE] window.ai not found. Fallback to basic template.");
            return null;
        }
        try {
            const capabilities = await window.ai.languageModel.capabilities();
            if (capabilities.available === 'no') return null;

            const session = await window.ai.languageModel.create();
            const result = await session.prompt(prompt);
            session.destroy();
            return result;
        } catch (e) {
            console.error("[KSCE] AI Error:", e);
            return null;
        }
    }

    function injectPrefixDropdown(container) {
        if (container.querySelector('.ksce-prefix-wrapper')) return;

        const titleInput = container.querySelector('input[jsname="YPqjbf"][aria-label*="タイトル"], input[aria-label*="Title"]');
        if (!titleInput) {
            console.debug("[KSCE] Title input not found for prefix injection.");
            return;
        }

        const wrapper = titleInput.closest('div');
        if (!wrapper) return;

        const prefixDiv = document.createElement('div');
        prefixDiv.className = 'ksce-prefix-wrapper';

        const select = document.createElement('select');
        select.className = 'ksce-prefix-select';
        PREFIX_OPTIONS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt ? `【${opt}】` : "";
            option.textContent = opt || "（空白）";
            select.appendChild(option);
        });

        prefixDiv.appendChild(select);

        // Ensure wrapper layout
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'row';
        wrapper.style.alignItems = 'center';

        wrapper.insertBefore(prefixDiv, wrapper.firstChild);
        console.log("[KSCE] Injected prefix dropdown.");

        // 保存ボタンを監視
        const saveBtn = container.querySelector('[jsname="x8hlje"], #xSaveBu, button[aria-label*="保存"], button[aria-label*="Save"]');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const prefix = select.value;
                if (prefix && !titleInput.value.startsWith(prefix)) {
                    titleInput.value = prefix + titleInput.value;
                    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, { capture: true });
        }
    }

    function injectAgendaFields(container) {
        if (container.querySelector('.ksce-integrated-fields')) return;

        // 挿入ポイントを探す
        const descSection = container.querySelector('.NRbSk, .tdXRXb, #xDescIn');
        if (!descSection) {
            console.debug("[KSCE] Description section not found for agenda fields injection.");
            return;
        }

        // descSection のある程度の高さの親を探す
        const insertionPoint = descSection.closest('.Shmoqf, .FrSOzf, .desc-section') || descSection.parentElement;

        const fieldsDiv = document.createElement('div');
        fieldsDiv.className = 'ksce-integrated-fields';
        fieldsDiv.innerHTML = `
            <div class="ksce-field-row">
                <label class="ksce-compact-label">種類</label>
                <select class="ksce-type ksce-select">
                    <option value="アイデア出し">アイデア出し</option>
                    <option value="意思決定">意思決定</option>
                    <option value="情報共有・調整">情報共有・調整</option>
                    <option value="1on1">1on1</option>
                </select>
            </div>
            <div class="ksce-field-row">
                <label class="ksce-compact-label">やりたいこと</label>
                <input type="text" class="ksce-task ksce-input" placeholder="この会議で何を行いたいか">
            </div>
            <div class="ksce-field-row">
                <label class="ksce-compact-label">ゴール (自動生成可)</label>
                <input type="text" class="ksce-goal ksce-input" placeholder="AI生成または直接入力">
            </div>
            <div class="ksce-field-row ksce-optional">
                <label class="ksce-compact-label">資料URL</label>
                <input type="text" class="ksce-url ksce-input" placeholder="URL">
            </div>
            <div class="ksce-action-row">
                <button class="ksce-btn-small ksce-gen-btn">文言生成 (AI)</button>
                <button class="ksce-btn-small ksce-apply-btn">説明欄へ反映</button>
            </div>
        `;

        insertionPoint.parentElement.insertBefore(fieldsDiv, insertionPoint);
        console.log("[KSCE] Injected agenda fields.");

        const typeSelect = fieldsDiv.querySelector('.ksce-type');
        const taskInput = fieldsDiv.querySelector('.ksce-task');
        const goalInput = fieldsDiv.querySelector('.ksce-goal');
        const urlInput = fieldsDiv.querySelector('.ksce-url');

        // 文言生成ボタン
        fieldsDiv.querySelector('.ksce-gen-btn').addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const titleInput = container.querySelector('input[jsname="YPqjbf"][aria-label*="タイトル"], input[aria-label*="Title"]');
            const title = titleInput?.value || "";
            const task = taskInput.value;
            const type = typeSelect.value;

            if (!task) {
                alert("「何を行いたいか」を入力してください。");
                return;
            }

            const btn = e.target;
            btn.textContent = "生成中...";
            btn.disabled = true;

            const prompt = `あなたは会議のファシリテーターです。
タイトル: ${title}
やりたいこと: ${task}
会議の種類: ${type}

上記の内容から、この会議の具体的な「ゴール（着地点）」を1文で作成してください。
また、会議の「アジェンダ（構成）」を簡潔に箇条書きで作成してください。
回答は「ゴール：〜〜〜\nアジェンダ（構成）：\n・〜〜〜」の形式にしてください。`;

            let aiText = await getAIResult(prompt);

            if (!aiText) {
                aiText = `ゴール：${task}の完了\nアジェンダ：\n・現状の共有\n・${task}に関する議論\n・ネクストアクションの確認`;
            }

            const goalMatch = aiText.match(/ゴール：(.*)/);
            if (goalMatch) goalInput.value = goalMatch[1].trim();

            let finalAgenda = `【種類】${type}\n【何を行いたいか】${task}\n` + aiText;
            if (urlInput.value) finalAgenda += `\n【資料URL】${urlInput.value}`;

            if (type === "1on1") {
                finalAgenda += `\n\n--- 1on1の7つの目的カテゴリー ---\n${ONE_ON_ONE_CATEGORIES.join('\n')}`;
            } else {
                const role = ROLES[type] || "";
                finalAgenda += `\n\n--- 代表的な役割 ---\n${role}`;
                finalAgenda += `\n\n--- 会議を「価値ある時間」にするための3つの約束 ---\n${THREE_PROMISES.join('\n')}`;
            }

            window.ksceLastGenerated = finalAgenda;
            alert("文言を生成しました。「反映」ボタンで説明欄に記入できます。");

            btn.textContent = "文言生成 (AI)";
            btn.disabled = false;
        });

        // 反映ボタン
        fieldsDiv.querySelector('.ksce-apply-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!window.ksceLastGenerated) {
                alert("先に「文言生成」を行ってください。");
                return;
            }
            applyToDescription(window.ksceLastGenerated);
        });
    }

    function findDescriptionField() {
        const idField = document.querySelector('#xDescIn [contenteditable="true"], #xDesc [contenteditable="true"]');
        if (idField) return idField;

        const selectors = [
            'div[aria-label="説明"]',
            'div[aria-label="説明を追加"]',
            'div[aria-label*="Description"]',
            'div[contenteditable="true"][role="textbox"]'
        ];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.offsetParent !== null) return el;
            }
        }
        return null;
    }

    function applyToDescription(text) {
        let target = findDescriptionField();
        if (!target) {
            const addDescriptionBtn = Array.from(document.querySelectorAll('span, div, button, [data-key="description"]'))
                .find(el => {
                    const txt = el.textContent || "";
                    return ((txt.includes("説明") && txt.includes("追加")) ||
                            (txt.includes("Add") && txt.includes("description")) ||
                            (el.getAttribute('data-key') === 'description')) &&
                           (el.getAttribute('role') === 'button' || el.closest('[role="button"]'));
                });

            if (addDescriptionBtn) {
                const clickTarget = addDescriptionBtn.getAttribute('role') === 'button' ? addDescriptionBtn : addDescriptionBtn.closest('[role="button"]');
                clickTarget.click();
                setTimeout(() => {
                    const t = findDescriptionField();
                    if (t) doApply(t, text);
                }, 300);
            } else {
                alert("説明フィールドが見つかりませんでした。");
            }
        } else {
            doApply(target, text);
        }
    }

    function doApply(target, text) {
        target.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function injectPanel() {
        const fullEdit = document.querySelector('div[jsname="nB7Rvb"]');
        const popup = document.querySelector('div[jsname="ssXDle"]');
        const container = fullEdit || popup;

        if (!container) {
            return;
        }

        injectPrefixDropdown(container);
        injectAgendaFields(container);
    }

    setInterval(injectPanel, 1000);
    const observer = new MutationObserver(injectPanel);
    observer.observe(document.body, { childList: true, subtree: true });

})();
