// ───────────────────────────────
// Global State
// ───────────────────────────────
let topics = [];
let activeTopicId = null;
let appData = null;
let allPapers = [];
let activeCategory = 'all';
let searchQuery = '';
let root = null;
let svg, g, tree, zoom;
let searchListenerAttached = false;

const colors = {
    node: '#21262d',
    nodeStroke: '#58a6ff',
    leaf: '#3fb950',
    text: '#e6edf3',
    textLeaf: '#8b949e',
    link: '#30363d'
};

// ───────────────────────────────
// Entry: Load topics index
// ───────────────────────────────
async function init() {
    try {
        const res = await fetch('./data/topics.json');
        topics = await res.json();
        renderTabs();
        bindGlobalEvents();

        // Load first topic by default
        if (topics.length > 0) {
            await switchTopic(topics[0].id);
        }
    } catch (err) {
        document.getElementById('topic-title').textContent = 'Failed to load topics';
        console.error(err);
    }
}

// ───────────────────────────────
// Tab Navigation
// ───────────────────────────────
function renderTabs() {
    const container = document.getElementById('topic-tabs');
    container.innerHTML = topics.map(t => `
        <button class="topic-tab ${t.id === activeTopicId ? 'active' : ''}" data-topic="${t.id}">
            ${escapeHtml(t.name)}
        </button>
    `).join('');

    container.querySelectorAll('.topic-tab').forEach(btn => {
        btn.addEventListener('click', () => switchTopic(btn.dataset.topic));
    });
}

async function switchTopic(topicId) {
    if (topicId === activeTopicId && appData) return;

    activeTopicId = topicId;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    // Update tab UI
    document.querySelectorAll('.topic-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.topic === topicId);
    });

    // Reset filters
    activeCategory = 'all';
    searchQuery = '';
    document.getElementById('search-input').value = '';

    // Load topic data
    try {
        const res = await fetch('./' + topic.file);
        appData = await res.json();
        loadTopicUI();
    } catch (err) {
        document.getElementById('topic-title').textContent = 'Failed to load topic data';
        console.error(err);
    }
}

// ───────────────────────────────
// Load Topic UI
// ───────────────────────────────
function loadTopicUI() {
    // Topic bar
    document.getElementById('topic-title').textContent = appData.topic;
    const s = appData.survey;
    document.getElementById('survey-info').innerHTML = `
        <span class="survey-tag">Survey</span>
        <span>${escapeHtml(s.title)} (${s.year})</span>
        <span>${escapeHtml(s.authors.join(', '))}</span>
        ${s.url ? `<a href="${s.url}" target="_blank">Paper Link →</a>` : ''}
    `;

    // Flatten papers
    allPapers = Object.values(appData.papers);

    // Render components
    renderMindMap();
    renderFilters();
    renderPapers();
}

// ───────────────────────────────
// Global Events (bind once)
// ───────────────────────────────
function bindGlobalEvents() {
    // Search
    if (!searchListenerAttached) {
        document.getElementById('search-input').addEventListener('input', e => {
            searchQuery = e.target.value.toLowerCase();
            renderPapers();
        });
        searchListenerAttached = true;
    }

    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // Mind map controls
    document.getElementById('expand-all').addEventListener('click', expandAll);
    document.getElementById('collapse-all').addEventListener('click', collapseAll);
    document.getElementById('reset-zoom').addEventListener('click', resetZoom);
}

