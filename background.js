/**
 * Kaigi-Support-Chrome-Extension
 * background.js — Service Worker (Manifest V3)
 * 
 * Chrome v145+: LanguageModel が直接利用可能
 * capabilities() は廃止 → create() で直接セッション作成
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Open chrome:// URLs in new tab
    if (message.action === 'openTab' && message.url) {
        chrome.tabs.create({ url: message.url });
        sendResponse({ success: true });
        return false;
    }

    // Check AI availability
    if (message.action === 'checkAI') {
        (async () => {
            const hasLM = typeof LanguageModel !== 'undefined';
            console.log('[KSCE-BG] LanguageModel exists:', hasLM);

            if (hasLM) {
                try {
                    // Test by creating a quick session
                    const session = await LanguageModel.create();
                    session.destroy();
                    console.log('[KSCE-BG] AI available in SW!');
                    sendResponse({ available: true, status: 'readily', method: 'sw' });
                    return;
                } catch (e) {
                    console.warn('[KSCE-BG] SW create error:', e.message);
                    // Fall through to page check
                }
            }

            // Fallback: try in page main world
            if (!sender.tab?.id) {
                sendResponse({ available: false, reason: 'no tab id' });
                return;
            }
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    world: 'MAIN',
                    func: async () => {
                        try {
                            if (typeof LanguageModel !== 'undefined') {
                                const session = await LanguageModel.create();
                                session.destroy();
                                return { available: true, api: 'LanguageModel' };
                            }
                            if (window.ai && window.ai.languageModel) {
                                const session = await window.ai.languageModel.create();
                                session.destroy();
                                return { available: true, api: 'window.ai' };
                            }
                            return { available: false, reason: 'No AI API' };
                        } catch (e) {
                            return { available: false, reason: e.message };
                        }
                    }
                });
                const r = results[0]?.result;
                console.log('[KSCE-BG] Page AI check:', JSON.stringify(r));
                sendResponse(r || { available: false });
            } catch (e) {
                sendResponse({ available: false, reason: e.message });
            }
        })();
        return true;
    }

    // Run AI prompt
    if (message.action === 'aiPrompt') {
        (async () => {
            try {
                // Try SW first
                if (typeof LanguageModel !== 'undefined') {
                    const session = await LanguageModel.create({
                        systemPrompt: message.systemPrompt || "あなたはプロの会議ファシリテーターです。指示に従って簡潔に日本語で回答してください。"
                    });
                    const result = await session.prompt(message.prompt);
                    session.destroy();
                    console.log('[KSCE-BG] AI result via SW, length:', result.length);
                    sendResponse({ result });
                    return;
                }
            } catch (e) {
                console.warn('[KSCE-BG] SW prompt failed:', e.message);
            }

            // Fallback: page main world
            if (!sender.tab?.id) {
                sendResponse({ result: null, error: 'no tab id' });
                return;
            }
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    world: 'MAIN',
                    func: async (promptText, sysPrompt) => {
                        try {
                            let session;
                            if (typeof LanguageModel !== 'undefined') {
                                session = await LanguageModel.create({ systemPrompt: sysPrompt });
                            } else if (window.ai && window.ai.languageModel) {
                                session = await window.ai.languageModel.create({ systemPrompt: sysPrompt });
                            } else {
                                return { result: null, error: 'No AI API' };
                            }
                            const result = await session.prompt(promptText);
                            session.destroy();
                            return { result };
                        } catch (e) {
                            return { result: null, error: e.message };
                        }
                    },
                    args: [
                        message.prompt,
                        message.systemPrompt || "あなたはプロの会議ファシリテーターです。指示に従って簡潔に日本語で回答してください。"
                    ]
                });
                const r = results[0]?.result;
                sendResponse(r || { result: null });
            } catch (e) {
                sendResponse({ result: null, error: e.message });
            }
        })();
        return true;
    }
});

console.log('[KSCE-BG] Background service worker loaded v1.0.0');
