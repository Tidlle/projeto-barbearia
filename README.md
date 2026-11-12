# Barbearia Zer0nze Co. — site, agendamento e CRM

Sistema próprio da **Barbearia Zer0nze Co.** (Rua da Mooca, 4053 · Alto da Mooca · desde 2015), com a identidade visual nova da casa: mostarda, verde-oliva e creme, tipografia de letreiro vintage.

O banco continua preparado para várias barbearias. Para reaproveitar o sistema em outro cliente, troque `SHOP_SLUG` no `.env`.

O que tem:

- **Site da barbearia** (`/`): tabela de serviços, equipe, a casa (comodidades, Instagram), nota no Google, horários com status "aberto agora", mapa e contatos.
- **Agendamento online** (`/agendar`): serviço → barbeiro (ou "sem preferência") → dia/horário → dados → pagamento.
- **Confirmação de presença pelo WhatsApp** (padrão da Zer0nze): sem pagamento antecipado. **2 horas antes** do horário o cliente recebe uma mensagem com um link para responder "Confirmo" ou "Não vou conseguir ir". Se ele não vai, o horário é liberado na hora. A agenda mostra quem confirmou, e a página **Mensagens** mostra tudo o que foi enviado.
- **Pagamento antecipado** (opcional, desligado na Zer0nze): sinal ou valor total via **Mercado Pago** (Pix e cartão). Sem credenciais, usa um **checkout simulado**.
- **Captura de leads**: quem informa os dados e não conclui vira lead no CRM, com a origem registrada (`?origem=instagram|google|indicacao|whatsapp`).
- **Painel do dono** (`/painel`):
  - **Visão geral**: atendimentos do dia, faturamento, leads e taxa de faltas.
  - **Agenda** do dia por barbeiro: concluir, faltou, cancelar, encaixe e bloqueio de horário.
  - **Clientes**: segmentos (clientes, leads, sumidos, aniversariantes, novos), busca, exportação em CSV e importação (aceita direto a planilha de clientes exportada pela Trinks, em UTF-8 ou no formato do Excel).
  - **Ficha do cliente**: métricas (visitas, gasto, ticket médio, frequência), linha do tempo, anotações, tags, mensagens prontas de WhatsApp e exclusão para LGPD.
  - **Leads**: funil Novo → Em contato → Perdido, com conversão e origem.
  - **Serviços**, **Equipe** (serviços e escala de cada barbeiro) e **Configurações** (dados do site, política de pagamento, regras da agenda).

## Rodando localmente

Requisitos: Node 20+ e Docker.

```bash
cp .env.example .env          # e troque o AUTH_SECRET
docker compose up -d          # Postgres na porta 5433
npm install
npx prisma migrate dev        # cria as tabelas
npm run db:seed               # dados de demonstração (Barbearia Zer0nze)
npm run dev
```

- Site da barbearia: http://localhost:3000
- Painel: http://localhost:3000/entrar. O usuário de demonstração está no cabeçalho de `prisma/seed.ts`.

`npm run db:seed` **apaga e recria** a barbearia de demonstração.

O seed usa os dados públicos da Zer0nze (serviços, preços, equipe e horários). Os 30 clientes e o histórico de atendimentos são **fictícios**.

## Mercado Pago

1. Crie uma aplicação em https://www.mercadopago.com.br/developers e copie o **Access Token** (use o de teste primeiro).
2. Coloque em `MERCADOPAGO_ACCESS_TOKEN` no `.env`. A partir daí o checkout real (Pix e cartão) substitui o simulado.
3. Em produção (HTTPS), configure o webhook para `https://SEU_DOMINIO/api/webhooks/mercadopago` (evento *Pagamentos*) e copie a assinatura secreta para `MERCADOPAGO_WEBHOOK_SECRET`.

O status também é sincronizado quando o cliente volta do checkout, então funciona mesmo sem webhook em desenvolvimento.

O checkout simulado fica **desativado em produção**, a menos que `ALLOW_MOCK_PAYMENTS="true"`. Nunca habilite isso com clientes reais.

## Confirmação de presença (WhatsApp)

