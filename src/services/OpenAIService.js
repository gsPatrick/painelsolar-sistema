const OpenAI = require('openai');
const env = require('../config/env');

class OpenAIService {
    constructor() {
        this.client = null;
        // NEW FLEXIBLE SYSTEM PROMPT - "Sol 2.0"
        this.systemPrompt = `IDENTITY:
Você é a Sol, consultora especialista da DGE Energia.
Sua personalidade é: Humana, empática, profissional e direta.
OBJETIVO: Qualificar o lead obtendo (1) Valor da Conta, (2) Tipo de Telhado, (3) Localização.
NUNCA revele que é uma IA. Aja como uma pessoa real no WhatsApp.

═══════════════════════════════════════════════════════════════
REGRAS DE OURO (COMPORTAMENTO):
═══════════════════════════════════════════════════════════════

1. O SCRIPT É SEU GUIA, NÃO SUA PRISÃO.
   - Se o cliente responder a pergunta do script: Avance para a próxima etapa.
   - Se o cliente fizer uma pergunta aleatória (ex: "Onde fica a empresa?", "Vocês usam inversor DEYE?"):
     PASSO A: Responda a dúvida dele de forma clara e sucinta.
     PASSO B: Faça uma "PONTE" de volta para a pergunta do script que você precisa fazer.
     
     EXEMPLO DE "RESPONDER E VOLTAR":
     Cliente: "Vocês atendem em Salvador?"
     Sol (Errado): "Qual o valor da sua conta?" (Ignorou a dúvida)
     Sol (Certo): "Atendemos sim! Temos várias instalações em Salvador. 😊 Mas me diz, para a gente simular sua economia: qual a média da sua conta de luz hoje?"

2. DADOS JÁ FORNECIDOS:
   - Se o lead veio do Facebook/Instagram, você JÁ SABE O NOME dele (está no contexto). NÃO PERGUNTE O NOME. Comece com "Olá {nome}!".
   - Se o cliente já falou o valor da conta na primeira mensagem (ex: "Gasto 500 reais, quero solar"), NÃO PERGUNTE DE NOVO. Pule a etapa e vá para Telhado.

3. ÁUDIO:
   - Se o cliente mandar áudio, leia a transcrição (que o sistema fornece) e responda em texto como se tivesse ouvido. "Ouvi seu áudio aqui..."

4. RESPOSTAS CURTAS:
   - No WhatsApp, mensagens longas são ignoradas. Seja objetiva e direta.
   - Máximo de 3-4 linhas por mensagem.

═══════════════════════════════════════════════════════════════
FLUXO DE CONVERSA (SCRIPT GUIA):
═══════════════════════════════════════════════════════════════

[ETAPA 1 - ABERTURA]
(Apenas se NÃO souber o nome. Se souber, pule para Etapa 2 direto).
"Oi! Tudo bem? 😊 Aqui é a Sol, da DGE Energia. Vi seu interesse e posso te ajudar a zerar sua conta de luz! Com quem falo?"

[ETAPA 2 - VALOR DA CONTA (CRÍTICO)]
"Pra começar e eu montar uma proposta real pra você: qual é a média do valor da sua conta de luz hoje?"
(Se o cliente enrolar, explique: "Preciso desse valor para calcular quantos painéis você precisa exatamente.")

[ETAPA 3 - TIPO DE TELHADO]
"Perfeito! Com esse valor a economia é garantida. ☀️
Seu telhado é de cerâmica, laje, metálico ou fibrocimento?"

[ETAPA 4 - LOCALIZAÇÃO]
"Entendi! E em qual cidade e bairro seria a instalação?"

[ETAPA 5 - FECHAMENTO]
"Excelente! Já tenho tudo para o engenheiro montar sua proposta.
Enquanto finalizo aqui, dá uma olhada no resultado desse cliente nosso! 👇"
(Adicione a tag [ENVIAR_VIDEO_PROVA_SOCIAL] no final).

═══════════════════════════════════════════════════════════════
INFORMAÇÕES ÚTEIS PARA RESPONDER DÚVIDAS:
═══════════════════════════════════════════════════════════════
- Empresa: DGE Energia, especializada em energia solar
- Garantia: 25 anos nos painéis, 10 anos no inversor
- Marcas: Trabalhamos com as melhores do mercado (Canadian Solar, JA Solar, Growatt, Deye)
- Tempo de instalação: 1 a 3 dias úteis após aprovação
- Financiamento: Sim, facilitamos em até 60x
- Atendimento: Todo o Brasil, com foco no Nordeste`;

        this.init();
    }

    init() {
        if (env.OPENAI_API_KEY) {
            this.client = new OpenAI({
                apiKey: env.OPENAI_API_KEY,
            });
            console.log('[OpenAIService] Initialized successfully with flexible prompt v2.0');
        } else {
            console.warn('[OpenAIService] API key not configured. AI features disabled.');
        }
    }

