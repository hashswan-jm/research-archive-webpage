// LLM API wrapper supporting OpenAI and Anthropic protocols
class LLMClient {
    constructor() {
        this.apiKey = sessionStorage.getItem('llm_api_key') || '';
        this.model = sessionStorage.getItem('llm_model') || 'gpt-4o';
        this.baseUrl = sessionStorage.getItem('llm_base_url') || '';
        this.protocol = sessionStorage.getItem('llm_protocol') || 'openai';
        this.proxyUrl = sessionStorage.getItem('llm_proxy_url') || '';
    }

    getEndpoint() {
        if (this.baseUrl) {
            // User provided custom base URL
            const url = this.baseUrl.replace(/\/$/, '');
            if (this.protocol === 'anthropic') {
                return `${url}/v1/messages`;
            }
            return `${url}/v1/chat/completions`;
        }
        // Default endpoints
        return this.protocol === 'anthropic'
            ? 'https://api.anthropic.com/v1/messages'
            : 'https://api.openai.com/v1/chat/completions';
    }

    getHeaders() {
        if (this.protocol === 'anthropic') {
            return {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            };
        }
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
        };
    }

    buildBody(messages, temperature) {
        if (this.protocol === 'anthropic') {
            // Anthropic uses 'user' / 'assistant' roles but combines system into a system param
            const systemMsg = messages.find(m => m.role === 'system');
            const userMsgs = messages.filter(m => m.role !== 'system');
            const body = {
                model: this.model,
                max_tokens: 4096,
                temperature,
                messages: userMsgs.map(m => ({ role: m.role, content: m.content }))
            };
            if (systemMsg) body.system = systemMsg.content;
            return body;
        }
        // OpenAI protocol
        return {
            model: this.model,
            messages,
            temperature,
            response_format: { type: 'json_object' }
        };
    }

    parseResponse(data) {
        if (this.protocol === 'anthropic') {
            // Anthropic: data.content[0].text
            const text = data.content?.[0]?.text;
            if (!text) throw new Error('Empty Anthropic response');
            return text;
        }
        // OpenAI: data.choices[0].message.content
        return data.choices?.[0]?.message?.content;
    }

    async call(messages, temperature = 0.3) {
        if (!this.apiKey) throw new Error('API key not configured');

        const endpoint = this.getEndpoint();
        const headers = this.getHeaders();
        const body = JSON.stringify(this.buildBody(messages, temperature));

        let url = endpoint;
        let fetchHeaders = headers;
        let fetchBody = body;

        if (this.proxyUrl) {
            const proxy = this.proxyUrl.replace(/\/$/, '');
            url = `${proxy}/?target=${encodeURIComponent(endpoint)}`;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: fetchHeaders,
            body: fetchBody
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => 'Unknown');
            throw new Error(`LLM API error: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        const content = this.parseResponse(data);
        if (!content) throw new Error('Empty LLM response');
        return content;
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