// ───────────────────────────────
// Mind Map (D3.js)
// ───────────────────────────────
function renderMindMap() {
    const container = document.getElementById('mindmap-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    container.innerHTML = '';

    svg = d3.select('#mindmap-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    zoom = d3.zoom()
        .scaleExtent([0.3, 3])
        .on('zoom', e => g.attr('transform', e.transform));

    svg.call(zoom);

    g = svg.append('g')
        .attr('transform', `translate(${width * 0.15},${height / 2})`);

    tree = d3.tree().nodeSize([36, 180]);

    root = d3.hierarchy(appData.mindmap, d => d.children);
    root.x0 = 0;
    root.y0 = 0;

    root.descendants().forEach(d => {
        if (d.depth > 1) d._children = d.children;
        if (d.depth > 1) d.children = null;
    });

    updateMindMap(root);
    centerMindMap();

    window.addEventListener('resize', () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        svg.attr('width', w).attr('height', h);
        g.attr('transform', `translate(${w * 0.15},${h / 2})`);
    });
}

function updateMindMap(source) {
    const duration = 400;
    const nodes = root.descendants();
    const links = root.links();

    tree(root);
    nodes.forEach(d => { d.y = d.depth * 180; });

    const node = g.selectAll('g.node')
        .data(nodes, d => d.data.name);

    const nodeEnter = node.enter().append('g')
        .attr('class', d => `node ${isLeaf(d) ? 'leaf' : ''}`)
        .attr('transform', d => `translate(${source.y0},${source.x0})`)
        .on('click', (e, d) => {
            if (d.children || d._children) {
                toggleNode(d);
            } else if (isLeaf(d) && d.data.paperIds) {
                highlightPapers(d.data.paperIds);
            }
        });

    nodeEnter.append('circle')
        .attr('r', 0)
        .style('fill', d => d._children ? colors.nodeStroke : (isLeaf(d) ? colors.leaf : colors.node))
        .style('stroke', d => isLeaf(d) ? colors.leaf : colors.nodeStroke);

    nodeEnter.append('text')
        .attr('dy', '0.35em')
        .attr('x', d => d.children || d._children ? -14 : 14)
        .attr('text-anchor', d => d.children || d._children ? 'end' : 'start')
        .text(d => d.data.name)
        .style('fill-opacity', 0)
        .style('font-weight', d => d.depth === 0 ? '700' : (d.depth === 1 ? '600' : '400'));

    const nodeUpdate = node.merge(nodeEnter).transition().duration(duration)
        .attr('transform', d => `translate(${d.y},${d.x})`);

    nodeUpdate.select('circle')
        .attr('r', d => d.depth === 0 ? 8 : 6)
        .style('fill', d => d._children ? colors.nodeStroke : (isLeaf(d) ? colors.leaf : colors.node))
        .style('stroke', d => isLeaf(d) ? colors.leaf : colors.nodeStroke);

    nodeUpdate.select('text')
        .style('fill-opacity', 1);

    const nodeExit = node.exit().transition().duration(duration)
        .attr('transform', d => `translate(${source.y},${source.x})`)
        .remove();

    nodeExit.select('circle').attr('r', 0);
    nodeExit.select('text').style('fill-opacity', 0);

    const link = g.selectAll('path.link')
        .data(links, d => d.target.data.name);

    const linkEnter = link.enter().insert('path', 'g')
        .attr('class', 'link')
        .attr('d', d => {
            const o = { x: source.x0, y: source.y0 };
            return diagonal(o, o);
        });

    link.merge(linkEnter).transition().duration(duration)
        .attr('d', d => diagonal(d.source, d.target));

    link.exit().transition().duration(duration)
        .attr('d', d => {
            const o = { x: source.x, y: source.y };
            return diagonal(o, o);
        })
        .remove();

    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
}

function diagonal(s, d) {
    return `M ${s.y} ${s.x}
            C ${(s.y + d.y) / 2} ${s.x},
              ${(s.y + d.y) / 2} ${d.x},
              ${d.y} ${d.x}`;
}

function isLeaf(d) {
    return d.data.paperIds && d.data.paperIds.length > 0;
}

function toggleNode(d) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    updateMindMap(d);
}

function expandAll() {
    root.descendants().forEach(d => {
        if (d._children) {
            d.children = d._children;
            d._children = null;
        }
    });
    updateMindMap(root);
    centerMindMap();
}