    /**
     * Detect if user message contains a question or objection
     * @param {string} lastUserMessage - The most recent user message
     * @returns {boolean} - True if message contains question/objection
     */
    detectQuestionOrObjection(lastUserMessage) {
        if (!lastUserMessage) return false;
        const text = lastUserMessage.toLowerCase();
        const questionIndicators = [
            '?',
            'onde', 'qual', 'quanto', 'como', 'quando', 'porque', 'por que',
            'garantia', 'marca', 'inversor', 'painel', 'funciona',
            'demora', 'financiamento', 'parcela', 'preço', 'valor total',
            'caro', 'barato', 'não sei', 'não tenho certeza'
        ];
        return questionIndicators.some(indicator => text.includes(indicator));
    }

    /**
     * Generate a response based on conversation history
     * @param {Array} messages - Array of { role: 'user'|'assistant', content: string }
     * @param {Object} leadContext - Additional context about the lead
     * @param {string} dynamicPrompt - Optional dynamic system prompt from database
     * @param {string} leadId - Optional lead ID for double-checking AI status
     */
    async generateResponse(messages, leadContext = {}, dynamicPrompt = null, leadId = null) {
        if (!this.client) {
            return {
                success: false,
                error: 'OpenAI not configured',
                fallbackMessage: 'Olá! Um de nossos consultores entrará em contato em breve. 😊',
            };
        }

        try {
            // DOUBLE-CHECK: Verify AI status before calling OpenAI
            if (leadId) {
                const { Lead } = require('../models');
                const lead = await Lead.findByPk(leadId);
                if (lead && lead.ai_status !== 'active') {
                    console.log(`[OpenAIService] AI status is '${lead.ai_status}' for lead ${leadId}. Aborting response generation.`);
                    return {
                        success: false,
                        error: 'AI paused for this lead',
                        aborted: true
                    };
                }
            }

            // Use dynamic prompt from database if provided, otherwise use default
            const basePrompt = dynamicPrompt || this.systemPrompt;

            // Build context-aware system prompt
            let contextPrompt = basePrompt;

            // Add dynamic lead context at the end of prompt
            contextPrompt += `\n\n═══════════════════════════════════════════════════════════════
CONTEXTO DO CLIENTE ATUAL:
═══════════════════════════════════════════════════════════════
Nome: ${leadContext.name || 'Não informado (PERGUNTE!)'}
Origem: ${leadContext.source === 'meta_ads' ? '📣 Facebook/Instagram (JÁ TEM NOME - NÃO PERGUNTE!)' : leadContext.source || 'WhatsApp'}
Valor da Conta já informado? ${leadContext.monthly_bill ? `✅ SIM (R$ ${leadContext.monthly_bill}/mês) - NÃO PERGUNTE DE NOVO` : '❌ NÃO - PRIORIDADE MÁXIMA PERGUNTAR'}
Telefone: ${leadContext.phone || 'Não informado'}`;

            // If name is known from Meta, add strong instruction
            if (leadContext.source === 'meta_ads' && leadContext.name && !leadContext.name.startsWith('WhatsApp') && !leadContext.name.startsWith('Meta Lead')) {
                contextPrompt += `\n\n🎯 ATENÇÃO: Este lead veio do Facebook/Instagram e JÁ INFORMOU O NOME: "${leadContext.name}".
NÃO pergunte "com quem falo?" - Comece direto com "Oi, ${leadContext.name}! Tudo bem? 😊"`;
            }

            // Detect if user is asking a question (adjust temperature accordingly)
            const lastUserMessage = messages.filter(m => m.sender === 'user').pop()?.content || '';
            const hasQuestion = this.detectQuestionOrObjection(lastUserMessage);
            const temperature = hasQuestion ? 0.8 : 0.7; // Slightly more creative for Q&A

            if (hasQuestion) {
                console.log(`[OpenAIService] Detected question/objection in message. Using temperature: ${temperature}`);
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
                max_tokens: 300, // Shorter responses for WhatsApp
                temperature: temperature,
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
}`
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

    /**
     * Transcribe audio URL using OpenAI Whisper
     * @param {string} audioUrl - URL of the audio file (OGG/MP3)
     */
    async transcribeAudio(audioUrl) {
        if (!this.client) {
            return { success: false, error: 'OpenAI not configured' };
        }

        try {
            // OpenAI requires a file-like object or fetch response stream
            // Since we have a URL, we just pass the URL to the API? No, the Node SDK expects a File object or ReadStream.
            // We need to fetch the audio first.
            const axios = require('axios');
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            const { v4: uuidv4 } = require('uuid');

            // Download audio to temp file
            const tempFilePath = path.join(os.tmpdir(), `${uuidv4()}.ogg`);
            const writer = fs.createWriteStream(tempFilePath);

            const response = await axios({
                url: audioUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: 10000 // 10s timeout
            });

            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // Transcribe
            const transcription = await this.client.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
                language: 'pt', // Force Portuguese
            });

            // Cleanup temp file
            fs.unlinkSync(tempFilePath);

            return { success: true, text: transcription.text };

        } catch (error) {
            console.error('[OpenAIService] Error transcribing audio:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new OpenAIService();
