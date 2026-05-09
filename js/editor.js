// Editor component for markdown editing with image support
class Editor {
    constructor() {
        this.currentPaperId = null;
        this.currentTabId = null;
        this.currentTabKey = 'method'; // method, training, datasets, metrics, ablation, images
        this.unsavedContent = {};
        this.previewMode = false;

        this.textarea = document.getElementById('editor-textarea');
        this.preview = document.getElementById('editor-preview');
        this.textareaWrap = document.getElementById('editor-textarea-wrap');

        this.bindEvents();
    }

    bindEvents() {
        // Paste image
        this.textarea.addEventListener('paste', (e) => this.handlePaste(e));

        // Auto-save content on input
        this.textarea.addEventListener('input', () => {
            if (this.currentPaperId) {
                this.unsavedContent[this.currentTabKey] = this.textarea.value;
            }
        });
    }

    open(paper, tabId) {
        this.currentPaperId = paper.id;
        this.currentTabId = tabId;
        this.unsavedContent = {};

        // Populate paper header
        document.getElementById('paper-title-input').value = paper.title || '';
        document.getElementById('paper-authors-input').value = paper.authors ? paper.authors.join(', ') : '';
        document.getElementById('paper-year-input').value = paper.year || '';
        document.getElementById('paper-url-input').value = paper.url || '';

        // Show editor
        document.getElementById('editor-empty').classList.add('hidden');
        document.getElementById('editor-wrapper').classList.remove('hidden');

        // Reset to method tab
        this.switchTab('method');
    }

    close() {
        this.currentPaperId = null;
        this.currentTabId = null;
        this.unsavedContent = {};
        document.getElementById('editor-empty').classList.remove('hidden');
        document.getElementById('editor-wrapper').classList.add('hidden');
    }

    switchTab(key) {
        // Save current tab content
        if (this.currentPaperId && this.currentTabKey) {
            this.unsavedContent[this.currentTabKey] = this.textarea.value;
        }

        this.currentTabKey = key;

        // Update tab buttons
        document.querySelectorAll('.editor-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === key);
        });

        // Load content
        if (key === 'images') {
            this.renderImagesTab();
        } else {
            const content = this.unsavedContent[key] || '';
            this.textarea.value = content;
            this.textareaWrap.classList.remove('hidden');
            this.preview.classList.add('hidden');
            this.previewMode = false;
            document.getElementById('preview-toggle').textContent = 'Preview';
        }
    }

    loadContent(paper) {
        // Load all content sections from paper object
        const content = paper.content || {};
        this.unsavedContent = {
            method: content.method || '',
            training: content.training || '',
            datasets: content.datasets || '',
            metrics: content.metrics || '',
            ablation: content.ablation || ''
        };

        // Refresh current tab display
        if (this.currentTabKey !== 'images') {
            this.textarea.value = this.unsavedContent[this.currentTabKey] || '';
        } else {
            this.renderImagesTab();
        }
    }

    renderImagesTab() {
        this.textareaWrap.classList.add('hidden');
        this.preview.classList.remove('hidden');
        this.previewMode = true;

        const paper = app.getCurrentPaper();
        const images = paper?.images || {};
        let html = '';

        if (Object.keys(images).length === 0) {
            html = `<p style="color:var(--text-muted);">No images yet.</p><p style="color:var(--text-muted);">Paste images in any editor tab with Ctrl+V, or use the Upload Image button.</p>`;
        } else {
            html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">';
            for (const [key, base64] of Object.entries(images)) {
                html += `
                    <div style="border:1px solid var(--border-color);border-radius:var(--radius);overflow:hidden;">
                        <img src="${base64}" style="width:100%;display:block;">
                        <div style="padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:0.8rem;color:var(--text-secondary);">${key}</span>
                            <button class="btn btn-xs btn-danger" onclick="editor.deleteImage('${key}')">Delete</button>
                        </div>
                    </div>`;
            }
            html += '</div>';
        }

        this.preview.innerHTML = html;
    }

    deleteImage(key) {
        const paper = app.getCurrentPaper();
        if (paper && paper.images) {
            delete paper.images[key];
            this.renderImagesTab();
        }
    }

    getCurrentContent() {
        // Include unsaved textarea content
        const result = { ...this.unsavedContent };
        if (this.currentTabKey !== 'images') {
            result[this.currentTabKey] = this.textarea.value;
        }
        return result;
    }

    getPaperMeta() {
        return {
            title: document.getElementById('paper-title-input').value.trim(),
            authors: document.getElementById('paper-authors-input').value.split(',').map(s => s.trim()).filter(Boolean),
            year: parseInt(document.getElementById('paper-year-input').value) || null,
            url: document.getElementById('paper-url-input').value.trim()
        };
    }

    togglePreview() {
        if (this.currentTabKey === 'images') return;

        this.previewMode = !this.previewMode;
        if (this.previewMode) {
            this.textareaWrap.classList.add('hidden');
            this.preview.classList.remove('hidden');
            this.renderPreview();
            document.getElementById('preview-toggle').textContent = 'Edit';
        } else {
            this.textareaWrap.classList.remove('hidden');
            this.preview.classList.add('hidden');
            document.getElementById('preview-toggle').textContent = 'Preview';
        }
    }

    renderPreview() {
        const markdown = this.textarea.value;
        const html = marked.parse(markdown || '');
        this.preview.innerHTML = DOMPurify.sanitize(html);
    }

    async handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                await this.insertImage(file);
                return;
            }
        }
    }

    async handleFileUpload(input) {
        const file = input.files?.[0];
        if (!file) return;
        await this.insertImage(file);
        input.value = '';
    }

    async insertImage(file) {
        const base64 = await this.fileToBase64(file);
        const name = `image_${Date.now()}`;

        // Store in paper images
        const paper = app.getCurrentPaper();
        if (paper) {
            if (!paper.images) paper.images = {};
            paper.images[name] = base64;
        }

        // Insert markdown reference in textarea
        const markdown = `\n![${name}](${base64})\n`;
        const pos = this.textarea.selectionStart;
        const before = this.textarea.value.slice(0, pos);
        const after = this.textarea.value.slice(pos);
        this.textarea.value = before + markdown + after;
        this.textarea.selectionStart = this.textarea.selectionEnd = pos + markdown.length;
        this.textarea.focus();

        // Trigger input event to update unsavedContent
        this.textarea.dispatchEvent(new Event('input'));

        app.showToast('Image inserted', 'success');
    }

    fileToBase64(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }
}

const editor = new Editor();
