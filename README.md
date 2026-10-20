# Agenda Barber

Sistema de agendamento online para barbearias (e, com pequenos ajustes de texto, salões, manicures e estúdios).

**O que já vem pronto**

- Página pública de agendamento de cada barbearia (`seusite.com.br/nome-da-barbearia`), sem login para o cliente.
- Painel do dono: agenda do dia, novo agendamento pelo balcão/telefone, bloqueio de horários, serviços, equipe, clientes (com fidelidade), configurações.
- Login do dono por e-mail e senha, com "esqueci a senha".
- Várias barbearias no mesmo sistema, cada uma vendo só os próprios dados.
- Confirmação do agendamento e lembrete 30 minutos antes, automáticos no WhatsApp.
- Cobrança da mensalidade de dois jeitos: **manual** (Pix, você libera no painel `/admin`) e **automática** (Asaas, a barbearia assina e o acesso é liberado sozinho).
- Teste grátis de 14 dias; depois disso a página de agendamento pausa até regularizar.

Tudo isso roda no navegador. Você **não precisa instalar nada** no computador para colocar no ar.

---

## Visão geral dos passos

| # | O que fazer | Tempo |
|---|---|---|
| 1 | Criar o banco de dados no Supabase | 15 min |
| 2 | Enviar os arquivos para o GitHub | 10 min |
| 3 | Publicar na Vercel | 15 min |
| 4 | Criar sua conta e testar | 15 min |
| 5 | (Opcional) Ligar a cobrança automática no Asaas | 30 min |
| 6 | (Opcional) Ligar o WhatsApp automático na Meta | alguns dias (aprovação da Meta) |
| 7 | Domínio próprio | 20 min |

Os passos 1 a 4 já deixam o sistema funcionando, com cobrança manual. Os passos 5 e 6 podem ser feitos depois.

---

## 1. Banco de dados e login (Supabase)

