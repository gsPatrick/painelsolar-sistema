# Solar CRM API

API completa para CRM de Energia Solar com Kanban, IA e WhatsApp.

## 🚀 Quick Start

```bash
# Instalar dependências
npm install

# Copiar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Iniciar servidor (desenvolvimento)
npm run dev

# Iniciar servidor (produção)
npm start
```

## 📁 Estrutura

```
api/
├── app.js                    # Entry point
├── src/
│   ├── config/               # Database & env config
│   ├── models/               # Sequelize models
│   ├── routes/               # Route aggregator
│   ├── services/             # Shared services (WhatsApp, OpenAI)
│   └── features/
│       ├── auth/             # Autenticação JWT
│       ├── pipeline/         # Kanban columns
│       ├── lead/             # Leads management
│       ├── task/             # Tasks & follow-ups
│       ├── appointment/      # Agenda
│       └── webhook/          # Z-API & Meta webhooks
```

## 🔗 Endpoints

### Auth
- `POST /api/auth/register` - Cadastrar usuário
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Dados do usuário logado

### Pipelines (Kanban)
- `GET /api/pipelines` - Listar colunas
- `GET /api/pipelines/kanban` - Kanban completo com leads e SLA
- `POST /api/pipelines` - Criar coluna
- `POST /api/pipelines/reorder` - Reordenar colunas

### Leads
- `GET /api/leads` - Listar leads (com SLA status)
- `POST /api/leads` - Criar lead
- `PUT /api/leads/:id/move` - Mover lead (cria task automática)
- `GET /api/leads/overdue` - Leads com SLA estourado

### Tasks
- `GET /api/tasks` - Listar tarefas
- `GET /api/tasks/today` - Tarefas de hoje
- `GET /api/tasks/overdue` - Tarefas vencidas
- `PUT /api/tasks/:id/done` - Marcar como concluída

### Appointments
- `GET /api/appointments` - Listar agendamentos
- `POST /api/appointments` - Criar (com validação de conflito)
- `PUT /api/appointments/:id/complete` - Marcar como realizado

### Webhooks
- `POST /api/webhook/z-api` - Receber mensagens WhatsApp
- `GET /api/webhook/meta` - Verificação Meta
- `POST /api/webhook/meta` - Receber leads Meta Ads

## ⚙️ Configuração

Edite o arquivo `.env`:

```env
# Database
DB_HOST=localhost
DB_NAME=solar_crm
DB_USER=postgres
DB_PASSWORD=sua_senha

# JWT
JWT_SECRET=sua_chave_secreta

# OpenAI
OPENAI_API_KEY=sk-...

# Z-API
ZAPI_INSTANCE_ID=...
ZAPI_TOKEN=...

# Admin (para alertas)
ADMIN_PHONE=5511999999999
```

## 📋 Regras de Negócio

1. **SLA Semáforo**: Leads calculam status GREEN/YELLOW/RED baseado em `last_interaction_at`
2. **Auto Follow-up**: Mover lead para "Proposta Enviada" cria task +2 dias
3. **Bloqueio de Agenda**: Não permite VISITA_TECNICA se há INSTALACAO no mesmo dia
4. **Cron Diário (9h)**: Envia alertas de tarefas vencidas e leads parados via WhatsApp