function collapseAll() {
    root.descendants().forEach(d => {
        if (d.depth > 0 && d.children) {
            d._children = d.children;
            d.children = null;
        }
    });
    updateMindMap(root);
    centerMindMap();
}

function resetZoom() {
    const container = document.getElementById('mindmap-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity.translate(width * 0.15, height / 2)
    );
}

function centerMindMap() {
    const container = document.getElementById('mindmap-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const nodes = root.descendants();
    const xExtent = d3.extent(nodes, d => d.x);
    const yExtent = d3.extent(nodes, d => d.y);

    const boundsWidth = (yExtent[1] - yExtent[0]) + 200;
    const boundsHeight = (xExtent[1] - xExtent[0]) + 100;

    const scale = Math.min(
        (width - 60) / boundsWidth,
        (height - 60) / boundsHeight,
        1.2
    );

    const translateX = width * 0.15;
    const translateY = height / 2 - (xExtent[0] + xExtent[1]) / 2 * scale;

    svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity.translate(translateX, translateY).scale(scale)
    );
}

function highlightPapers(paperIds) {
    document.querySelectorAll('.paper-card.highlighted').forEach(c => c.classList.remove('highlighted'));

    paperIds.forEach(id => {
        const card = document.querySelector(`.paper-card[data-id="${id}"]`);
        if (card) {
            card.classList.add('highlighted');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    setTimeout(() => {
        document.querySelectorAll('.paper-card.highlighted').forEach(c => c.classList.remove('highlighted'));
    }, 3000);
}

// ───────────────────────────────
// Category Filters
// ───────────────────────────────
function renderFilters() {
    const categories = ['all', ...new Set(allPapers.map(p => p.category))];
    const container = document.getElementById('category-filters');

    container.innerHTML = categories.map(cat => {
        const label = cat === 'all' ? 'All' : cat;
        const active = cat === 'all' ? 'active' : '';
        return `<button class="${active}" data-category="${cat}">${label}</button>`;
    }).join('');

    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.category;
            renderPapers();
        });
    });
}

