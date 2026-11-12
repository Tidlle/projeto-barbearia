# Navalha — agendamento, pagamento e CRM para barbearias

> "Navalha" é um nome provisório.

SaaS multi-barbearia. Cada barbearia tem:

- **Site próprio** (`/{slug}`) com serviços, equipe, avaliações do Google, horários e contato.
- **Agendamento online** (`/{slug}/agendar`): serviço → barbeiro (ou "sem preferência") → dia/horário → dados → pagamento.
- **Pagamento antecipado** (sinal % ou valor total) via **Mercado Pago** (Pix e cartão). Enquanto o cliente paga, o horário fica reservado por alguns minutos. Sem credenciais, usa um **checkout simulado**.
- **Captura de leads**: quem informa os dados e não conclui vira lead no CRM, com a origem registrada (`?origem=instagram|google|indicacao|whatsapp`).
- **Painel do dono** (`/painel`):
  - **Visão geral**: atendimentos do dia, faturamento, leads e taxa de faltas.
  - **Agenda** do dia por barbeiro: concluir, faltou, cancelar, encaixe e bloqueio de horário.
  - **Clientes**: segmentos (clientes, leads, sumidos, aniversariantes, novos), busca, importação e exportação em CSV.
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

- Site da barbearia: http://localhost:3000/zer0nze
- Painel: http://localhost:3000/entrar. O usuário de demonstração está no cabeçalho de `prisma/seed.ts`.

`npm run db:seed` **apaga e recria** a barbearia de demonstração.

O seed usa os dados públicos da Zer0nze (serviços, preços, equipe e horários). Os 30 clientes e o histórico de atendimentos são **fictícios**.

## Mercado Pago

1. Crie uma aplicação em https://www.mercadopago.com.br/developers e copie o **Access Token** (use o de teste primeiro).
2. Coloque em `MERCADOPAGO_ACCESS_TOKEN` no `.env`. A partir daí o checkout real (Pix e cartão) substitui o simulado.
3. Em produção (HTTPS), configure o webhook para `https://SEU_DOMINIO/api/webhooks/mercadopago` (evento *Pagamentos*) e copie a assinatura secreta para `MERCADOPAGO_WEBHOOK_SECRET`.

O status também é sincronizado quando o cliente volta do checkout, então funciona mesmo sem webhook em desenvolvimento.

O checkout simulado fica **desativado em produção**, a menos que `ALLOW_MOCK_PAYMENTS="true"`. Nunca habilite isso com clientes reais.

## Estrutura

```
prisma/schema.prisma        modelo de dados (multi-tenant por Barbershop)
prisma/seed.ts              demo Zer0nze
src/lib/availability.ts     cálculo de horários livres + checagem de conflito
src/lib/payments.ts         Mercado Pago / simulado, webhook, aplicação de status
src/lib/crm.ts              métricas e segmentos de clientes
src/lib/time.ts             fuso horário da barbearia (sem dependências)
src/app/[slug]/...          site público, agendamento e confirmação
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
- WhatsApp automático (API oficial da Meta): confirmação, lembrete 24h/2h, convite de retorno, aniversário e pedido de avaliação. Hoje as mensagens são abertas pelo dono com um clique (`wa.me`).
- Rotinas agendadas (cron) para lembretes e para expirar reservas pendentes. Hoje a expiração acontece quando a agenda ou o agendamento é consultado.
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