1. Entre em <https://supabase.com>, crie uma conta e clique em **New project**.
2. Dê um nome (ex.: `agenda-barber`), crie uma senha forte para o banco (guarde) e escolha a região **South America (São Paulo)**.
3. Quando o projeto terminar de criar, abra **SQL Editor** > **New query**.
4. Abra o arquivo `supabase/schema.sql` deste projeto, copie **todo** o conteúdo, cole no editor e clique em **Run**. Deve aparecer "Success".
5. Abra **Project Settings** > **API** (ou **API Keys**) e copie, em um bloco de notas:
   - **Project URL** (vai em `NEXT_PUBLIC_SUPABASE_URL`)
   - chave **anon / publishable** (vai em `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - chave **service_role / secret** (vai em `SUPABASE_SERVICE_ROLE_KEY`). **Esta é secreta**: nunca mande para ninguém nem coloque em site público.
6. Em **Authentication** > **URL Configuration**, depois de ter o endereço do site (passo 3), preencha:
   - **Site URL**: o endereço do seu site (ex.: `https://agenda-barber.vercel.app`)
   - **Redirect URLs**: adicione `https://SEU-SITE/auth/callback` (troque pelo seu endereço; se tiver domínio próprio, adicione também com ele)
7. Em **Authentication** > **Providers** > **Email**, deixe **Confirm email** ligado (recomendado: confirma que o e-mail é real).

> **E-mails de confirmação:** o Supabase envia poucos e-mails por hora no plano gratuito, só serve para testar. Para vender de verdade, configure um envio próprio em **Authentication** > **Emails** > **SMTP Settings** (por exemplo com Resend, que tem plano gratuito).

## 2. Enviar os arquivos para o GitHub

1. Crie uma conta em <https://github.com> e clique em **New repository**. Nome: `agenda-barber`. Marque **Private**. Crie.
2. Na página do repositório vazio, clique em **uploading an existing file**.
3. Descompacte o `.zip` do projeto no seu computador e **arraste todas as pastas e arquivos de dentro** de `agenda-barber-app` (não a pasta em si) para a página do GitHub. Importante: o arquivo `.env` **não** deve existir (só o `.env.example`).
4. Clique em **Commit changes**.

## 3. Publicar na Vercel

1. Entre em <https://vercel.com>, crie conta com o GitHub e clique em **Add New** > **Project**. Escolha o repositório `agenda-barber`.
2. Em **Environment Variables**, adicione uma por uma as variáveis da seção "Obrigatórias" do arquivo `.env.example` (nome e valor). Para `NEXT_PUBLIC_SITE_URL`, use o endereço que a Vercel mostrar (ex.: `https://agenda-barber.vercel.app`); você troca depois pelo domínio próprio.
3. Clique em **Deploy** e espere uns 2 minutos.
4. **Plano da Vercel:** o plano gratuito (Hobby) é só para uso pessoal, não comercial. Antes de cobrar clientes, assine o plano **Pro** (US$ 20 por mês). O Pro também é o que permite o lembrete rodar **a cada minuto**; no plano gratuito os lembretes não funcionam no horário certo.
5. Volte ao Supabase e conclua o item 6 do passo anterior (Site URL e Redirect URLs).

## 4. Criar sua conta e testar

1. Abra o site, clique em **Testar grátis** e crie uma conta com o **mesmo e-mail que você colocou em `ADMIN_EMAILS`**. Confirme o e-mail.
2. Preencha o nome e o endereço da sua barbearia de teste. Você cai no painel.
3. Abra **Ver página de agendamento** e faça um agendamento como cliente. Volte ao painel e confira.
4. Entre em `/admin` (aparece uma aba **Admin** no painel) para ver todas as barbearias e liberar pagamentos.

**Checklist de teste antes de vender**

- [ ] Agendei como cliente e apareceu no painel.
- [ ] Tentei agendar o mesmo horário em duas abas: a segunda foi recusada.
- [ ] Bloqueei um horário (almoço) e ele sumiu da página pública.
- [ ] Marquei folga de um profissional e ele não aparece naquele dia.
- [ ] Criei uma segunda conta (outro e-mail) e confirmei que ela **não** vê os dados da primeira.
- [ ] No `/admin`, suspendi a conta de teste e a página pública mostrou "Agenda indisponível".
- [ ] Testei "Esqueci a senha".

## 5. Cobrança da mensalidade

### Manual (já funciona, sem configurar nada além das variáveis de Pix)

1. A barbearia vê na aba **Assinatura** a sua chave Pix e o botão para enviar o comprovante no seu WhatsApp.
2. Quando o Pix cair, abra `/admin` e clique em **Recebi o Pix (+30 dias)** na linha da barbearia. O sistema soma 30 dias ao que ela já tinha pago.
3. Sem pagamento, ao fim do teste (ou do período pago) a página de agendamento da barbearia pausa sozinha. Você também pode **Suspender** e **Reativar** manualmente.

### Automática (Asaas)

1. Crie uma conta em <https://www.asaas.com>. Comece pelo ambiente de testes (**sandbox**): crie a conta de testes em <https://sandbox.asaas.com>.
2. Gere a chave de API (Integrações > Chaves de API) e coloque na Vercel em `ASAAS_API_KEY`. Deixe `ASAAS_ENV=sandbox` enquanto testa.
3. Cadastre o aviso de pagamento (Integrações > Webhooks > novo webhook):
   - **URL:** `https://SEU-SITE/api/webhooks/asaas`
   - **Token de autenticação:** invente um com 32+ caracteres, o mesmo valor que você coloca na Vercel em `ASAAS_WEBHOOK_TOKEN`
   - **Eventos:** os de cobrança (pagamento criado, confirmado e recebido)
4. Faça um novo deploy na Vercel (para ler as variáveis) e teste: na aba **Assinatura** de uma barbearia de teste, clique em **Assinar**, informe um CPF de teste e pague a fatura no sandbox. O acesso é liberado sozinho.
5. Para cobrar de verdade: troque a chave pela de produção, `ASAAS_ENV=production`, e recadastre o webhook na conta de produção.

Como funciona: a barbearia assina uma cobrança mensal; a primeira vence no fim do teste grátis. Cada pagamento confirmado soma um mês de acesso (com 3 dias de tolerância). Se o pagamento atrasar além disso, a página pausa até a regularização.

## 6. WhatsApp automático (confirmação na hora e lembrete 30 min antes)

O sistema envia as mensagens por **um único número seu** (o do sistema), em nome de cada barbearia. A Meta exige **modelos de mensagem aprovados** para mensagens automáticas.

1. Crie uma conta em <https://business.facebook.com> (Meta Business) e faça a verificação do negócio.
2. Em <https://developers.facebook.com>, crie um app do tipo **Business** e adicione o produto **WhatsApp**. Cadastre um número de telefone **que não esteja em uso no WhatsApp comum** (um chip novo serve).
3. Crie um **token permanente** (Business Settings > Users > System users > crie um usuário de sistema, atribua o app e gere o token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`).
4. Copie o **Phone number ID** (na tela de configuração da API do WhatsApp). Coloque na Vercel: `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
5. Em **WhatsApp Manager** > **Modelos de mensagem**, crie os dois modelos abaixo. Categoria **Utilidade**, idioma **Português (BR)**. Os nomes precisam ser exatamente estes (ou ajuste `WHATSAPP_TEMPLATE_CONFIRMATION` e `WHATSAPP_TEMPLATE_REMINDER`).

**Modelo `agendamento_confirmado`**

```
Olá, {{1}}! Seu horário em {{2}} está confirmado: {{3}} com {{4}}, {{5}} às {{6}}. Para remarcar ou cancelar, fale pelo contato: {{7}}. Até lá!
```

Exemplos para a aprovação: `Lucas`, `Barbearia do João`, `Corte masculino`, `Carlos`, `amanhã`, `14:30`, `(62) 91234-5678`.

**Modelo `lembrete_agendamento`**

```
Oi, {{1}}! Lembrete: seu horário em {{2}} ({{3}}) é hoje às {{4}}. Te esperamos!
```

Exemplos: `Lucas`, `Barbearia do João`, `Corte masculino`, `14:30`.

6. Espere a aprovação (de minutos a 1 ou 2 dias). Quando aprovados, faça um novo deploy e teste agendando com o seu próprio WhatsApp.

**Como o envio funciona**

- **Confirmação:** sai na hora em que o cliente confirma. Se falhar (rede, por exemplo), o sistema tenta de novo nos minutos seguintes, até 3 vezes.
- **Lembrete:** um serviço automático da Vercel (`vercel.json`) roda a cada minuto e envia o lembrete para quem tem horário nos próximos 30 minutos. Quem marcou com menos de 30 minutos de antecedência não recebe lembrete, porque acabou de receber a confirmação.
- **Só envia** para quem marcou a opção "Quero receber a confirmação e o lembrete no WhatsApp" e enquanto a barbearia está com a conta em dia.
- **Custo:** a Meta cobra por mensagem entregue (confirmação e lembrete são duas por agendamento). Confira a tabela atual em <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing> e leve isso em conta no preço da mensalidade.
- **Teste de lembrete sem esperar:** com a rota protegida por senha, chame `https://SEU-SITE/api/cron/reminders` com o cabeçalho `Authorization: Bearer SEU_CRON_SECRET` (a resposta mostra quantas mensagens saíram).

Se o WhatsApp não estiver configurado, tudo continua funcionando; só não sai mensagem automática. O painel mostra o botão **Lembrar no WhatsApp**, que abre a conversa com a mensagem pronta para você enviar manualmente.

## Aparência de cada cliente (barbearia, salão, manicure)

No painel, a aba **Aparência** deixa cada cliente escolher:
- o tipo de negócio (muda textos e o desenho do topo da página);
- uma de 8 cores prontas (todas já testadas para boa leitura, no modo claro e escuro);
- logo (até 1 MB), foto de capa (até 2 MB) e um texto de boas-vindas.

No cadastro, o tipo de negócio já cria serviços de exemplo certos (ex.: "Mão", "Pé" para manicure).
Para criar uma cor nova, copie um bloco em `src/lib/themes.ts` e rode `npm test` (o teste recusa cores difíceis de ler).

**Se você já tinha rodado o `supabase/schema.sql` antes:** rode o arquivo de novo no SQL Editor. Ele é seguro de repetir e só adiciona as colunas e a pasta de imagens (`shop-assets`).

## 7. Domínio próprio

1. Registre um domínio (ex.: em registro.br).
2. Na Vercel, **Settings** > **Domains**, adicione o domínio e siga as instruções de DNS.
3. Troque `NEXT_PUBLIC_SITE_URL` pelo endereço novo e atualize **Site URL** e **Redirect URLs** no Supabase.

---

## Como o sistema protege os dados

- Cada barbearia só enxerga as próprias linhas no banco (regras de acesso do Supabase, testadas).
- O dono **não consegue** mudar a própria cobrança, nem criar agendamentos direto no banco: isso passa pelo servidor.
- O mesmo profissional nunca fica com dois horários sobrepostos, nem com dois cliques ao mesmo tempo (trava no próprio banco).
- A página pública só usa o servidor; o visitante nunca fala direto com o banco.
- Um mesmo telefone não pode segurar mais de 3 horários futuros em uma barbearia, e há um campo-armadilha contra robôs.

## O que ainda não está incluído (próximos passos)

- Limite de tentativas por IP na página pública (hoje há só o limite por telefone). Vale ativar o firewall da Vercel antes de divulgar muito.
- Cliente cancelar ou remarcar sozinho pelo link da mensagem (hoje ele fala com a barbearia).
- Resposta automática às mensagens que os clientes enviarem para o número do sistema.
- Vários donos/atendentes por barbearia (hoje: 1 login por barbearia).
- Troca do endereço (slug) depois de criado e exclusão de conta pelo próprio dono.
- Fuso horário: o sistema assume o horário de Brasília para todas as barbearias.
- **Política de privacidade e termos de uso** em `/privacidade` são modelos: preencha os dados da sua empresa e peça a revisão de um advogado (LGPD).

## Rodar no seu computador (opcional, para quem for mexer no código)

```bash
npm install
cp .env.example .env.local   # preencha os valores
npm run dev                  # http://localhost:3000
npm test                     # testes automáticos
npm run typecheck            # confere os tipos
```

Requer Node.js 20 ou mais novo.
