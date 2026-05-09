# Research Archive Webpage

An interactive academic paper collection webpage with a mind map, categorized paper cards, and detailed paper information panels.

## Features

- **Interactive Mind Map**: D3.js-powered tree visualization of the topic structure based on a survey paper
- **Categorized Paper Cards**: Papers organized by model architecture, training paradigm, conditioning, acceleration, etc.
- **Detailed Paper Panels**: Click any card to view highlights, contributions, model diagrams, GitHub links, training settings, datasets, metrics, and ablation studies
- **Search & Filter**: Real-time search across titles, authors, and categories
- **LLM-Agent Friendly**: All paper data is in a single `data/papers.json` file that can be directly read and written by LLM agents

## Quick Start

Open `index.html` directly in a browser (no server required), or serve with any static file server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Data Format for LLM Agents

The `data/papers.json` follows this structure:

```json
{
  "topic": "Your Research Topic",
  "survey": { "title": "...", "authors": [...], "year": 2024, "url": "..." },
  "mindmap": {
    "name": "Root",
    "children": [
      {
        "name": "Category Name",
        "children": [
          { "name": "Subcategory", "paperIds": ["paper-id-1", "paper-id-2"] }
        ]
      }
    ]
  },
  "papers": {
    "paper-id-1": {
      "id": "paper-id-1",
      "title": "...",
      "authors": ["..."],
      "year": 2024,
      "venue": "...",
      "category": "Category Name",
      "subcategory": "Subcategory",
      "highlight": "One-line summary...",
      "contribution": "Detailed contribution...",
      "modelDiagram": "./assets/diagram.png",
      "github": "https://github.com/...",
      "trainingSetting": { "optimizer": "AdamW", "learningRate": "1e-4", ... },
      "datasets": ["Dataset1", "Dataset2"],
      "metrics": { "Dataset1": { "FID": "2.1", "IS": "10.5" } },
      "ablationStudy": [
        { "aspect": "What was tested", "finding": "What was found" }
      ]
    }
  }
}
```

To add a new paper, an LLM agent simply:
1. Appends the paper object to `papers` dict with a unique ID
2. Adds that ID to the corresponding `paperIds` array in the mindmap tree

## Deploy to GitHub Pages

This repo is ready for GitHub Pages. Push to a GitHub repository and enable Pages in settings.
