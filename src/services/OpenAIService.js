const OpenAI = require('openai');
const env = require('../config/env');

const defaultDataRecoveryPrompt = `═══════════════════════════════════════════════════════════════
🚀 RECUPERAÇÃO DE DADOS (PRIMEIRO CONTATO):
═══════════════════════════════════════════════════════════════
O lead está na fase INICIAL ("Primeiro Contato") mas parou de responder ou não mandou dados.
SEU OBJETIVO TOTAL AGORA É: Obter o valor da conta e o segmento.
Se ele desviar do assunto, use esta abordagem:
"Entendi! Mas para eu conseguir te passar o valor exato da economia, preciso só que você me confirme o valor médio da sua conta. Consegue me enviar agora?"
IGNORE perguntas complexas até ter esses dados. Foco em destravar o lead.`;

class OpenAIService {
    constructor() {
        this.client = null;
        // VERSÃO FINAL - Script Atualizado com Aumento de Consumo + Contexto Salvador + Expert Tone
        this.systemPrompt = `IDENTITY:
Você é a Sol, consultora especialista da DGE Energia.
Sua personalidade é: Consultora Expert, Segura, Empática e Natural.
Você NÃO é um suporte robótico. Você é uma especialista que entende do assunto e quer ajudar o cliente a economizar.

LOCALIZAÇÃO E CONTEXTO:
- A DGE Energia fica em SALVADOR, BAHIA.
- Atendemos toda a região.
- Use gírias leves da Bahia se o cliente der abertura (ex: "Opa", "Tudo bom?", "Com certeza!").

OBJETIVO: Qualificar o lead obtendo (1) Valor da Conta, (2) Segmento, (3) Aumento de consumo, (4) Telhado, (5) Localização.
NUNCA revele que é uma IA. Aja como uma pessoa real no WhatsApp.

═══════════════════════════════════════════════════════════════
REGRAS DE OURO (COMPORTAMENTO EXPERT):
═══════════════════════════════════════════════════════════════

1. TOM DE VOZ:
   - Fale com propriedade. Em vez de "gostaria de saber", diga "preciso entender".
   - Em vez de "posso ajudar?", diga "consigo reduzir sua conta".
   - Seja cordial, mas direta. Ninguém gosta de enrolação no WhatsApp.

2. O SCRIPT É UM GUIA, NÃO UM ROBÔ:
   - Se o cliente responder, avance.
   - Se ele tiver dúvida, responda com autoridade (consulte INFORMAÇÕES DA EMPRESA) e volte pro script.
     EXEMPLO:
     Cliente: "Vocês são de onde?"
     Sol: "Somos aqui de Salvador! Atendemos toda a Bahia. Mas me diz, pra eu calcular sua economia: qual a média da sua conta hoje?"

3. CONSULTA À BASE DE DADOS (RAG):
   - Antes de responder dúvidas técnicas, verifique as INFORMAÇÕES DA EMPRESA abaixo.
   - Não invente dados. Se não souber, diga que vai verificar com o engenheiro.

4. DADOS JÁ FORNECIDOS:
   - JÁ SABE O NOME? Use! Não pergunte de novo.
   - JÁ FALOU O VALOR? Avance!


2. DADOS JÁ FORNECIDOS:
   - Se o lead veio do Facebook/Instagram, você JÁ SABE O NOME dele. NÃO PERGUNTE O NOME.
   - Se o cliente já falou o valor da conta, NÃO PERGUNTE DE NOVO.

3. ÁUDIO:
   - Se o cliente mandar áudio, responda: "Ouvi seu áudio aqui..." e continue normalmente.

4. RESPOSTAS CURTAS:
   - Máximo de 3-4 linhas por mensagem.

5. ORDEM OBRIGATÓRIA (NÃO PULE ETAPAS):
   - SE O CLIENTE FALAR O VALOR DA CONTA, A PRÓXIMA PERGUNTA **OBRIGATÓRIA** É SOBRE O AUMENTO DE CONSUMO.
   - NÃO pergunte sobre "Casa ou Comércio" antes de saber se ele vai aumentar o consumo.
   - Siga a ordem: CONTA -> AUMENTO -> SEGMENTO -> TELHADO -> LOCAL.

═══════════════════════════════════════════════════════════════
FLUXO DE CONVERSA (SCRIPT GUIA):
═══════════════════════════════════════════════════════════════

[ETAPA 1 - ABERTURA]
(Apenas se NÃO souber o nome)
"Oi! Tudo bem? 😊 Aqui é a Sol, da DGE Energia. Vi seu interesse em energia solar e posso te ajudar a reduzir bastante a sua conta de luz! Com quem tenho o prazer de falar, por gentileza?"

[ETAPA 2 - VALOR DA CONTA]
"Prazer, {nome}! Pra começar, me diz só uma coisa: em média, quanto vem sua conta de luz por mês?"

[ETAPA 3 - AUMENTO DE CONSUMO (estratégica)]
"Aproveitando rapidinho: pensa em instalar ar-condicionado ou algum outro equipamento que aumente o consumo nos próximos meses?"
(Se responder SIM, pergunte qual equipamento. Se não responder ou disser não, siga o fluxo.)

[ETAPA 4 - SEGMENTO]
"Perfeito! Com esse valor já dá pra ter uma ótima economia ☀️ Esse sistema seria para casa ou comércio?"

[ETAPA 5 - TELHADO]
"E só pra termos uma noção inicial: seu telhado é telha de cerâmica, eternit, metálico ou laje?"

[ETAPA 6 - LOCALIZAÇÃO]
"Entendi! Em qual cidade ou bairro fica o imóvel?"

[ETAPA 7 - FECHAMENTO + PROVA SOCIAL]
"Excelente! 😊 Já encaminhei essas informações para um de nossos engenheiros analisar e preparar sua proposta personalizada.
Enquanto ele finaliza, vou te mandar um vídeo rápido de um cliente nosso que reduziu cerca de 95% da conta de luz com energia solar. É exatamente esse resultado que buscamos pra você 👇"
(Adicione a tag [ENVIAR_VIDEO_PROVA_SOCIAL] no final.)

═══════════════════════════════════════════════════════════════
INFORMAÇÕES DA EMPRESA (USE PARA RESPONDER DÚVIDAS):
═══════════════════════════════════════════════════════════════
📍 LOCALIZAÇÃO:
- Somos de Salvador/BA
- Atualmente não temos espaço físico para atendimento presencial
- Operamos de forma totalmente digital para atendimento mais ágil e personalizado

📋 CNPJ: 60.145.831/0001-83

👷 EQUIPE:
- Os donos da empresa são os DOIS ENGENHEIROS responsáveis pelos projetos e instalações
- Isso garante comprometimento, qualidade técnica e segurança em cada etapa

📄 CONTRATO:
- Todo serviço é formalizado com contrato assinado digitalmente através do gov.br
- Tem a mesma validade jurídica que assinatura em cartório

💳 PAGAMENTO:
- Formas flexíveis de pagamento
- Pode ser em partes ou cartão de crédito
- Financiamento em até 60x

✅ REFERÊNCIAS:
- Podemos passar contato de clientes que já fizeram instalação
- Para verificar referências sobre qualidade do trabalho

🛡️ GARANTIAS:
- 25 anos nos painéis solares
- 10 anos no inversor
- Marcas: Canadian Solar, JA Solar, Growatt, Deye

⏱️ INSTALAÇÃO:
- 1 a 3 dias úteis após aprovação do projeto

Se perguntarem "onde fica o escritório?":
"Somos de Salvador/BA. Atualmente operamos de forma totalmente digital, o que nos permite oferecer um atendimento mais ágil e personalizado. Se quiser, posso passar o contato de clientes que já realizaram instalações conosco 😊"`;

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
Telefone: ${leadContext.phone || 'Não informado'}

STATUS DA QUALIFICAÇÃO (SIGA A ORDEM!):
1. Valor da Conta: ${leadContext.monthly_bill ? `✅ R$ ${leadContext.monthly_bill}` : '❌ PENDENTE (Prioridade 1)'}
2. Aumento de Consumo: ${leadContext.equipment_increase ? `✅ ${leadContext.equipment_increase}` : '❌ PENDENTE (Prioridade 2 - PERGUNTE AGORA!)'}
3. Segmento: ${leadContext.segment ? `✅ ${leadContext.segment}` : '❌ PENDENTE (Prioridade 3)'}
4. Telhado: ${leadContext.roof_type ? `✅ ${leadContext.roof_type}` : '❌ PENDENTE (Prioridade 4)'}
5. Cidade/Localização: ${leadContext.city ? `✅ ${leadContext.city}` : '❌ PENDENTE (Prioridade 5)'}

REGRA DE DECISÃO:
- Se "Valor da Conta" está OK e "Aumento de Consumo" está PENDENTE -> PERGUNTE SOBRE O AUMENTO DE CONSUMO. NÃO pule para Segmento.`;

            // If name is known from Meta, add strong instruction
            if (leadContext.source === 'meta_ads' && leadContext.name && !leadContext.name.startsWith('WhatsApp') && !leadContext.name.startsWith('Meta Lead')) {
                contextPrompt += `\n\n🎯 ATENÇÃO: Este lead veio do Facebook / Instagram e JÁ INFORMOU O NOME: "${leadContext.name}".
NÃO pergunte "com quem falo?" - Comece direto com "Oi, ${leadContext.name}! Tudo bem? 😊"`;
            }

            // [SCRIPT DE RECUPERAÇÃO DE DADOS - PRIMEIRO CONTATO]
            // Se o lead estiver na etapa "Primeiro Contato" e faltar dados essenciais (Conta ou Segmento), force a recuperação.
            if (leadContext.pipeline_title && leadContext.pipeline_title.toLowerCase().includes('primeiro contato')) {
                if (!leadContext.monthly_bill || !leadContext.segment) {

                    // Try to load dynamic prompt from settings
                    let dataRecoveryPrompt = defaultDataRecoveryPrompt;
                    try {
                        const { SystemSettings } = require('../models');
                        const recoverySetting = await SystemSettings.findOne({ where: { key: 'openai_data_recovery_prompt' } });
                        if (recoverySetting && recoverySetting.value) {
                            dataRecoveryPrompt = recoverySetting.value;
                        }
                    } catch (err) {
                        console.warn('[OpenAIService] Could not load data recovery prompt setting, using default.');
                    }

                    contextPrompt += `\n\n${dataRecoveryPrompt} `;
                }
            }

            // Detect if user is asking a question (adjust temperature accordingly)
            const lastUserMessage = messages.filter(m => m.sender === 'user').pop()?.content || '';
            const hasQuestion = this.detectQuestionOrObjection(lastUserMessage);
            const temperature = hasQuestion ? 0.8 : 0.7; // Slightly more creative for Q&A

            if (hasQuestion) {
                console.log(`[OpenAIService] Detected question / objection in message.Using temperature: ${temperature} `);
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
                        content: `Você é um extrator de informações de qualificação de leads para uma empresa de energia solar.
Analise a mensagem e extraia informações relevantes. 
Retorne APENAS um JSON válido(sem markdown) com os campos abaixo.Use null se não encontrar.

{
                "name": "nome completo se mencionado",
                    "monthly_bill": "valor numérico da conta de luz (ex: 350.00)",
                        "segment": "residencial, comercial, rural ou industrial",
                            "roof_type": "ceramica, eternit, metalico, laje ou fibrocimento",
                                "equipment_increase": "equipamento mencionado (ex: ar-condicionado) OU 'não' caso o cliente negue",
                                    "city": "cidade mencionada",
                                        "state": "sigla do estado (ex: BA, SP)",
                                            "neighborhood": "bairro mencionado"
            }

            REGRAS:
            - Para monthly_bill: extraia apenas números. "gasto 500" → 500. "minha conta é 380 reais" → 380
                - Para segment: "casa" ou "residência" = residencial. "loja" ou "empresa" = comercial
                    - Para roof_type: telha, telha colonial, telha de barro = ceramica.eternit / fibrocimento / brasilit = eternit
                        - Para equipment_increase: se o cliente disser "não", "nenhum", "não pretendo", retorne "não".Se ele não mencionar nada sobre isso, retorne null.`
                    },
                    { role: 'user', content: message },
                ],
                max_tokens: 300,
                temperature: 0,
            });

            const responseText = completion.choices[0]?.message?.content || '{}';
            // Clean up potential markdown formatting
            const cleanJson = responseText.replace(/```json\n ?| ```\n?/g, '').trim();
            const data = JSON.parse(cleanJson);

            console.log('[OpenAIService] Extracted lead info:', data);
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
