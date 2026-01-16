/**
 * Recover Stuck Leads Script
 * 
 * This script finds leads in "Primeiro Contato" that have completed qualification
 * (monthly_bill + city at minimum) but were never moved to "Aguardando Proposta".
 * 
 * It moves them to the correct pipeline and marks AI as paused.
 * 
 * Usage: node scripts/recover_stuck_leads.js
 */

require('dotenv').config();
const sequelize = require('../src/config/database');
const { Lead, Pipeline, Message } = require('../src/models');
const { Op } = require('sequelize');

async function recoverStuckLeads() {
    try {
        await sequelize.authenticate();
        console.log('🔌 Database connected\n');

        // Find the pipelines
        const primeiroContato = await Pipeline.findOne({ where: { title: 'Primeiro Contato' } });
        const aguardandoProposta = await Pipeline.findOne({ where: { title: 'Aguardando Proposta' } });

        if (!primeiroContato || !aguardandoProposta) {
            console.error('❌ Required pipelines not found!');
            process.exit(1);
        }

        console.log(`📍 Primeiro Contato ID: ${primeiroContato.id}`);
        console.log(`📍 Aguardando Proposta ID: ${aguardandoProposta.id}\n`);

        // Find leads stuck in "Primeiro Contato" with minimum viable data (monthly_bill + city)
        const stuckLeads = await Lead.findAll({
            where: {
                pipeline_id: primeiroContato.id,
                status: 'active',
                monthly_bill: { [Op.ne]: null },
                city: { [Op.ne]: null },
            },
            order: [['last_interaction_at', 'DESC']],
        });

        console.log(`🔍 Found ${stuckLeads.length} leads stuck in "Primeiro Contato" with data\n`);

        if (stuckLeads.length === 0) {
            console.log('✅ No stuck leads found. All good!\n');
            process.exit(0);
        }

        // Optional: Check last message for "engineer" or "proposta" keywords as extra heuristic
        for (const lead of stuckLeads) {
            const lastAiMessage = await Message.findOne({
                where: { lead_id: lead.id, sender: 'ai' },
                order: [['timestamp', 'DESC']],
            });

            const hasClosingMessage = lastAiMessage?.content?.toLowerCase().includes('engenheiro') ||
                lastAiMessage?.content?.toLowerCase().includes('proposta') ||
                lastAiMessage?.content?.toLowerCase().includes('passou tudo');

            console.log(`📋 Lead: ${lead.name} (${lead.phone})`);
            console.log(`   - Bill: R$ ${lead.monthly_bill}, City: ${lead.city}`);
            console.log(`   - Last AI: "${lastAiMessage?.content?.substring(0, 50)}..."`);
            console.log(`   - Has Closing Message: ${hasClosingMessage ? 'YES ✅' : 'NO ⚠️'}`);

            // Move lead
            lead.pipeline_id = aguardandoProposta.id;
            lead.ai_status = 'human_intervention';
            lead.ai_paused_at = new Date();
            lead.qualification_complete = true;
            await lead.save();

            console.log(`   ➡️ MOVED to "Aguardando Proposta"!\n`);
        }

        console.log(`\n✅ Done! Moved ${stuckLeads.length} leads to "Aguardando Proposta".\n`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

recoverStuckLeads();
