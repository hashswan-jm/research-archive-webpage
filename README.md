# Research Archive

An interactive academic paper management tool with tabbed surveys, editable paper blocks, LLM-powered parsing, and GitHub-backed storage.

## Features

- **Tab Management**: Create/delete tabs for different surveys
- **Survey Parsing**: Paste survey text or URL, then use LLM to auto-extract sections and papers
- **Tree Navigation**: Collapsible tree view of sections and papers
- **Markdown Editor**: Edit paper details with Method / Training / Datasets / Metrics / Ablation tabs
- **Image Support**: Paste or upload images directly into paper blocks (base64 embedded)
- **LLM Auto-fill**: Use OpenAI API to auto-extract structured content from paper info
- **GitHub Storage**: Save/load tab data directly from your GitHub repository
- **Export/Import**: Backup and restore all data as JSON

## Quick Start

Open `index.html` in a browser (no server required), or deploy to GitHub Pages.

### 1. Configure Settings

Click **Settings** in the top right:

- **GitHub Token**: Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope
- **Repository**: Your GitHub repo (e.g. `username/repo-name`)
- **OpenAI API Key**: Your OpenAI API key for LLM parsing
- **LLM Model**: Choose model (gpt-4o, gpt-4o-mini, etc.)

Settings are stored in `sessionStorage` (cleared when browser closes) for security.

### 2. Create a Tab

Click **+** in the tab bar:
- Enter tab name
- Choose source: URL, pasted text, or manual (no survey)
- Check "Parse with LLM" to auto-extract sections and papers
- Click **Create**

### 3. Edit Papers

- Click a paper in the left tree to open the editor
- Edit title, authors, year, URL in the header
- Switch tabs: **Method / Training / Datasets / Metrics / Ablation**
- Write markdown in the editor
- Paste images with `Ctrl+V` or use the Upload button
- Click **Save Paper** to save to local cache
- Click **Auto-fill (LLM)** to let AI extract content

### 4. Save to GitHub

Click **Save** in the top bar to persist the current tab to your GitHub repository as a JSON file in `data/tabs/`.

### 5. Export/Import

- **Export JSON**: Download all tabs as a single JSON file
- **Import JSON**: Restore from a previously exported file

## Data Storage

### GitHub API (Primary)
Each tab is stored as a JSON file in your repo at `data/tabs/{tab-id}.json`.

### IndexedDB (Local Cache)
Data is also cached locally in the browser for offline access.

### JSON Schema

```json
{
  "id": "uuid",
  "name": "Diffusion Models Survey",
  "surveyUrl": "https://arxiv.org/abs/...",
  "surveyText": "...",
  "createdAt": "2024-01-01T00:00:00Z",
  "sections": [
    {
      "id": "sec-uuid",
      "title": "Model Architecture",
      "paperIds": ["paper-uuid-1"]
    }
  ],
  "papers": {
    "paper-uuid-1": {
      "id": "paper-uuid-1",
      "title": "DDPM",
      "authors": ["Jonathan Ho", "Ajay Jain", "Pieter Abbeel"],
      "year": 2020,
      "url": "https://arxiv.org/abs/2006.11239",
      "content": {
        "method": "## Method\nU-Net with...",
        "training": "## Training\nAdam...",
        "datasets": "## Datasets\nCIFAR-10...",
        "metrics": "## Metrics\n| Dataset | FID |\n|---------|-----|\n| CIFAR-10 | 3.17 |",
        "ablation": "## Ablation\n- Loss type: ..."
      },
      "images": {
        "modelDiagram": "data:image/png;base64,..."
      }
    }
  }
}
```

## For LLM Agents

This tool is designed to be agent-friendly. An LLM agent can:

1. Read/write tab JSON files via the GitHub API at `data/tabs/*.json`
2. Use the same schema as shown above
3. The webpage will automatically load updated files on refresh

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Enable GitHub Pages in repo Settings
3. Visit your Pages URL
4. Configure Settings with your tokens
