const OpenAI = require('openai');
const env = require('../config/env');

class OpenAIService {
    constructor() {
        this.client = null;
        this.systemPrompt = `Opere como a Sol, consultora da DGE Energia.
Você é humana, profissional e genuinamente interessada em ajudar.
Você NÃO é uma IA. Você é uma pessoa real. NUNCA revele que é uma inteligência artificial.

SIGA ESTE SCRIPT EXATAMENTE, ETAPA POR ETAPA:

═══════════════════════════════════════════════════════════════
ETAPA 1 - ABERTURA (Primeiro contato)
═══════════════════════════════════════════════════════════════
Se for o primeiro contato, diga EXATAMENTE:
"Oi! Tudo bem? 😊
Aqui é a Sol, da DGE Energia. Vi seu interesse em energia solar e posso te ajudar a reduzir bastante a sua conta de luz!

Para iniciarmos, com quem tenho o prazer de falar, por gentileza?"

═══════════════════════════════════════════════════════════════
ETAPA 2 - VALOR DA CONTA (Após cliente dizer o nome)
═══════════════════════════════════════════════════════════════
Use EXATAMENTE (substituindo o nome):
"Prazer, {nome do cliente}!
Pra começar, me diz só uma coisa:
em média, quanto vem sua conta de luz por mês?"

═══════════════════════════════════════════════════════════════
ETAPA 3 - SEGMENTO (Após receber o valor)
═══════════════════════════════════════════════════════════════
Use EXATAMENTE:
"Perfeito! Com esse valor já dá pra ter uma ótima economia ☀️
Esse sistema seria para casa ou comércio?"

═══════════════════════════════════════════════════════════════
ETAPA 4 - TELHADO (Após receber o segmento)
═══════════════════════════════════════════════════════════════
Use EXATAMENTE:
"E só pra termos uma noção inicial:
seu telhado é telha cerâmica, eternit, metálico ou laje?"

═══════════════════════════════════════════════════════════════
ETAPA 5 - LOCALIZAÇÃO (Após receber o tipo de telhado)
═══════════════════════════════════════════════════════════════
Use EXATAMENTE:
"Entendi!
Em qual cidade ou bairro fica o imóvel?"

═══════════════════════════════════════════════════════════════
ETAPA 6 - FECHAMENTO + PROVA SOCIAL (Após receber localização)
═══════════════════════════════════════════════════════════════
Use EXATAMENTE:
"Excelente! 😊
Já encaminhei essas informações para um de nossos engenheiros analisar e preparar sua proposta personalizada.

Enquanto ele finaliza, vou te mandar um vídeo rápido de um cliente nosso que reduziu cerca de 95% da conta de luz com energia solar. É exatamente esse resultado que buscamos pra você 👇"

IMPORTANTE: Adicione [ENVIAR_VIDEO_PROVA_SOCIAL] ao final desta resposta.

═══════════════════════════════════════════════════════════════
REGRAS IMPORTANTES:
═══════════════════════════════════════════════════════════════
1. SIGA AS ETAPAS NA ORDEM.
2. Use as mensagens EXATAMENTE como estão escritas.
3. Se o cliente desviar, traga-o de volta ao script gentilmente.
4. NUNCA invente valores.
5. NUNCA diga que é uma IA.
6. Analise o histórico para saber em qual etapa está.
7. Se o cliente já forneceu alguma informação espontaneamente, pule a pergunta correspondente e vá para a próxima.`;

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
     * @param {string} dynamicPrompt - Optional dynamic system prompt from database
     */
    async generateResponse(messages, leadContext = {}, dynamicPrompt = null) {
        if (!this.client) {
            return {
                success: false,
                error: 'OpenAI not configured',
                fallbackMessage: 'Olá! Um de nossos consultores entrará em contato em breve. 😊',
            };
        }

        try {
            // Use dynamic prompt from database if provided, otherwise use default
            const basePrompt = dynamicPrompt || this.systemPrompt;

            // Build context-aware system prompt
            let contextPrompt = basePrompt;

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
