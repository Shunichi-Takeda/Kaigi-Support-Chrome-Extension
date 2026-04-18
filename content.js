/**
 * Kaigi-Support-Chrome-Extension
 * content.js — v1.0.0
 */

(function() {
    'use strict';

    console.log("[KSCE] Content script loaded v1.0.0");

    const PREFIX_OPTIONS = ["", "内", "外", "Zoom", "Meet", "来", "移動", "確保", "飲"];

    const REFINED_ROLES = {
        "アイデア出し": [
            { "role": "引き出し役", "desc": "意見を促し発言を引き出す" },
            { "role": "板書き役", "desc": "発言を書き出し可視化する" },
            { "role": "かき回し役", "desc": "違う視点で思考を広げる" },
            { "role": "発案者", "desc": "質より量でアイデアを出す" }
        ],
        "意思決定": [
            { "role": "説明役", "desc": "判断に必要な情報を伝える" },
            { "role": "裁定役", "desc": "最後に決断し責任を持つ" },
            { "role": "苦言役", "desc": "懸念点やリスクを指摘する" },
            { "role": "納得者", "desc": "決定に不明点がないか確認" }
        ],
        "情報共有・調整": [
            { "role": "仕切り役", "desc": "脱線を防ぎ進行を整える" },
            { "role": "相談役", "desc": "課題や困りごとを共有する" },
            { "role": "念押し役", "desc": "次の行動と期限を固める" },
            { "role": "実践者", "desc": "共有内容を自業務で実行する" }
        ]
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

    const GEMINI_ICON_SVG = `<svg class="ksce-gemini-icon" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C14 7.732 7.732 14 0 14c7.732 0 14 6.268 14 14 0-7.732 6.268-14 14-14C20.268 14 14 7.732 14 0z"/>
    </svg>`;

    // ===== Global state =====
    let isGenerating = false;
    let aiAvailable = null; // null = unchecked, true/false
    const panelState = {
        type: 'アイデア出し',
        place: '',
        duration: '30',
        task: '',
        goal: '',
        url: '',
        collapsed: false
    };

    /**
     * Shield element from Google Calendar's event handling (bubble phase).
     */
    function shield(el) {
        ['mousedown', 'pointerdown', 'click', 'focusin', 'focusout'].forEach(evtName => {
            el.addEventListener(evtName, (e) => e.stopPropagation());
        });
    }

    // ===== AI Communication via Background Service Worker =====
    // background.js handles LanguageModel (v145+) / window.ai fallback.
    // All AI operations go through chrome.runtime.sendMessage.

    function checkAIAvailability() {
        if (aiAvailable !== null) return Promise.resolve(aiAvailable);
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'checkAI' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("[KSCE] AI check error:", chrome.runtime.lastError.message);
                    aiAvailable = false;
                    resolve(false);
                    return;
                }
                aiAvailable = response && response.available;
                console.log("[KSCE] AI available:", aiAvailable, response?.status || '', response?.api || '');
                resolve(aiAvailable);
            });
        });
    }

    async function getAIResult(prompt) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'aiPrompt', prompt }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("[KSCE] AI prompt error:", chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                if (response?.error) {
                    console.warn("[KSCE] AI returned error:", response.error);
                }
                resolve(response?.result || null);
            });
        });
    }

    /**
     * Sanitize AI output: remove/replace problematic Unicode characters
     * that cause garbled display (���) in Google Calendar's contentEditable.
     */
    function sanitizeAIText(text) {
        if (!text) return text;
        return text
            // Remove surrogate pairs (emoji etc.)
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
            // Remove replacement characters
            .replace(/\uFFFD/g, '')
            // Remove zero-width chars
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            // Replace various bullet/dash chars with standard ones
            .replace(/[▸▹►▻◦◆◇⁃⏺]/g, '・')
            .replace(/[–—―⸺⸻]/g, 'ー')
            // Replace tab indentation with spaces
            .replace(/\t/g, '  ')
            // Remove other control chars (except newline/carriage return)
            .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    // ===== Save & Close Button Hook (reset panel) =====
    let saveHookInstalled = false;
    function installSaveHook() {
        if (saveHookInstalled) return;
        saveHookInstalled = true;

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const text = btn.textContent.trim();
            const ariaLabel = (btn.getAttribute('aria-label') || '').trim();
            const isSave = text === '保存' || text === 'Save' || btn.id === 'xSaveBu';
            const isClose = ariaLabel === '閉じる' || ariaLabel === 'Close' || text === '×';
            if (!isSave && !isClose) return;

            const container = document.querySelector('div[jsname="nB7Rvb"]') || document.querySelector('div[jsname="ssXDle"]');
            if (!container) return;

            resetPanelState();
            const panel = container.querySelector('.ksce-gen-panel');
            if (panel) resetPanelForm(panel);
        }, true);
    }
    installSaveHook();

    function resetPanelState() {
        panelState.type = 'アイデア出し';
        panelState.place = '';
        panelState.duration = '30';
        panelState.task = '';
        panelState.goal = '';
        panelState.url = '';
        panelState.collapsed = false;
    }

    function resetPanelForm(panel) {
        const els = {
            type: panel.querySelector('.ksce-type'),
            place: panel.querySelector('.ksce-place'),
            duration: panel.querySelector('.ksce-duration'),
            task: panel.querySelector('.ksce-task'),
            goal: panel.querySelector('.ksce-goal'),
            url: panel.querySelector('.ksce-url')
        };
        if (els.type) els.type.value = 'アイデア出し';
        if (els.place) els.place.value = '';
        if (els.duration) els.duration.value = '30';
        if (els.task) els.task.value = '';
        if (els.goal) els.goal.value = '';
        if (els.url) els.url.value = '';
        panel.classList.remove('collapsed');
        const status = panel.querySelector('.ksce-gen-status');
        if (status) status.remove();
    }

    // ===== Generation Panel =====
    function injectGenPanel(container) {
        if (container.querySelector('.ksce-gen-panel')) return;
        const titleInput = container.querySelector('input[jsname="YPqjbf"][aria-label*="タイトル"], input[aria-label*="Title"]');
        if (!titleInput) return;

        const isFullEditor = !!container.querySelector('div[jsname="nB7Rvb"]') || container.matches('div[jsname="nB7Rvb"]');
        const panel = buildGenPanel(container);

        if (isFullEditor) {
            // Full editor: insert before the title container (DgKtsd) inside scrollable area
            const titleContainer = container.querySelector('div.DgKtsd');
            const scrollArea = container.querySelector('div[jsname="fxaXHe"]');
            if (titleContainer && titleContainer.parentElement) {
                titleContainer.parentElement.insertBefore(panel, titleContainer);
            } else if (scrollArea) {
                scrollArea.prepend(panel);
            } else {
                // fallback
                let titleRow = titleInput;
                for (let i = 0; i < 5; i++) {
                    if (!titleRow.parentElement) break;
                    titleRow = titleRow.parentElement;
                    if (titleRow.parentElement === container) break;
                }
                titleRow.parentElement.insertBefore(panel, titleRow);
            }
            panel.classList.add('ksce-gen-panel-full');
        } else {
            // Popup: insert before title row (existing behavior)
            let titleRow = titleInput;
            for (let i = 0; i < 5; i++) {
                if (!titleRow.parentElement) break;
                titleRow = titleRow.parentElement;
                if (titleRow.parentElement === container) break;
            }
            titleRow.parentElement.insertBefore(panel, titleRow);
        }
    }

    function buildGenPanel(container) {
        const panel = document.createElement('div');
        panel.className = 'ksce-gen-panel';

        // ===== HEADER =====
        const header = document.createElement('div');
        header.className = 'ksce-gen-panel-header';
        header.style.position = 'relative';

        const toggleArea = document.createElement('div');
        toggleArea.className = 'ksce-gen-panel-toggle';
        toggleArea.style.cursor = 'pointer';
        toggleArea.style.display = 'flex';
        toggleArea.style.alignItems = 'center';
        toggleArea.style.gap = '8px';
        toggleArea.style.padding = '8px 48px 8px 12px';

        const chevron = document.createElement('span');
        chevron.className = 'ksce-gen-panel-chevron';
        chevron.textContent = '▼';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'ksce-gen-panel-title';
        titleSpan.textContent = 'AIアジェンダ生成';

        toggleArea.appendChild(chevron);
        toggleArea.appendChild(titleSpan);
        shield(toggleArea);

        toggleArea.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            panel.classList.toggle('collapsed');
            panelState.collapsed = panel.classList.contains('collapsed');
        });

        // Gemini AI button
        const geminiBtn = document.createElement('button');
        geminiBtn.className = 'ksce-gemini-btn';
        geminiBtn.title = 'AIでタイトル・アジェンダを生成';
        geminiBtn.innerHTML = GEMINI_ICON_SVG;
        geminiBtn.type = 'button';
        geminiBtn.style.position = 'absolute';
        geminiBtn.style.right = '8px';
        geminiBtn.style.top = '50%';
        geminiBtn.style.transform = 'translateY(-50%)';
        geminiBtn.style.zIndex = '10';
        shield(geminiBtn);

        header.appendChild(toggleArea);
        header.appendChild(geminiBtn);

        // ===== BODY (built with DOM API — no innerHTML, for Trusted Types) =====
        const body = document.createElement('div');
        body.className = 'ksce-gen-panel-body';

        // --- Row 1: 場所 + 会議の種類 + 時間 (3列) ---
        const row1 = document.createElement('div');
        row1.className = 'ksce-field-row ksce-row-triple';

        const colPlace = document.createElement('div');
        colPlace.className = 'ksce-field-col';
        const labelPlace = document.createElement('label');
        labelPlace.className = 'ksce-compact-label';
        labelPlace.textContent = '場所';
        const selectPlace = document.createElement('select');
        selectPlace.className = 'ksce-place ksce-select';
        PREFIX_OPTIONS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt ? opt + '）' : '';
            option.textContent = opt || '';
            selectPlace.appendChild(option);
        });
        colPlace.appendChild(labelPlace);
        colPlace.appendChild(selectPlace);

        const colType = document.createElement('div');
        colType.className = 'ksce-field-col';
        const labelType = document.createElement('label');
        labelType.className = 'ksce-compact-label';
        labelType.textContent = '会議の種類';
        const selectType = document.createElement('select');
        selectType.className = 'ksce-type ksce-select';
        ['アイデア出し', '意思決定', '情報共有・調整', '1on1', '自由記入'].forEach(v => {
            const option = document.createElement('option');
            option.value = v;
            option.textContent = v;
            selectType.appendChild(option);
        });
        colType.appendChild(labelType);
        colType.appendChild(selectType);

        const colDur = document.createElement('div');
        colDur.className = 'ksce-field-col ksce-field-col-narrow';
        const labelDur = document.createElement('label');
        labelDur.className = 'ksce-compact-label';
        labelDur.textContent = '時間';
        const selectDur = document.createElement('select');
        selectDur.className = 'ksce-duration ksce-select';
        for (let m = 15; m <= 240; m += 15) {
            const option = document.createElement('option');
            option.value = String(m);
            option.textContent = m + '分';
            if (m === 30) option.selected = true;
            selectDur.appendChild(option);
        }
        colDur.appendChild(labelDur);
        colDur.appendChild(selectDur);

        row1.appendChild(colPlace);
        row1.appendChild(colType);
        row1.appendChild(colDur);
        body.appendChild(row1);

        // --- Row 2: やりたいこと ---
        const row2 = document.createElement('div');
        row2.className = 'ksce-field-row';
        const labelTask = document.createElement('label');
        labelTask.className = 'ksce-compact-label';
        labelTask.textContent = 'やりたいこと';
        const inputTask = document.createElement('textarea');
        inputTask.className = 'ksce-task ksce-textarea';
        inputTask.rows = 2;
        inputTask.placeholder = 'この会議で何を行いたいか';
        row2.appendChild(labelTask);
        row2.appendChild(inputTask);
        body.appendChild(row2);

        // --- Row 3: ゴール ---
        const row3 = document.createElement('div');
        row3.className = 'ksce-field-row';
        const labelGoal = document.createElement('label');
        labelGoal.className = 'ksce-compact-label';
        labelGoal.textContent = 'ゴール (自動生成可)';
        const inputGoal = document.createElement('textarea');
        inputGoal.className = 'ksce-goal ksce-textarea';
        inputGoal.rows = 2;
        inputGoal.placeholder = 'AI生成または直接入力';
        row3.appendChild(labelGoal);
        row3.appendChild(inputGoal);
        body.appendChild(row3);

        // --- Row 4: 資料URL ---
        const row4 = document.createElement('div');
        row4.className = 'ksce-field-row';
        const labelUrl = document.createElement('label');
        labelUrl.className = 'ksce-compact-label';
        labelUrl.textContent = '資料URL';
        const inputUrl = document.createElement('input');
        inputUrl.type = 'text';
        inputUrl.className = 'ksce-url ksce-input';
        inputUrl.placeholder = 'URL';
        row4.appendChild(labelUrl);
        row4.appendChild(inputUrl);
        body.appendChild(row4);

        // --- AI Notice area ---
        const aiNotice = document.createElement('div');
        aiNotice.className = 'ksce-ai-notice';
        aiNotice.style.display = 'none';
        body.appendChild(aiNotice);

        shield(body);
        body.querySelectorAll('select, input, textarea').forEach(el => shield(el));

        panel.appendChild(header);
        panel.appendChild(body);

        // Save state on input changes
        body.addEventListener('input', () => saveFormState(panel));
        body.addEventListener('change', () => saveFormState(panel));
        restoreFormState(panel);

        // ===== AI Status Check =====
        checkAIAvailability().then(available => {
            if (!available) {
                geminiBtn.disabled = true;
                geminiBtn.classList.add('disabled');
                geminiBtn.title = 'AI機能が利用できません。chrome://flagsの設定が必要です。';
                aiNotice.style.display = 'block';

                // Build warning with DOM API
                const warning = document.createElement('div');
                warning.className = 'ksce-ai-warning';

                const p1 = document.createElement('p');
                const strong1 = document.createElement('strong');
                strong1.textContent = '⚠ AI機能を利用するには、以下のChrome Flagsを有効にしてください：';
                p1.appendChild(strong1);
                warning.appendChild(p1);

                const ol = document.createElement('ol');
                const flags = [
                    { url: 'chrome://flags/#optimization-guide-on-device-model', name: 'Enables optimization guide on device' },
                    { url: 'chrome://flags/#prompt-api-for-gemini-nano', name: 'Prompt API for Gemini Nano' }
                ];
                flags.forEach(flag => {
                    const li = document.createElement('li');
                    const link = document.createElement('a');
                    link.className = 'ksce-flag-link';
                    link.textContent = flag.url;
                    link.href = '#';
                    link.style.cursor = 'pointer';
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        chrome.runtime.sendMessage({ action: 'openTab', url: flag.url });
                    });
                    shield(link);
                    li.appendChild(link);
                    li.appendChild(document.createElement('br'));
                    const arrow = document.createTextNode('→ ');
                    li.appendChild(arrow);
                    const s = document.createElement('strong');
                    s.textContent = flag.name;
                    li.appendChild(s);
                    li.appendChild(document.createTextNode(' を Enabled に設定'));
                    ol.appendChild(li);
                });
                warning.appendChild(ol);

                const p2 = document.createElement('p');
                p2.textContent = '設定後、Chromeを再起動してください。';
                warning.appendChild(p2);

                aiNotice.appendChild(warning);
                shield(aiNotice);
            }
        });

        // ===== GEMINI BUTTON HANDLER =====
        const typeSelect = body.querySelector('.ksce-type');
        const placeSelect = body.querySelector('.ksce-place');
        const taskInput = body.querySelector('.ksce-task');
        const goalInput = body.querySelector('.ksce-goal');
        const urlInput = body.querySelector('.ksce-url');
        const durationSelect = body.querySelector('.ksce-duration');

        // ===== Type change: toggle field availability =====
        function updateFieldsByType(selectedType) {
            if (selectedType === '1on1') {
                taskInput.disabled = true;
                taskInput.value = '';
                taskInput.placeholder = '（1on1は固定テンプレート）';
                goalInput.disabled = true;
                goalInput.value = '';
                goalInput.placeholder = '（1on1では省略）';
                urlInput.disabled = true;
                urlInput.value = '';
                urlInput.placeholder = '（1on1では省略）';
                durationSelect.disabled = false;
                durationSelect.parentElement.style.display = '';
            } else if (selectedType === '自由記入') {
                taskInput.disabled = false;
                taskInput.placeholder = 'この会議で何を行いたいか';
                goalInput.disabled = true;
                goalInput.value = '';
                goalInput.placeholder = '（自由記入では省略）';
                urlInput.disabled = true;
                urlInput.value = '';
                urlInput.placeholder = '（自由記入では省略）';
                durationSelect.disabled = true;
                durationSelect.parentElement.style.display = 'none';
            } else {
                taskInput.disabled = false;
                taskInput.placeholder = 'この会議で何を行いたいか';
                goalInput.disabled = false;
                goalInput.placeholder = 'AI生成または直接入力';
                urlInput.disabled = false;
                urlInput.placeholder = 'URL';
                durationSelect.disabled = false;
                durationSelect.parentElement.style.display = '';
            }
        }
        typeSelect.addEventListener('change', () => updateFieldsByType(typeSelect.value));
        updateFieldsByType(typeSelect.value);

        geminiBtn.addEventListener('click', async (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();

            console.log("[KSCE] Gemini button clicked! isGenerating:", isGenerating);

            if (isGenerating) return;

            const task = taskInput.value;
            const type = typeSelect.value;
            const userGoal = goalInput.value;
            const place = placeSelect.value;
            const durationSelect = body.querySelector('.ksce-duration');
            const duration = durationSelect ? durationSelect.value : '30';

            console.log("[KSCE] Form values:", { task, type, userGoal, place, duration });

            if (!task && type !== '1on1') {
                alert("「何を行いたいか」を入力してください。");
                return;
            }

            isGenerating = true;
            geminiBtn.disabled = true;
            geminiBtn.classList.add('generating');

            // Show loading indicator
            let statusEl = panel.querySelector('.ksce-gen-status');
            if (!statusEl) {
                statusEl = document.createElement('div');
                statusEl.className = 'ksce-gen-status';
                toggleArea.appendChild(statusEl);
            }
            statusEl.textContent = '⏳ AI生成中...';
            statusEl.style.color = '#f0a030';

            try {
                let finalAgenda;

                if (type === '自由記入') {
                    // --- 自由記入: AI agenda from 場所 + やりたいこと only, no time ---
                    const placeLabel = place ? `場所は${place.replace('）', '')}です。` : '';
                    const freePrompt = `以下のやりたいことから、会議のアジェンダを作成してください。

${placeLabel}
【やりたいこと】${task}

以下の形式でプレーンテキストのみで回答してください（マークダウン記法は使用禁止。余計な説明も不要。時間配分は記載しないでください）：
アジェンダ：
・〜〜〜`;

                    let freeAiText = sanitizeAIText(await getAIResult(freePrompt));
                    if (!freeAiText) {
                        freeAiText = `アジェンダ：\n・${task}`;
                    }
                    let freeDesc = freeAiText.trim();
                    freeDesc = freeDesc.replace(/^アジェンダ[：:]\s*/m, '＜アジェンダ＞\n');
                    finalAgenda = freeDesc;

                } else if (type === "1on1") {
                    // --- 1on1: Fixed template, no AI ---
                    finalAgenda = `＜種類＞\n${type}\n\n`;
                    finalAgenda += `＜アジェンダ＞\n「7つの目的カテゴリー」で対話する\n\n`;
                    finalAgenda += `＜1on1の7つの目的カテゴリー＞\n${ONE_ON_ONE_CATEGORIES.join('\n')}`;
                } else {
                // --- Context-aware prompt ---
                let goalHint = '';
                if (userGoal) goalHint = `\nユーザーが設定したゴール: ${userGoal}`;

                let typeGuidance = '';
                if (type === 'アイデア出し') {
                    typeGuidance = `この会議は「アイデア出し（発散会議）」です。

【アジェンダ構成の観点】以下の3ステップでアジェンダを組み立ててください：
1. 前提とルールの共有（土台作り）：目的の再確認に加え、「批判禁止」「質より量」などの行動指針を提示し、発言しやすい空気を作る。
2. 多角的アプローチ（揺さぶり）：個人ワーク、グループワーク、あるいは「別の視点（顧客・競合等）」での検討など、思考を強制的に切り替える時間を設ける。
3. 兆しの整理（収束への準備）：出た案をグルーピングし、後で評価しやすいように「どの案が面白そうか」の感触を確かめる。

【ゴール策定の観点】この会議のゴールは「最高のアイデアを1つ選ぶこと」ではなく、次の3点を満たすことです：
1. 選択肢の「量」と「幅」：「もうこれ以上出ない」というレベルまで出し切れたか。似たような案ばかりでなく、違う角度の案が混ざっているか。
2. 絞り込みの「基準」：出たアイデアを後で評価するための「軸（コスト、スピード、面白さなど）」に合意できているか。
3. 熱量（ワクワク感）：参加者が「これ、やってみたい！」という前向きな心理状態になっているか。`;
                } else if (type === '意思決定') {
                    typeGuidance = `この会議は「意思決定（決断会議）」です。

【アジェンダ構成の観点】以下の3ステップでアジェンダを組み立ててください：
1. 判断材料の提示（事実確認）：現状の課題、複数の選択肢、それぞれの根拠データを提示し、全員の情報をフラットにする。
2. クリティカル・ディスカッション（検証）：あえてリスクやデメリットに焦点を当て、各案の「懸念点」を出し切る（苦言役の活躍場面）。
3. 裁定とコミットメント（宣言）：最終的な意思決定を行い、その結果に対して全員が「異議なし」と合意するプロセスを組み込む。

【ゴール策定の観点】ゴールは「決めること」だけでは不十分です。「明日から全員が迷わず動ける状態」が真のゴールです。次の3点を満たしてください：
1. 「何」を「なぜ」決めたかの明文化：結論だけでなく、その結論に至った論理的根拠（なぜAではなくBなのか）が全員に共有されているか。
2. 未解決リスクの特定：決めたことで新たに発生する懸念点や、あえて「決めなかったこと（持ち越し事項）」が明確か。
3. 不退転の合意：反対意見を持っていた人も含め、「決まった以上は全員でやり抜く」という約束ができているか。`;
                } else if (type === '情報共有・調整') {
                    typeGuidance = `この会議は「情報共有・調整（同期会議）」です。

【アジェンダ構成の観点】以下の3ステップでアジェンダを組み立ててください：
1. トピックスの峻別（優先付け）：全件報告ではなく、事前に「相談が必要な事項（ボトルネック）」を吸い上げ、そこに時間を割く構成にする。
2. 横断的フィードバック（相互作用）：一つの報告に対し、他メンバーが「自分の業務にどう影響するか」を確認し、連携のズレをその場で直す。
3. 行動の具体化（定着）：決定した調整事項を「誰が・いつまでに」やるか、タスクリストを全員で読み合わせる。

【ゴール策定の観点】「伝えた」はゴールではありません。「ズレがなくなった」ことがゴールです。次の3点を満たしてください：
1. 認識の「解像度」：全員が同じ絵を頭に浮かべているか。「だいたい分かった」ではなく、細部の認識まで一致しているか。
2. ボトルネックの解消：仕事の邪魔をしている障害物や、他部署との連携が必要な箇所がすべて洗い出され、担当が決まったか。
3. 即着手可能なネクストアクション：会議室を出た瞬間、全員が「自分の席に戻ってまず何をすべきか」を即答できるか。`;
                }

                const prompt = `あなたはプロの会議ファシリテーターです。以下の情報から、効果的な会議のアジェンダとゴールを設計してください。

【やりたいこと】${task}
【会議の種類】${type}
【会議時間】${duration}分
${goalHint}

【ガイダンス】
${typeGuidance}
各アジェンダ項目の想定時間の合計が${duration}分に収まるようにしてください。

以下の形式でプレーンテキストのみで回答してください（マークダウン記法（**、##、- 等）は使用禁止。余計な説明も不要）：
アジェンダ：
・〜〜〜（各項目に想定時間を括弧で付記）
ゴール：「〜ている状態」という完了形式で出力してください。単なる結論だけでなく、その後の行動や参加者の納得感を含めた3つの観点で提示してください。上記の【ゴール策定の観点】を踏まえてください`;

                console.log("[KSCE] Sending AI prompt, length:", prompt.length);
                let aiText = sanitizeAIText(await getAIResult(prompt));
                console.log("[KSCE] AI response received:", aiText ? aiText.substring(0, 80) : 'null (using fallback)');
                if (!aiText) {
                    // Fallback templates
                    if (type === 'アイデア出し') {
                        aiText = `アジェンダ：\n・背景と目的の共有（5分）\n・自由発想ブレスト（15分）\n・アイデアの分類と評価（10分）\n・次のアクション決定（5分）\nゴール：${task}について実行可能なアイデアを3つ以上選定する`;
                    } else if (type === '意思決定') {
                        aiText = `アジェンダ：\n・現状と課題の共有（5分）\n・選択肢の提示と比較（10分）\n・リスクと懸念の洗い出し（5分）\n・決定と合意形成（10分）\n・ネクストアクション確認（5分）\nゴール：${task}について方針を決定し、担当者とスケジュールを確定する`;
                    } else if (type === '情報共有・調整') {
                        aiText = `アジェンダ：\n・進捗報告（10分）\n・課題・リスクの共有（5分）\n・関係者間の調整（10分）\n・アクションアイテム確認（5分）\nゴール：${task}に関する認識を揃え、各自のアクションを明確にする`;
                    } else {
                        aiText = `アジェンダ：\n・アイスブレイク・近況確認（5分）\n・前回アクションの振り返り（5分）\n・本題：${task}（15分）\n・まとめ・次回アクション（5分）\nゴール：${task}について認識を合わせ、次のステップを決める`;
                    }
                }

                console.log("[KSCE] AI result:", aiText.substring(0, 150));

                // --- Build description ---
                let descText = aiText.trim();
                // Convert AI output headers to ＜＞ format
                descText = descText.replace(/^アジェンダ[：:]\s*/m, '＜アジェンダ＞\n');
                descText = descText.replace(/^ゴール[：:]\s*/m, '＜ゴール＞\n');

                finalAgenda = `＜種類＞\n${type}\n\n`;
                    // 役割分担は種類とアジェンダの間
                    const roles = REFINED_ROLES[type] || [];
                    if (roles.length > 0) {
                        finalAgenda += `＜役割分担＞`;
                        roles.forEach((r, idx) => {
                            if (idx < roles.length - 1) {
                                // Named roles: assign to specific person
                                finalAgenda += `\n${r.role}（${r.desc}）→ ______さん`;
                            } else {
                                // Last role: general stance for all other participants
                                finalAgenda += `\nその他の参加者 →【${r.role}】${r.desc}`;
                            }
                        });
                        finalAgenda += `\n\n`;
                    }
                    finalAgenda += descText;
                    finalAgenda += `\n\n＜資料URL＞\n${urlInput.value || '（ここにURLを貼付）'}`;
                }

                // Append 3 promises to description (skip for 自由記入)
                if (type !== '自由記入') {
                    finalAgenda += `\n\n＜会議を「価値ある時間」にするための3つの約束＞\n${THREE_PROMISES.join('\n')}`;
                }

                // --- 1. Update end time based on duration (FIRST) ---
                try {
                    const durationMin = parseInt(duration, 10);
                    const startSpan = document.querySelector('span[data-key="startTime"]');
                    const startTimeInput = document.querySelector('input[aria-label="開始時間"], input[aria-label="Start time"]');
                    let startVal = '';
                    if (startSpan) startVal = startSpan.textContent.trim();
                    else if (startTimeInput) startVal = startTimeInput.value;

                    if (startVal) {
                        const match = startVal.match(/(\d{1,2}):(\d{2})/);
                        if (match) {
                            let startHour = parseInt(match[1], 10);
                            let startMin = parseInt(match[2], 10);
                            if (/PM/i.test(startVal) && startHour < 12) startHour += 12;
                            if (/AM/i.test(startVal) && startHour === 12) startHour = 0;

                            const totalMin = startHour * 60 + startMin + durationMin;
                            const endHour = Math.floor(totalMin / 60) % 24;
                            const endMin = totalMin % 60;
                            const endIcal = 'T' + String(endHour).padStart(2, '0') + String(endMin).padStart(2, '0') + '00';

                            const endTimeSpan = document.querySelector('span[data-key="endTime"]');
                            if (endTimeSpan) {
                                endTimeSpan.click();
                                await new Promise(resolve => setTimeout(resolve, 500));
                                const endListbox = document.querySelector('[role="listbox"][aria-label="終了時間"], [role="listbox"][aria-label="End time"]');
                                const endOption = endListbox?.querySelector(`[data-ical="${endIcal}"]`);
                                if (endOption) {
                                    endOption.click();
                                    console.log("[KSCE] End time set:", endIcal, "(+" + durationMin + "min)");
                                } else {
                                    const endInput = document.querySelector('input[aria-label="終了時間"], input[aria-label="End time"]');
                                    if (endInput) {
                                        const endStr = String(endHour).padStart(2, '0') + ':' + String(endMin).padStart(2, '0');
                                        setInputValue(endInput, endStr);
                                        endInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                                        console.log("[KSCE] End time set via input:", endStr);
                                    }
                                }
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        }
                    }
                } catch (timeErr) {
                    console.warn("[KSCE] End time update failed:", timeErr);
                }

                // --- 2. Generate title (35 chars max) ---
                const titleInput = container.querySelector('input[jsname="YPqjbf"][aria-label*="タイトル"], input[aria-label*="Title"]');
                if (titleInput) {
                    if (type === '1on1' || type === '自由記入') {
                        // 1on1: simple title from task, no AI
                        const generatedTitle = task.substring(0, 35);
                        const finalTitle = place ? place + generatedTitle : generatedTitle;
                        setInputValue(titleInput, finalTitle);
                        console.log("[KSCE] 1on1 Title set:", finalTitle);
                    } else {
                        const goalMatch = finalAgenda.match(/＜ゴール＞\n?(.*)/);
                        const goalText = goalMatch ? goalMatch[1].trim() : task;

                        const titlePrompt = `以下の会議情報から、会議タイトルを35文字以内で1つだけ作成してください。
タイトルは「何について」「何を求めるか」が一目で分かるようにしてください。
例: 「新規プロダクト方向性の最終決定」「Q3マーケ施策アイデアブレスト」「開発チーム進捗共有と課題対応」
余計な説明や括弧は不要で、タイトルのみ回答してください。

やりたいこと: ${task}
ゴール: ${goalText}
種類: ${type}`;

                        let titleResult = sanitizeAIText(await getAIResult(titlePrompt));
                        let generatedTitle;
                        if (titleResult) {
                            generatedTitle = titleResult.trim().replace(/^[「『]/, '').replace(/[」』]$/, '').substring(0, 35);
                        } else {
                            generatedTitle = task.substring(0, 35);
                        }

                        const finalTitle = place ? place + generatedTitle : generatedTitle;
                        setInputValue(titleInput, finalTitle);
                        console.log("[KSCE] Title set:", finalTitle);
                    }
                }

                // --- 3. Write description (LAST, so focus stays here) ---
                writeDescriptionOverwrite(finalAgenda);

                // Collapse & show status
                panel.classList.add('collapsed');
                panelState.collapsed = true;

                let statusEl = panel.querySelector('.ksce-gen-status');
                if (!statusEl) {
                    statusEl = document.createElement('div');
                    statusEl.className = 'ksce-gen-status';
                    toggleArea.appendChild(statusEl);
                }
                statusEl.textContent = '✓ 生成完了';

            } catch (err) {
                console.error("[KSCE] Generation error:", err);
            } finally {
                isGenerating = false;
                geminiBtn.disabled = false;
                geminiBtn.classList.remove('generating');
            }
        });

        return panel;
    }

    function saveFormState(panel) {
        const t = panel.querySelector('.ksce-type');
        const p = panel.querySelector('.ksce-place');
        const d = panel.querySelector('.ksce-duration');
        const tk = panel.querySelector('.ksce-task');
        const g = panel.querySelector('.ksce-goal');
        const u = panel.querySelector('.ksce-url');
        if (t) panelState.type = t.value;
        if (p) panelState.place = p.value;
        if (d) panelState.duration = d.value;
        if (tk) panelState.task = tk.value;
        if (g) panelState.goal = g.value;
        if (u) panelState.url = u.value;
        panelState.collapsed = panel.classList.contains('collapsed');
    }

    function restoreFormState(panel) {
        const t = panel.querySelector('.ksce-type');
        const p = panel.querySelector('.ksce-place');
        const d = panel.querySelector('.ksce-duration');
        const tk = panel.querySelector('.ksce-task');
        const g = panel.querySelector('.ksce-goal');
        const u = panel.querySelector('.ksce-url');
        if (t) t.value = panelState.type;
        if (p) p.value = panelState.place;
        if (d) d.value = panelState.duration;
        if (tk) tk.value = panelState.task;
        if (g) g.value = panelState.goal;
        if (u) u.value = panelState.url;
        if (panelState.collapsed) panel.classList.add('collapsed');
    }

    // ===== Description Writing =====

    function writeDescriptionOverwrite(text) {
        let target = findDescriptionField();
        if (target) {
            doApply(target, text);
            return;
        }

        // Try to activate description field
        const candidates = [];
        document.querySelectorAll('span, div').forEach(el => {
            const t = (el.textContent || '').trim();
            if ((t.includes('説明') && (t.includes('追加') || t.includes('添付'))) ||
                t === '説明を追加' || t === 'Add description') {
                candidates.push(el);
            }
        });
        const ariaBtn = document.querySelector('div[aria-label="説明を追加"]');
        if (ariaBtn) candidates.unshift(ariaBtn);

        for (const c of candidates) { c.click(); }

        setTimeout(() => {
            const t = findDescriptionField();
            if (t) doApply(t, text);
            else console.warn("[KSCE] Description field not found after click.");
        }, 500);
    }

    function findDescriptionField() {
        const selectors = [
            'div[aria-label="説明"][contenteditable="true"]',
            'div[aria-label="説明を追加"][contenteditable="true"]',
            'div[aria-label*="Description"][contenteditable="true"]',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return el;
        }
        return null;
    }

    function doApply(target, text) {
        target.focus();
        // Clear existing content
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete', false, null);

        // Split text into lines and apply formatting
        const lines = text.split('\n');

        // Helper: ensure bold/underline is in desired state
        function ensureBold(on) {
            if (document.queryCommandState('bold') !== on) {
                document.execCommand('bold', false, null);
            }
        }
        function ensureUnderline(on) {
            if (document.queryCommandState('underline') !== on) {
                document.execCommand('underline', false, null);
            }
        }

        lines.forEach((line, i) => {
            if (i > 0) {
                // Ensure plain before line break to avoid inheriting style
                ensureBold(false);
                ensureUnderline(false);
                document.execCommand('insertLineBreak', false, null);
            }
            // Check if line is a ＜...＞ header
            const headerMatch = line.match(/^(＜[^＞]+＞)(.*)/);
            if (headerMatch) {
                // Turn ON bold + underline for header
                ensureBold(true);
                ensureUnderline(true);
                document.execCommand('insertText', false, headerMatch[1]);
                // Turn OFF for any trailing text
                ensureBold(false);
                ensureUnderline(false);
                if (headerMatch[2]) {
                    document.execCommand('insertText', false, headerMatch[2]);
                }
            } else {
                // Normal text: ensure plain
                ensureBold(false);
                ensureUnderline(false);
                document.execCommand('insertText', false, line);
            }
        });

        // Ensure formatting is off at end
        ensureBold(false);
        ensureUnderline(false);

        target.dispatchEvent(new Event('input', { bubbles: true }));

        // Move cursor to the end of the description
        const endRange = document.createRange();
        endRange.selectNodeContents(target);
        endRange.collapse(false); // collapse to end
        const endSel = window.getSelection();
        endSel.removeAllRanges();
        endSel.addRange(endRange);
        target.scrollTop = target.scrollHeight;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function setInputValue(input, value) {
        // Focus the input first
        input.focus();
        input.dispatchEvent(new Event('focus', { bubbles: true }));

        // Set value via native setter
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(input, value);

        // Fire input/change events
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Blur to finalize (do NOT send Enter — it triggers save)
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // ===== Main injection =====
    let injectTimer = null;
    function scheduleInject() {
        if (injectTimer) return;
        injectTimer = setTimeout(() => {
            injectTimer = null;
            injectPanel();
        }, 500);
    }

    function injectPanel() {
        const popup = document.querySelector('div[jsname="ssXDle"]');
        if (!popup) return;

        injectGenPanel(popup);
    }

    const observer = new MutationObserver(scheduleInject);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(injectPanel, 2000);

})();
