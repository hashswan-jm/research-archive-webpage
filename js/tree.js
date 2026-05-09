// Tree component for section + paper navigation
class Tree {
    constructor() {
        this.filter = '';
    }

    render(tab) {
        const container = document.getElementById('tree-content');
        if (!tab || !tab.sections) {
            container.innerHTML = '';
            return;
        }

        const sections = tab.sections || [];
        const papers = tab.papers || {};

        container.innerHTML = sections.map((section, si) => {
            const sectionPapers = section.paperIds
                ?.map(id => papers[id])
                .filter(Boolean)
                .filter(p => this.matchesFilter(p)) || [];

            if (this.filter && sectionPapers.length === 0) {
                // Check if section title matches
                if (!section.title.toLowerCase().includes(this.filter)) return '';
            }

            return `
                <div class="tree-section" data-section="${section.id}">
                    <div class="tree-section-header" onclick="tree.toggleSection('${section.id}')">
                        <span class="tree-toggle">▼</span>
                        <span>${escapeHtml(section.title)}</span>
                        <span class="tree-actions">
                            <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();tree.addPaper('${section.id}')" title="Add paper">+ Paper</button>
                            <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();tree.deleteSection('${section.id}')" title="Delete section">×</button>
                        </span>
                    </div>
                    <div class="tree-papers" id="section-papers-${section.id}">
                        ${sectionPapers.map(p => `
                            <div class="tree-paper ${app.activePaperId === p.id ? 'active' : ''}" data-paper="${p.id}" onclick="tree.selectPaper('${p.id}')">
                                <span>${escapeHtml(p.title)}</span>
                                <span class="tree-paper-actions">
                                    <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();tree.deletePaper('${p.id}', '${section.id}')" title="Delete">×</button>
                                </span>
                            </div>
                        `).join('')}
                        <div class="tree-add-paper" onclick="tree.addPaper('${section.id}')">
                            + Add paper
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    matchesFilter(paper) {
        if (!this.filter) return true;
        const f = this.filter.toLowerCase();
        return (paper.title && paper.title.toLowerCase().includes(f)) ||
               (paper.authors && paper.authors.some(a => a.toLowerCase().includes(f)));
    }

    toggleSection(sectionId) {
        const el = document.getElementById(`section-papers-${sectionId}`);
        const header = el?.previousElementSibling;
        if (el) {
            el.classList.toggle('hidden');
            header?.classList.toggle('collapsed');
        }
    }

    selectPaper(paperId) {
        app.selectPaper(paperId);
    }

    addSection() {
        const name = prompt('Section name:');
        if (!name) return;
        app.addSection(name);
    }

    deleteSection(sectionId) {
        if (!confirm('Delete this section and remove all papers from it?')) return;
        app.deleteSection(sectionId);
    }

    addPaper(sectionId) {
        const title = prompt('Paper title:');
        if (!title) return;
        app.addPaper(sectionId, title);
    }

    deletePaper(paperId, sectionId) {
        if (!confirm('Delete this paper?')) return;
        app.deletePaper(paperId, sectionId);
    }

    setFilter(value) {
        this.filter = value.toLowerCase().trim();
        this.render(app.getCurrentTab());
    }
}

const tree = new Tree();

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