// ───────────────────────────────
// Papers Grid
// ───────────────────────────────
function renderPapers() {
    let filtered = allPapers;

    if (activeCategory !== 'all') {
        filtered = filtered.filter(p => p.category === activeCategory);
    }

    if (searchQuery) {
        filtered = filtered.filter(p =>
            p.title.toLowerCase().includes(searchQuery) ||
            p.authors.some(a => a.toLowerCase().includes(searchQuery)) ||
            (p.subcategory && p.subcategory.toLowerCase().includes(searchQuery))
        );
    }

    document.getElementById('paper-count').textContent = `${filtered.length} paper${filtered.length !== 1 ? 's' : ''}`;

    const grid = document.getElementById('papers-grid');
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px;">No papers found.</div>';
        return;
    }

    grid.innerHTML = filtered.map(p => `
        <div class="paper-card" data-id="${p.id}">
            <span class="card-category">${escapeHtml(p.subcategory || p.category)}</span>
            <h3>${escapeHtml(p.title)}</h3>
            <div class="card-authors">${escapeHtml(p.authors.join(', '))}</div>
            <div class="card-meta">${escapeHtml(p.venue)} · ${p.year}</div>
            <div class="card-highlight">${escapeHtml(p.highlight)}</div>
            <div class="card-footer">
                ${p.github ? `<a href="${p.github}" target="_blank" onclick="event.stopPropagation();">GitHub</a>` : ''}
                <span style="color:var(--text-muted);">Click for details →</span>
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.paper-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const paper = appData.papers[id];
            if (paper) openModal(paper);
        });
    });
}

// ───────────────────────────────
// Modal
// ───────────────────────────────
function openModal(paper) {
    const body = document.getElementById('modal-body');

    const metricsHtml = paper.metrics ? `
        <table class="metrics-table">
            <thead>
                <tr><th>Dataset</th>${Object.keys(Object.values(paper.metrics)[0] || {}).map(k => `<th>${escapeHtml(k)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${Object.entries(paper.metrics).map(([ds, vals]) => `
                    <tr>
                        <td>${escapeHtml(ds)}</td>
                        ${Object.values(vals).map(v => `<td>${escapeHtml(v)}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p style="color:var(--text-muted);">No metrics available.</p>';

    const trainingHtml = paper.trainingSetting ? `
        <div class="kv-list">
            ${Object.entries(paper.trainingSetting).map(([k, v]) => `
                <div class="kv-item">
                    <span class="key">${escapeHtml(formatKey(k))}</span>
                    <span class="value">${escapeHtml(String(v))}</span>
                </div>
            `).join('')}
        </div>
    ` : '<p style="color:var(--text-muted);">No training settings available.</p>';

    const ablationHtml = paper.ablationStudy ? `
        <div class="ablation-list">
            ${paper.ablationStudy.map(item => `
                <div class="ablation-item">
                    <div class="ablation-aspect">${escapeHtml(item.aspect)}</div>
                    <div class="ablation-finding">${escapeHtml(item.finding)}</div>
                </div>
            `).join('')}
        </div>
    ` : '<p style="color:var(--text-muted);">No ablation study available.</p>';

    const datasetsHtml = paper.datasets ? `
        <div class="modal-tags">
            ${paper.datasets.map(d => `<span class="tag">${escapeHtml(d)}</span>`).join('')}
        </div>
    ` : '';

    const modelDiagramHtml = paper.modelDiagram ? `
        <img src="${paper.modelDiagram}" alt="Model diagram" style="max-width:100%;border-radius:8px;border:1px solid var(--border-color);">
    ` : '<p style="color:var(--text-muted);">No model diagram available. Add an image URL to <code>modelDiagram</code> field in JSON.</p>';

    body.innerHTML = `
        <div class="modal-section">
            <div class="modal-title">${escapeHtml(paper.title)}</div>
            <div class="modal-authors">${escapeHtml(paper.authors.join(', '))}</div>
            <div class="modal-venue">${escapeHtml(paper.venue)} · ${paper.year}</div>
            <div class="modal-tags">
                <span class="tag accent">${escapeHtml(paper.category)}</span>
                ${paper.subcategory ? `<span class="tag accent">${escapeHtml(paper.subcategory)}</span>` : ''}
            </div>
        </div>

        <div class="modal-section">
            <h4>Highlight</h4>
            <div class="modal-text">${escapeHtml(paper.highlight)}</div>
        </div>

        <div class="modal-section">
            <h4>Contribution</h4>
            <div class="modal-text">${escapeHtml(paper.contribution)}</div>
        </div>

        <div class="modal-section">
            <h4>Model Structure</h4>
            ${modelDiagramHtml}
        </div>

        <div class="modal-section">
            <h4>GitHub</h4>
            ${paper.github
                ? `<a class="github-link" href="${paper.github}" target="_blank">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                    ${paper.github.replace('https://github.com/', '')}
                   </a>`
                : '<p style="color:var(--text-muted);">No GitHub link available.</p>'
            }
        </div>

        <div class="modal-section">
            <h4>Training Setting</h4>
            ${trainingHtml}
        </div>

        <div class="modal-section">
            <h4>Datasets</h4>
            ${datasetsHtml || '<p style="color:var(--text-muted);">No dataset information.</p>'}
        </div>

        <div class="modal-section">
            <h4>Metrics</h4>
            ${metricsHtml}
        </div>

        <div class="modal-section">
            <h4>Ablation Study</h4>
            ${ablationHtml}
        </div>
    `;

    document.getElementById('detail-modal').classList.add('open');
    document.getElementById('modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('detail-modal').classList.remove('open');
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
}

// ───────────────────────────────
// Utilities
// ───────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatKey(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

// Start
init();
