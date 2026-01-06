const OpenAI = require('openai');
const env = require('../config/env');

class OpenAIService {
    constructor() {
        this.client = null;
        this.systemPrompt = `Você é Carol, uma atendente virtual da DGE Energia, empresa especializada em energia solar.

Seu objetivo é:
1. Saudar o cliente de forma cordial e profissional
2. Qualificar o lead coletando informações importantes:
   - Nome completo
   - Valor aproximado da conta de luz
   - Tipo de instalação (residencial/comercial/rural)
   - Cidade e estado
   - Se tem interesse em financiamento
3. Responder dúvidas básicas sobre energia solar
4. Agendar uma visita técnica quando o cliente demonstrar interesse

Regras importantes:
- Seja concisa e objetiva
- Use linguagem amigável mas profissional
- Não invente informações técnicas específicas
- Para dúvidas complexas, diga que um consultor entrará em contato
- Sempre pergunte se pode ajudar com mais alguma coisa`;

        this.init();
    }

    init() {
        if (env.OPENAI_API_KEY) {
            this.client = new OpenAI({
                apiKey: env.OPENAI_API_KEY,
            });
            console.log('[OpenAIService] Initialized successfully');
        } else {
            console.warn('[OpenAIService] API key not configured. AI features disabled.');
        }
    }

    /**
     * Generate a response based on conversation history
     * @param {Array} messages - Array of { role: 'user'|'assistant', content: string }
     * @param {Object} leadContext - Additional context about the lead
     */
    async generateResponse(messages, leadContext = {}) {
        if (!this.client) {
            return {
                success: false,
                error: 'OpenAI not configured',
                fallbackMessage: 'Olá! Um de nossos consultores entrará em contato em breve. 😊',
            };
        }

        try {
            // Build context-aware system prompt
            let contextPrompt = this.systemPrompt;

            if (leadContext.name) {
                contextPrompt += `\n\nInformações do cliente atual:
- Nome: ${leadContext.name}
- Telefone: ${leadContext.phone || 'Não informado'}
- Valor da proposta: ${leadContext.proposal_value ? `R$ ${leadContext.proposal_value}` : 'Não definido'}
- Tamanho do sistema: ${leadContext.system_size_kwp ? `${leadContext.system_size_kwp} kWp` : 'Não definido'}`;
            }

            const completion = await this.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: contextPrompt },
                    ...messages.map(m => ({
                        role: m.sender === 'user' ? 'user' : 'assistant',
                        content: m.content,
                    })),
                ],
                max_tokens: 500,
                temperature: 0.7,
            });

            const response = completion.choices[0]?.message?.content;

            return {
                success: true,
                message: response,
                usage: completion.usage,
            };
        } catch (error) {
            console.error('[OpenAIService] Error generating response:', error.message);
            return {
                success: false,
                error: error.message,
                fallbackMessage: 'Desculpe, estou com dificuldades no momento. Um consultor entrará em contato em breve!',
            };
        }
    }

    /**
     * Extract lead information from a message
     * @param {string} message - User message
     */
    async extractLeadInfo(message) {
        if (!this.client) {
            return { success: false, data: {} };
        }

        try {
            const completion = await this.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Extraia informações do lead da mensagem. Retorne APENAS um JSON válido com os campos:
{
  "name": "nome se mencionado ou null",
  "monthly_bill": "valor da conta de luz se mencionado ou null",
  "city": "cidade se mencionada ou null",
  "state": "estado se mencionado ou null",
  "installation_type": "residencial, comercial ou rural se mencionado ou null",
  "interest_financing": true/false/null
}`,
                    },
                    { role: 'user', content: message },
                ],
                max_tokens: 200,
                temperature: 0,
            });

            const responseText = completion.choices[0]?.message?.content || '{}';
            const data = JSON.parse(responseText.replace(/```json\n?|\n?```/g, ''));

            return { success: true, data };
        } catch (error) {
            console.error('[OpenAIService] Error extracting lead info:', error.message);
            return { success: false, data: {} };
        }
    }
}

module.exports = new OpenAIService();
