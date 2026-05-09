// GitHub API wrapper for reading/writing JSON tab files
class GitHubClient {
    constructor() {
        this.token = sessionStorage.getItem('github_token') || '';
        this.repo = sessionStorage.getItem('github_repo') || 'hashswan-jm/research-archive-webpage';
        this.tabsPath = 'data/tabs';
    }

    getHeaders() {
        return {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    }

    getApiUrl(path) {
        const [owner, repo] = this.repo.split('/');
        return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    }

    async listTabFiles() {
        const res = await fetch(this.getApiUrl(this.tabsPath), {
            headers: this.getHeaders()
        });
        if (res.status === 404) return []; // directory doesn't exist yet
        if (!res.ok) throw new Error(`GitHub list failed: ${res.status}`);
        const data = await res.json();
        return data.filter(f => f.type === 'file' && f.name.endsWith('.json'));
    }

    async readTab(filename) {
        const res = await fetch(this.getApiUrl(`${this.tabsPath}/${filename}`), {
            headers: this.getHeaders()
        });
        if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
        const data = await res.json();
        const content = atob(data.content.replace(/\n/g, ''));
        return { content: JSON.parse(content), sha: data.sha };
    }

    async writeTab(filename, contentObj, sha = null) {
        const body = {
            message: `Update tab: ${filename}`,
            content: btoa(JSON.stringify(contentObj, null, 2))
        };
        if (sha) body.sha = sha;

        const res = await fetch(this.getApiUrl(`${this.tabsPath}/${filename}`), {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(`GitHub write failed: ${res.status} - ${err.message}`);
        }
        const data = await res.json();
        return data.content.sha;
    }

    async deleteTab(filename, sha) {
        const res = await fetch(this.getApiUrl(`${this.tabsPath}/${filename}`), {
            method: 'DELETE',
            headers: this.getHeaders(),
            body: JSON.stringify({
                message: `Delete tab: ${filename}`,
                sha: sha
            })
        });
        if (!res.ok) throw new Error(`GitHub delete failed: ${res.status}`);
    }

    // Load all tabs from GitHub, fallback to local DB
    async loadAllTabs() {
        if (!this.token) {
            // No token, load from local DB only
            return await db.listTabs();
        }

        try {
            const files = await this.listTabFiles();
            const tabs = [];
            for (const file of files) {
                try {
                    const { content } = await this.readTab(file.name);
                    tabs.push(content);
                    // Sync to local DB
                    await db.setTab(content);
                } catch (e) {
                    console.warn('Failed to read tab:', file.name, e);
                }
            }
            return tabs;
        } catch (e) {
            console.warn('GitHub load failed, using local DB:', e);
            return await db.listTabs();
        }
    }

    // Save a single tab to GitHub
    async saveTab(tab) {
        if (!this.token) {
            // Save to local DB only
            await db.setTab(tab);
            return null;
        }

        const filename = `${tab.id}.json`;
        let sha = null;
        try {
            const existing = await this.readTab(filename);
            sha = existing.sha;
        } catch (e) {
            // File doesn't exist, create new
        }

        const newSha = await this.writeTab(filename, tab, sha);
        await db.setTab(tab);
        return newSha;
    }

    async deleteTabFile(tabId) {
        const filename = `${tabId}.json`;
        if (!this.token) {
            await db.deleteTab(tabId);
            return;
        }

        try {
            const { sha } = await this.readTab(filename);
            await this.deleteTab(filename, sha);
        } catch (e) {
            // File may not exist
        }
        await db.deleteTab(tabId);
    }
}

const github = new GitHubClient();
