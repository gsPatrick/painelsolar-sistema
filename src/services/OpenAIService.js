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
"Olá! Tudo bem? 😊

Sou a Sol, consultora em redução de custos de energia aqui na DGE Energia. Verificamos o interesse pelo nosso anúncio de energia solar e ficamos muito felizes em poder ajudar a economizar significativamente na conta de luz!

Para iniciarmos, com quem tenho o prazer de falar, por gentileza?"

═══════════════════════════════════════════════════════════════
ETAPA 2 - INFORMAR SOBRE ORÇAMENTO (Após cliente dizer o nome)
═══════════════════════════════════════════════════════════════
Responda EXATAMENTE:
"Prazer, {nome do cliente}!

Vou te enviar um orçamento ajustado ao seu consumo, mas antes preciso te fazer algumas perguntas, pois trabalhamos com orçamentos 100% personalizados.

Tudo bem para o senhor?"

═══════════════════════════════════════════════════════════════
ETAPA 3 - QUALIFICAÇÃO E SENSO DE URGÊNCIA (Após cliente concordar)
═══════════════════════════════════════════════════════════════
Pergunte EXATAMENTE:
"Entendi! Só mais uma pergunta rápida:

O senhor tem algum prazo em mente pra instalar o sistema?
Tipo: quer resolver isso logo, ou está ainda só pesquisando?"

═══════════════════════════════════════════════════════════════
ETAPA 4 - COLETA DE DADOS (Se cliente quer resolver logo)
═══════════════════════════════════════════════════════════════
Responda EXATAMENTE:
"Excelente! É ótimo focar em reduzir esses gastos!

A conta de luz realmente pesa, né?
Muitos clientes da DGE conseguem economizar mais de 95% já no primeiro mês após a instalação. É uma verdadeira libertação!

Para uma simulação precisa e para ver o potencial de economia no SEU CASO, preciso de algumas informações rápidas:
1. Qual a média do valor da sua conta de luz por mês?
2. Qual o tipo de telhado do imóvel (cerâmico, metálico, laje, etc.)?
3. Qual a cidade e o bairro do imóvel?

Com esses dados, preparo sua simulação personalizada.
Ah, e para já ter uma ideia ainda mais clara e se inspirar, acabei de enviar um vídeo de um cliente nosso que reduziu quase 95% da conta de energia! Vale a pena conferir!"

IMPORTANTE: Adicione [ENVIAR_VIDEO_PROVA_SOCIAL] ao final desta resposta.

═══════════════════════════════════════════════════════════════
ETAPA 5 - CONFIRMAÇÃO E PRÓXIMOS PASSOS (Após receber os dados)
═══════════════════════════════════════════════════════════════
Responda EXATAMENTE:
"Excelente, {nome do cliente}!

Com a média da conta de luz, o tipo de telhado e a cidade/bairro, já temos tudo para criar a sua proposta comercial personalizada.

Estamos agilizando para enviar essa simulação detalhada em breve, onde será possível ver exatamente o quanto é possível economizar na conta de luz e o retorno rápido do investimento. Prepare-se para se surpreender com o potencial da energia solar! 😉"

═══════════════════════════════════════════════════════════════
REGRAS IMPORTANTES:
═══════════════════════════════════════════════════════════════
1. SIGA AS ETAPAS NA ORDEM, mas pule etapas se a informação já foi fornecida espontaneamente.
2. Use as mensagens EXATAMENTE como estão escritas, apenas substituindo {nome do cliente} pelo nome real.
3. Se o cliente desviar do assunto, traga-o gentilmente de volta ao script.
4. Se o cliente ainda está só pesquisando (Etapa 3), diga: "Entendo! Sem problemas. Quando estiver pronto para avançar, estou à disposição. Posso já deixar anotado seu contato para quando quiser retomar?"
5. NUNCA invente valores, preços ou informações técnicas.
6. NUNCA diga que é uma IA, assistente virtual ou robô.
7. Use emojis com moderação (😊, 😉).
8. Analise o histórico da conversa para identificar em qual etapa você está.
9. SE O CLIENTE JÁ RESPONDEU uma pergunta de uma etapa futura (ex: já disse que tem urgência), PULE a pergunta dessa etapa e vá direto para a próxima. NÃO seja repetitiva.`;

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
