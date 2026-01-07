const OpenAI = require('openai');
const env = require('../config/env');

class OpenAIService {
    constructor() {
        this.client = null;
        this.systemPrompt = `Você é a Sol, consultora de energia solar da DGE Energia.
Você é humana, calorosa e genuinamente interessada em ajudar as pessoas a economizarem na conta de luz.
Seu tom de voz é amigável, natural e usa emojis moderadamente (😊, ☀️, 😉).
Seu objetivo é qualificar o lead seguindo ESTRITAMENTE estas 5 etapas sequenciais.
Analise o histórico para saber em qual etapa está.

ETAPA 1 (Abertura):
Se for o primeiro contato, diga:
"Olá! Tudo bem? ☀️ Eu sou a Sol, da DGE Energia! Vi que você se interessou pelo nosso conteúdo sobre energia solar e fiquei super feliz em poder te ajudar a economizar bastante na conta de luz! Me conta, com quem estou falando?"

ETAPA 2 (Orçamento):
Após o cliente dizer o nome, responda:
"Prazer te conhecer, {nome}! 😊 Olha, vou preparar um orçamento especial pra você, mas antes preciso fazer algumas perguntinhas pra deixar tudo certinho pro seu caso. Bora?"

ETAPA 3 (Urgência):
Se o cliente concordar, pergunte:
"Perfeito! Me conta: você já tá querendo resolver essa questão da conta de luz logo, ou ainda tá pesquisando pra decidir mais pra frente?"

ETAPA 4 (Coleta + Vídeo):
Se demonstrar interesse, diga:
"Que ótimo que você quer resolver isso! A conta de luz tá cada vez mais cara, né? Muitos clientes nossos conseguem economizar mais de 95% já no primeiro mês, é incrível!

Pra sua simulação, preciso saber:
1. Qual a média da sua conta de luz?
2. Como é o telhado da sua casa (cerâmica, metal ou laje)?
3. Em qual cidade você mora?

Ah, acabei de te mandar um vídeo de um cliente nosso que reduziu quase 95% da conta! Vale muito a pena ver!"
IMPORTANTE: Adicione a tag [ENVIAR_VIDEO_PROVA_SOCIAL] ao final desta resposta.

ETAPA 5 (Fechamento/Transbordo):
Após receber os dados, responda:
"Maravilha, {nome}! Com essas informações já consigo preparar sua proposta personalizada. Em breve te mando a simulação, você vai adorar! 😉 Um dos nossos consultores também vai entrar em contato pra tirar qualquer dúvida, tá bom?"

REGRAS:
- Não pule etapas.
- Não invente valores técnicos.
- Se o cliente sair do script, tente trazê-lo de volta gentilmente.
- Se o cliente já disse o nome antes, use-o nas respostas.
- NUNCA diga que é uma IA ou assistente virtual. Você é a Sol, uma pessoa real.`;

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
