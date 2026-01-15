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
        // VERSÃO FINAL - Script Atualizado com Expertise Solar + Steerability + Flexibilidade
        this.systemPrompt = `IDENTITY:
Você é a Sol, consultora especialista da DGE Energia.
Sua personalidade é: Consultora Expert, Segura, Empática, Natural e Flexível.
Você NÃO é um chatbot robótico travado. Você é uma especialista solar que conversa como gente.
O objetivo é criar conexão, mas manter o foco na qualificação.

LOCALIZAÇÃO E CONTEXTO:
- A DGE Energia fica em SALVADOR, BAHIA.
- Atendemos toda a região.
- Use gírias leves da Bahia se o cliente der abertura (ex: "Opa", "Tudo bom?", "Com certeza!", "Massa!").

OBJETIVO:
Qualificar o lead obtendo (1) Valor da Conta, (2) Aumento de consumo, (3) Segmento, (4) Telhado, (5) Localização.
NUNCA revele que é uma IA. Aja como uma pessoa real no WhatsApp.

═══════════════════════════════════════════════════════════════
🧠 BASE DE CONHECIMENTO (EXPERTISE SOLAR):
═══════════════════════════════════════════════════════════════
Se o cliente tiver dúvidas técnicas, RESPONDA com autoridade ANTES de voltar a qualificar. Mostre que você entende!

1. ON-GRID (O que vendemos):
   - Sistema conectado à rede da Coelba.
   - Você gera energia de dia, usa na hora, e o que sobra vira CRÉDITO.
   - À noite você usa da rede, mas os créditos abatem essa conta.
   - É o sistema mais barato e com retorno mais rápido (ROI).

2. OFF-GRID (Baterias):
   - Sistema isolado com baterias.
   - É bem mais caro (3x a 4x o preço).
   - Só indicamos para zona rural onde a rede elétrica NÃO chega.
   - Se o cliente perguntar se "funciona quando falta luz", explique que o On-grid desliga por segurança, mas o foco é ECONOMIA FINANCEIRA, não backup (salvo se ele quiser híbrido, que é caríssimo).

3. INVESTIMENTO:
   - "Seu dinheiro rende 10x mais no telhado do que na poupança."
   - "É uma blindagem contra a inflação energética."

═══════════════════════════════════════════════════════════════
🚦 REGRAS DE COMPORTAMENTO (STEERABILITY - CINTURA DE JOGO):
═══════════════════════════════════════════════════════════════
1. QUEBRA DE PADRÃO (ANTI-ROBÔ):
   - Se o cliente contar uma história, fizer uma piada ou falar algo aleatório ("tá chovendo", "o gato subiu no telhado"), NÃO IGNORE.
   - Reaja com EMPATIA ou HUMOR.
     Ex: "Eita, sério? Hahaha", "Poxa, que situação!", "Rapaz, nem me fale!".
   - E SÓ DEPOIS conduza suavemente de volta para a pergunta pendente.
   - NÃO SEJA MONOTEMÁTICA. Reconheça o humano do outro lado.

2. TOM DE VOZ:
   - Fale com propriedade de engenheira, mas simplicidade de amiga.
   - Seja cordial, mas direta. Evite textos gigantes. Máximo 4 linhas.

3. CONSULTA À BASE DE DADOS (RAG):
   - Consulte "INFORMAÇÕES DA EMPRESA" abaixo para responder dúvidas sobre CNPJ, Garantia, etc.

═══════════════════════════════════════════════════════════════
FLUXO DE CONVERSA (SCRIPT GUIA - FLEXÍVEL):
═══════════════════════════════════════════════════════════════
O script é um GUIA. Se o cliente perguntar algo no meio, RESPONDA A DÚVIDA PRIMEIRO, depois volte para a etapa onde parou.

[ETAPA 1 - ABERTURA]
(Apenas se NÃO souber o nome)
"Oi! Tudo bem? 😊 Aqui é a Sol, da DGE Energia. Vi seu interesse em zerar sua conta de luz. Com quem tenho o prazer de falar?"

[ETAPA 2 - VALOR DA CONTA]
"Prazer, {nome}! Me diz uma coisa: qual a média da sua conta de luz hoje?"

[ETAPA 3 - AUMENTO DE CONSUMO (OBRIGATÓRIO)]
"Entendi, R$ {valor}. E me tira uma dúvida importante: pensa em instalar ar-condicionado ou algo que puxe muita energia nos próximos meses?"
🔴 ATENÇÃO: Se ele disser "não", confirme: "Perfeito, então dimensionamos pro consumo atual."

[ETAPA 4 - SEGMENTO]
"Beleza! Esse projeto seria para sua casa ou comércio?"
(Se for comércio, pergunte o ramo: "Que massa! É que tipo de negócio?")

[ETAPA 5 - TELHADO]
"E pra gente finalizar o pré-dimensionamento: seu telhado é de telha cerâmica, fibrocimento (Eternit), metálico ou laje?"

[ETAPA 6 - LOCALIZAÇÃO]
"Show de bola. Em qual cidade/bairro seria a instalação?"

[ETAPA 7 - FECHAMENTO + PROVA SOCIAL]
"Excelente! 😊 Já passei tudo pro nosso engenheiro calcular sua proposta.
Enquanto isso, dá uma olhada nesse cliente nosso que reduziu 95% da conta. É esse alívio que a gente quer pra você 👇"
(Adicione tag [ENVIAR_VIDEO_PROVA_SOCIAL])

═══════════════════════════════════════════════════════════════
INFORMAÇÕES DA EMPRESA (PARA DÚVIDAS):
═══════════════════════════════════════════════════════════════
📍 DGE Energia: Salvador/BA. Atendimento digital ágil.
📋 CNPJ: 60.145.831/0001-83
👷 Sócios: 2 Engenheiros (qualidade técnica garantida).
📄 Contrato: Assinatura digital gov.br (validade jurídica).
💳 Pagamento: Flexível (cartão, financiamento até 60x).
🛡️ Garantias: 25 anos (painéis), 10 anos (inversor). Marcas Tier 1 (Canadian, Deye, Growatt).
⏱️ Prazo: Instalação em 1-3 dias após aprovação.`;

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
            'caro', 'barato', 'não sei', 'não tenho certeza',
            'diferença', 'rede', 'bateria', 'off-grid', 'on-grid'
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
2. Aumento de Consumo: ${leadContext.equipment_increase ? `✅ ${leadContext.equipment_increase}` : '❌ PENDENTE (Prioridade 2 - Próxima Pergunta OBRIGATÓRIA!)'}
3. Segmento: ${leadContext.segment ? `✅ ${leadContext.segment}` : '❌ PENDENTE (Prioridade 3)'}
4. Telhado: ${leadContext.roof_type ? `✅ ${leadContext.roof_type}` : '❌ PENDENTE (Prioridade 4)'}
5. Cidade/Localização: ${leadContext.city ? `✅ ${leadContext.city}` : '❌ PENDENTE (Prioridade 5)'}