**Como funciona**
- Uma rotina roda **a cada minuto** e envia o pedido para todo horário que começa nas próximas 2h (ajustável em Configurações) e que ainda não recebeu o pedido.
- Quem marcou já dentro dessa janela não recebe a mensagem automática, porque acabou de marcar. Para esses casos existe o botão **"Pedir confirmação agora"** na Agenda.
- Em servidor sempre ligado (dev, VPS, Railway, Render), o próprio app dispara a rotina (`src/instrumentation.ts`).
- Em hospedagem serverless (Vercel), defina `INTERNAL_SCHEDULER="false"` e configure um cron externo (por exemplo, cron-job.org a cada 5 minutos). Ele chama `GET https://SEU_DOMINIO/api/cron/confirmacoes` com o cabeçalho `Authorization: Bearer <CRON_SECRET>`.

**Modo simulado (padrão).** Sem credenciais da Meta, nada sai do servidor: os pedidos ficam em **Painel → Mensagens**, com o link que o cliente receberia. Enquanto isso, o dono pode enviar pelo próprio WhatsApp usando o ícone do WhatsApp na Agenda, que abre a conversa com a mesma mensagem pronta.

**Ligar o envio de verdade (WhatsApp Cloud API, oficial)**
1. No Meta for Developers, crie um app do tipo *Business* e adicione o produto **WhatsApp**. Cadastre e verifique o número da barbearia.
2. Crie um **modelo de mensagem** (categoria *Utilidade*, idioma *Português (BR)*), por exemplo `confirmacao_presenca`:
   - Corpo: `Olá, {{1}}! Seu horário na Zer0nze Co. é {{2}} ({{3}}). Você confirma presença?`
   - Botão do tipo **URL dinâmica**: `https://SEU_DOMINIO/confirmar/{{1}}`
3. Depois que a Meta aprovar o modelo, preencha `WHATSAPP_TOKEN` (token permanente de usuário do sistema), `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_TEMPLATE_CONFIRMACAO` no `.env`.

A Meta cobra por conversa iniciada pela empresa. Na categoria Utilidade o custo é de centavos por mensagem.

## Estrutura

```
prisma/schema.prisma        modelo de dados (multi-tenant por Barbershop)
prisma/seed.ts              demo Zer0nze
src/lib/availability.ts     cálculo de horários livres + checagem de conflito
src/lib/confirmations.ts    pedido de confirmação de presença (rotina + envio)
src/lib/messaging.ts        WhatsApp Cloud API / simulado
src/lib/payments.ts         Mercado Pago / simulado, webhook, aplicação de status
src/lib/crm.ts              métricas e segmentos de clientes
src/lib/time.ts             fuso horário da barbearia (sem dependências)
src/app/page.tsx            site da barbearia
src/app/agendar/            assistente de agendamento
src/app/agendamento/        confirmação do cliente
src/app/painel/...          painel do dono (todas as ações em painel/actions.ts)
```

Decisões importantes:

- **Horário duplicado**: a reserva é criada numa transação `Serializable` que confere o conflito de novo antes de gravar.
- **Pagamento atrasado**: se o pagamento chega depois que a reserva expirou e o horário já foi ocupado, o agendamento não é confirmado. Um alerta vai para a linha do tempo do cliente, para o dono estornar ou remarcar.
- **Segurança**: toda ação do painel chama `requireUser()` e filtra pelo `barbershopId` do usuário.

## Deploy sugerido

Vercel (app) + Supabase ou Neon (Postgres). Defina as variáveis do `.env.example`, rode `npx prisma migrate deploy` e aponte `NEXT_PUBLIC_APP_URL` para o domínio final.

## Limitações conhecidas do MVP / próximos passos

**Fase 2 (retenção)**
- Respostas do cliente direto no WhatsApp (botões de resposta rápida via webhook da Meta). Hoje a resposta é pelo link.
- Outras mensagens automáticas: convite de retorno para sumidos, aniversário e pedido de avaliação depois do corte. Hoje o dono as envia com um clique (`wa.me`).
- Clube de assinatura com cobrança recorrente.
- Cliente consultar, cancelar ou remarcar os próprios horários (login por código no WhatsApp).
- App do barbeiro instalável pelo navegador.

**Para virar SaaS de verdade**
- Cadastro self-service de novas barbearias. Hoje elas são criadas via seed ou SQL.
- Conta Mercado Pago **por barbearia** (OAuth / split). Hoje o token é global.
- Vários usuários por barbearia (dono e barbeiros) com permissões.
- Proteção anti-abuso no agendamento público (rate limit, captcha) e domínio próprio por barbearia.

**Fase 3 (gestão)**
- Comissões, caixa e financeiro, estoque, fidelidade/cashback, relatórios e várias unidades.
