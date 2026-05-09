// Main application logic
class App {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.activePaperId = null;
        this.isLoading = false;
    }

    async init() {
        await db.init();
        await this.loadSettings();
        await this.loadTabs();
        this.renderTabs();

        // If no tabs, show empty state
        if (this.tabs.length === 0) {
            this.showEmptyState();
        } else {
            this.selectTab(this.tabs[0].id);
        }
    }

    async loadSettings() {
        github.token = sessionStorage.getItem('github_token') || '';
        github.repo = sessionStorage.getItem('github_repo') || 'hashswan-jm/research-archive-webpage';
        // Migrate old key name
        const oldKey = sessionStorage.getItem('openai_key');
        if (oldKey && !sessionStorage.getItem('llm_api_key')) {
            sessionStorage.setItem('llm_api_key', oldKey);
        }
        llm.apiKey = sessionStorage.getItem('llm_api_key') || '';
        llm.model = sessionStorage.getItem('llm_model') || 'gpt-4o';
        llm.baseUrl = sessionStorage.getItem('llm_base_url') || '';
        llm.protocol = sessionStorage.getItem('llm_protocol') || 'openai';
    }

    async loadTabs() {
        try {
            this.tabs = await github.loadAllTabs();
        } catch (e) {
            console.error('Failed to load tabs:', e);
            this.tabs = await db.listTabs();
        }
    }

    // ── Tabs ──
    renderTabs() {
        const container = document.getElementById('tab-list');
        container.innerHTML = this.tabs.map(tab => `
            <div class="tab-item ${tab.id === this.activeTabId ? 'active' : ''}" data-tab="${tab.id}"
                 onclick="app.selectTab('${tab.id}')">
                <span>${escapeHtml(tab.name || 'Untitled')}</span>
                <span class="tab-close" onclick="event.stopPropagation();app.closeTab('${tab.id}')">×</span>
            </div>
        `).join('');
    }

    selectTab(tabId) {
        this.activeTabId = tabId;
        this.activePaperId = null;
        editor.close();
        this.renderTabs();

        const tab = this.getCurrentTab();
        if (!tab) {
            this.showEmptyState();
            return;
        }

        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('workspace').classList.remove('hidden');

        // Update survey header
        document.getElementById('survey-title-input').value = tab.name || '';
        document.getElementById('survey-url-input').value = tab.surveyUrl || '';

        // Render tree
        tree.render(tab);
    }

    showEmptyState() {
        document.getElementById('empty-state').classList.remove('hidden');
        document.getElementById('workspace').classList.add('hidden');
    }

    getCurrentTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }

    getCurrentPaper() {
        const tab = this.getCurrentTab();
        if (!tab || !this.activePaperId) return null;
        return tab.papers?.[this.activePaperId];
    }

    // ── New Tab ──
    openNewTabModal() {
        document.getElementById('new-tab-modal').classList.remove('hidden');
        document.getElementById('new-tab-name').focus();
    }

    closeNewTabModal() {
        document.getElementById('new-tab-modal').classList.add('hidden');
        document.getElementById('new-tab-name').value = '';
        document.getElementById('new-tab-url').value = '';
        document.getElementById('new-tab-text').value = '';
    }

    async createNewTab() {
        const name = document.getElementById('new-tab-name').value.trim();
        if (!name) {
            this.showToast('Please enter a tab name', 'error');
            return;
        }

        const sourceType = document.querySelector('input[name="survey-source"]:checked').value;
        const parseLLM = document.getElementById('parse-with-llm').checked;
        let surveyUrl = '';
        let surveyText = '';

        if (sourceType === 'url') {
            surveyUrl = document.getElementById('new-tab-url').value.trim();
        } else if (sourceType === 'text') {
            surveyText = document.getElementById('new-tab-text').value.trim();
        }

        this.closeNewTabModal();
        this.isLoading = true;

        try {
            let sections = [];
            let papers = {};

            if (parseLLM && (surveyText || surveyUrl)) {
                this.showToast('Parsing survey with LLM...', 'success');
                const textToParse = surveyText || `Survey URL: ${surveyUrl}`;
                const result = await llm.parseSurvey(textToParse);
                sections = (result.sections || []).map(s => ({
                    id: this.uuid(),
                    title: s.title,
                    paperIds: []
                }));

                // Create papers from parsed results
                for (let i = 0; i < result.sections?.length; i++) {
                    const sec = result.sections[i];
                    const secId = sections[i].id;
                    for (const p of sec.papers || []) {
                        const paperId = this.uuid();
                        papers[paperId] = {
                            id: paperId,
                            title: p.title,
                            authors: p.authors || [],
                            year: p.year,
                            url: p.url || '',
                            content: { method: '', training: '', datasets: '', metrics: '', ablation: '' },
                            images: {}
                        };
                        sections[i].paperIds.push(paperId);
                    }
                }
            }

            const tab = {
                id: this.uuid(),
                name,
                surveyUrl,
                surveyText,
                createdAt: new Date().toISOString(),
                sections: sections.length > 0 ? sections : [{ id: this.uuid(), title: 'General', paperIds: [] }],
                papers
            };

            this.tabs.push(tab);
            await db.setTab(tab);
            this.renderTabs();
            this.selectTab(tab.id);
            this.showToast('Tab created', 'success');
        } catch (e) {
            console.error(e);
            this.showToast(`Failed: ${e.message}`, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    closeTab(tabId) {
        if (!confirm('Close this tab? Unsaved changes will be lost if not saved to GitHub.')) return;
        this.tabs = this.tabs.filter(t => t.id !== tabId);
        db.deleteTab(tabId);
        if (this.activeTabId === tabId) {
            this.activeTabId = this.tabs.length > 0 ? this.tabs[0].id : null;
            this.activePaperId = null;
            editor.close();
        }
        this.renderTabs();
        if (this.tabs.length === 0) {
            this.showEmptyState();
        } else if (this.activeTabId) {
            this.selectTab(this.activeTabId);
        }
    }

    // ── Paper Selection ──
    selectPaper(paperId) {
        // Save current paper if any
        this.saveCurrentPaperToTab();

        this.activePaperId = paperId;
        const paper = this.getCurrentPaper();
        if (paper) {
            editor.open(paper, this.activeTabId);
            editor.loadContent(paper);
        }

        // Update tree UI
        document.querySelectorAll('.tree-paper').forEach(el => {
            el.classList.toggle('active', el.dataset.paper === paperId);
        });
    }

    saveCurrentPaperToTab() {
        const tab = this.getCurrentTab();
        if (!tab || !this.activePaperId) return;

        const paper = tab.papers?.[this.activePaperId];
        if (!paper) return;

        // Update paper meta
        const meta = editor.getPaperMeta();
        paper.title = meta.title;
        paper.authors = meta.authors;
        paper.year = meta.year;
        paper.url = meta.url;

        // Update content
        const content = editor.getCurrentContent();
        paper.content = {
            method: content.method || '',
            training: content.training || '',
            datasets: content.datasets || '',
            metrics: content.metrics || '',
            ablation: content.ablation || ''
        };
    }

    saveCurrentPaper() {
        this.saveCurrentPaperToTab();
        this.showToast('Paper saved to local cache', 'success');
    }

    deleteCurrentPaper() {
        if (!confirm('Delete this paper permanently?')) return;
        const tab = this.getCurrentTab();
        if (!tab) return;

        // Remove from sections
        tab.sections.forEach(sec => {
            sec.paperIds = sec.paperIds.filter(id => id !== this.activePaperId);
        });

        // Remove from papers
        if (tab.papers) delete tab.papers[this.activePaperId];

        this.activePaperId = null;
        editor.close();
        tree.render(tab);
        this.showToast('Paper deleted', 'success');
    }

    closeEditor() {
        this.saveCurrentPaperToTab();
        this.activePaperId = null;
        editor.close();
        document.querySelectorAll('.tree-paper').forEach(el => el.classList.remove('active'));
    }

    // ── Tree Operations ──
    addSection(title) {
        const tab = this.getCurrentTab();
        if (!tab) return;
        if (!tab.sections) tab.sections = [];
        tab.sections.push({ id: this.uuid(), title, paperIds: [] });
        tree.render(tab);
    }

    deleteSection(sectionId) {
        const tab = this.getCurrentTab();
        if (!tab) return;
        tab.sections = tab.sections.filter(s => s.id !== sectionId);
        tree.render(tab);
    }

    addPaper(sectionId, title) {
        const tab = this.getCurrentTab();
        if (!tab) return;

        if (!tab.papers) tab.papers = {};
        const paperId = this.uuid();
        const paper = {
            id: paperId,
            title,
            authors: [],
            year: null,
            url: '',
            content: { method: '', training: '', datasets: '', metrics: '', ablation: '' },
            images: {}
        };
        tab.papers[paperId] = paper;

        const section = tab.sections.find(s => s.id === sectionId);
        if (section) {
            if (!section.paperIds) section.paperIds = [];
            section.paperIds.push(paperId);
        }

        tree.render(tab);
        this.selectPaper(paperId);
    }

    deletePaper(paperId, sectionId) {
        const tab = this.getCurrentTab();
        if (!tab) return;

        const section = tab.sections.find(s => s.id === sectionId);
        if (section) {
            section.paperIds = section.paperIds.filter(id => id !== paperId);
        }
        if (tab.papers) delete tab.papers[paperId];

        if (this.activePaperId === paperId) {
            this.activePaperId = null;
            editor.close();
        }

        tree.render(tab);
    }

    searchTree(value) {
        tree.setFilter(value);
    }

    // ── Editor Tabs ──
    switchEditorTab(key) {
        editor.switchTab(key);
    }

    togglePreview() {
        editor.togglePreview();
    }

    handleImageUpload(input) {
        editor.handleFileUpload(input);
    }

    // ── LLM Enrichment ──
    async enrichWithLLM() {
        const paper = this.getCurrentPaper();
        if (!paper) return;

        this.showToast('Extracting paper info with LLM...', 'success');
        try {
            const result = await llm.extractPaper(
                paper.title,
                paper.authors.join(', '),
                paper.year,
                paper.content?.method || ''
            );

            paper.content = {
                method: result.method,
                training: result.training,
                datasets: result.datasets,
                metrics: result.metrics,
                ablation: result.ablation
            };

            editor.loadContent(paper);
            this.showToast('Paper auto-filled', 'success');
        } catch (e) {
            console.error(e);
            this.showToast(`LLM failed: ${e.message}`, 'error');
        }
    }

    // ── Settings ──
    openSettings() {
        document.getElementById('github-token').value = sessionStorage.getItem('github_token') || '';
        document.getElementById('github-repo').value = sessionStorage.getItem('github_repo') || 'hashswan-jm/research-archive-webpage';
        document.getElementById('llm-api-key').value = sessionStorage.getItem('llm_api_key') || '';
        document.getElementById('llm-base-url').value = sessionStorage.getItem('llm_base_url') || '';
        document.getElementById('llm-model').value = sessionStorage.getItem('llm_model') || 'gpt-4o';

        const protocol = sessionStorage.getItem('llm_protocol') || 'openai';
        const radio = document.querySelector(`input[name="llm-protocol"][value="${protocol}"]`);
        if (radio) radio.checked = true;
        this.onProtocolChange();

        document.getElementById('settings-modal').classList.remove('hidden');
    }

    closeSettings() {
        document.getElementById('settings-modal').classList.add('hidden');
    }

    onProtocolChange() {
        const protocol = document.querySelector('input[name="llm-protocol"]:checked')?.value || 'openai';
        const hint = document.getElementById('api-key-hint');
        const baseUrlInput = document.getElementById('llm-base-url');
        if (protocol === 'anthropic') {
            hint.textContent = 'Anthropic: x-api-key format';
            if (!baseUrlInput.value) baseUrlInput.placeholder = 'https://api.anthropic.com';
        } else {
            hint.textContent = 'OpenAI: sk-... format';
            if (!baseUrlInput.value) baseUrlInput.placeholder = 'https://api.openai.com/v1';
        }
    }

    saveSettings() {
        const ghToken = document.getElementById('github-token').value.trim();
        const ghRepo = document.getElementById('github-repo').value.trim();
        const apiKey = document.getElementById('llm-api-key').value.trim();
        const baseUrl = document.getElementById('llm-base-url').value.trim();
        const model = document.getElementById('llm-model').value.trim();
        const protocol = document.querySelector('input[name="llm-protocol"]:checked')?.value || 'openai';

        if (ghToken) sessionStorage.setItem('github_token', ghToken);
        else sessionStorage.removeItem('github_token');

        if (ghRepo) sessionStorage.setItem('github_repo', ghRepo);

        if (apiKey) sessionStorage.setItem('llm_api_key', apiKey);
        else sessionStorage.removeItem('llm_api_key');

        if (baseUrl) sessionStorage.setItem('llm_base_url', baseUrl);
        else sessionStorage.removeItem('llm_base_url');

        sessionStorage.setItem('llm_model', model);
        sessionStorage.setItem('llm_protocol', protocol);

        // Update clients
        github.token = ghToken;
        github.repo = ghRepo;
        llm.apiKey = apiKey;
        llm.model = model;
        llm.baseUrl = baseUrl;
        llm.protocol = protocol;

        this.closeSettings();
        this.showToast('Settings saved to session', 'success');
    }

    // ── GitHub Save ──
    async saveToGitHub() {
        // Save current paper first
        this.saveCurrentPaperToTab();

        const tab = this.getCurrentTab();
        if (!tab) {
            this.showToast('No active tab', 'error');
            return;
        }

        if (!github.token) {
            this.showToast('GitHub token not configured', 'error');
            this.openSettings();
            return;
        }

        this.showToast('Saving to GitHub...', 'success');
        try {
            await github.saveTab(tab);
            this.showToast('Saved to GitHub', 'success');
        } catch (e) {
            console.error(e);
            this.showToast(`Save failed: ${e.message}`, 'error');
        }
    }

    // ── Export / Import ──
    exportData() {
        const data = { tabs: this.tabs, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `research-archive-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Exported', 'success');
    }

    async importData(input) {
        const file = input.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (data.tabs && Array.isArray(data.tabs)) {
                // Merge or replace? Let's replace for simplicity
                if (confirm(`Import ${data.tabs.length} tabs? This will add to existing tabs.`)) {
                    for (const tab of data.tabs) {
                        if (!this.tabs.find(t => t.id === tab.id)) {
                            this.tabs.push(tab);
                            await db.setTab(tab);
                        }
                    }
                    this.renderTabs();
                    if (this.tabs.length > 0 && !this.activeTabId) {
                        this.selectTab(this.tabs[0].id);
                    }
                    this.showToast(`Imported ${data.tabs.length} tabs`, 'success');
                }
            }
        } catch (e) {
            this.showToast('Import failed: invalid JSON', 'error');
        }
        input.value = '';
    }

    // ── Survey URL Fetch ──
    async fetchSurveyText() {
        const url = document.getElementById('survey-url-input').value.trim();
        if (!url) {
            this.showToast('Please enter a survey URL', 'error');
            return;
        }
        this.showToast('Fetching survey text... (may be blocked by CORS)', 'success');
        try {
            const res = await fetch(`https://r.jina.ai/${url}`);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            const text = await res.text();

            const tab = this.getCurrentTab();
            if (tab) {
                tab.surveyText = text;
                tab.surveyUrl = url;
                this.showToast('Survey text fetched. You can now Parse with LLM.', 'success');
            }
        } catch (e) {
            this.showToast(`Fetch failed: ${e.message}. Try pasting text manually.`, 'error');
        }
    }

    // ── Toast ──
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast toast-${type}`;
        toast.classList.remove('hidden');

        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    // ── New Tab Modal: source toggle ──
    initNewTabModal() {
        document.querySelectorAll('input[name="survey-source"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('survey-url-group').classList.toggle('hidden', e.target.value !== 'url');
                document.getElementById('survey-text-group').classList.toggle('hidden', e.target.value !== 'text');
            });
        });
    }

    uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
}

const app = new App();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    app.init();
    app.initNewTabModal();
});
