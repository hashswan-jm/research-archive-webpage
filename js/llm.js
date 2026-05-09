// OpenAI API wrapper for LLM-powered parsing
class LLMClient {
    constructor() {
        this.apiKey = sessionStorage.getItem('openai_key') || '';
        this.model = sessionStorage.getItem('llm_model') || 'gpt-4o';
        this.baseUrl = 'https://api.openai.com/v1/chat/completions';
    }

    async call(messages, temperature = 0.3) {
        if (!this.apiKey) throw new Error('OpenAI API key not configured');

        const res = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages,
                temperature,
                response_format: { type: 'json_object' }
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`OpenAI API error: ${res.status} - ${err.error?.message || 'Unknown'}`);
        }

        const data = await res.json();
        return data.choices[0].message.content;
    }

    async parseSurvey(text) {
        const prompt = `You are an academic research assistant. Given the following survey paper text, extract the main topic, sections/categories, and key papers mentioned in each section.

Return ONLY a JSON object in this exact format:
{
  "topic": "Survey Title",
  "sections": [
    {
      "title": "Section Name",
      "papers": [
        {"title": "Paper Title", "authors": ["Author1", "Author2"], "year": 2024, "url": ""}
      ]
    }
  ]
}

Survey text:
${text}`;

        const result = await this.call([
            { role: 'system', content: 'You are a precise academic research assistant. Output valid JSON only.' },
            { role: 'user', content: prompt }
        ]);

        try {
            return JSON.parse(result);
        } catch (e) {
            // Try to extract JSON from markdown code block
            const match = result.match(/```json\n([\s\S]*?)\n```/);
            if (match) return JSON.parse(match[1]);
            throw new Error('Failed to parse LLM response as JSON');
        }
    }

    async extractPaper(title, authors, year, text) {
        const prompt = `Given this paper information, extract and summarize the following aspects in markdown format.

Return a JSON object with these exact keys: method, training, datasets, metrics, ablation.
Each value should be markdown text (can include tables, lists, code blocks).

1. **method**: Model architecture, key components, loss functions, innovations, objectives
2. **training**: Training paradigm, optimization details, hyperparameters, tricks
3. **datasets**: Training and evaluation datasets used
4. **metrics**: Key quantitative results in markdown table format
5. **ablation**: Important ablation findings

Paper: ${title}
Authors: ${authors}
Year: ${year}
Text/Abstract: ${text || 'Not provided'}`;

        const result = await this.call([
            { role: 'system', content: 'You are a precise academic research assistant. Output valid JSON with markdown values.' },
            { role: 'user', content: prompt }
        ]);

        try {
            const parsed = JSON.parse(result);
            // Ensure all required keys exist
            return {
                method: parsed.method || '',
                training: parsed.training || '',
                datasets: parsed.datasets || '',
                metrics: parsed.metrics || '',
                ablation: parsed.ablation || ''
            };
        } catch (e) {
            const match = result.match(/```json\n([\s\S]*?)\n```/);
            if (match) {
                const parsed = JSON.parse(match[1]);
                return {
                    method: parsed.method || '',
                    training: parsed.training || '',
                    datasets: parsed.datasets || '',
                    metrics: parsed.metrics || '',
                    ablation: parsed.ablation || ''
                };
            }
            throw new Error('Failed to parse LLM response as JSON');
        }
    }
}

const llm = new LLMClient();