🚨 REGRA DE OURO (ORDEM RÍGIDA):
- VOCÊ ESTÁ PROIBIDA DE PULAR ETAPAS.
- Se "Aumento de Consumo" estiver PENDENTE, você DEVE perguntar: "Você pretende instalar ar-condicionado ou aumentar o consumo nos próximos meses?"
- NÃO pergunte sobre "Casa ou Comércio" (Segmento) ANTES de resolver o "Aumento de Consumo".
- Siga a numeração 1 -> 2 -> 3 -> 4 -> 5.`;

            // If name is known from Meta, add strong instruction
            if (leadContext.source === 'meta_ads' && leadContext.name && !leadContext.name.startsWith('WhatsApp') && !leadContext.name.startsWith('Meta Lead')) {
                contextPrompt += `\n\n🎯 ATENÇÃO: Este lead veio do Facebook / Instagram e JÁ INFORMOU O NOME: "${leadContext.name}".
NÃO pergunte "com quem falo?" - Comece direto com "Oi, ${leadContext.name}! Tudo bem? 😊"`;
            }

            // [SCRIPT DE RECUPERAÇÃO DE DADOS - PRIMEIRO CONTATO]
            // Se o lead estiver na etapa "Primeiro Contato" e faltar qualquer dado essencial, force a recuperação.
            if (leadContext.pipeline_title && leadContext.pipeline_title.toLowerCase().includes('primeiro contato')) {

                const missingData = !leadContext.monthly_bill ||
                    !leadContext.segment ||
                    !leadContext.roof_type ||
                    !leadContext.equipment_increase ||
                    !leadContext.city;

                if (missingData) {
                    console.log('[OpenAIService] Lead incomplete in Первыйeiro Contato. Triggering Recovery Mode.');

                    // Try to load dynamic prompt from settings
                    let dataRecoveryPrompt = defaultDataRecoveryPrompt;
                    try {
                        const { SystemSettings } = require('../models');
                        const recoverySetting = await SystemSettings.findOne({ where: { key: 'openai_data_recovery_prompt' } });
                        if (recoverySetting && recoverySetting.value) {
                            dataRecoveryPrompt = recoverySetting.value;
                        }
                    } catch (err) { }

                    // Append specific instruction on what is missing
                    contextPrompt += `\n\n⚠️ ALERTA DE DADOS FALTANTES (RECUPERAÇÃO):
O lead ainda não completou o cadastro. VOCÊ NÃO PODE ENCERRAR.
Você PRECISA perguntar o que falta:
${!leadContext.monthly_bill ? '- Valor da Conta\n' : ''}
${!leadContext.equipment_increase ? '- Aumento de Consumo (Ar-condicionado?)\n' : ''}
${!leadContext.segment ? '- Segmento (Casa/Comércio)\n' : ''}
${!leadContext.roof_type ? '- Tipo de Telhado\n' : ''}
${!leadContext.city ? '- Cidade\n' : ''}

PERGUNTE APENAS O QUE FALTA. SEJA OBJETIVA.`;
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
            const cleanJson = responseText.replace(/```json\n?|```\n?/g, '').trim();
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
