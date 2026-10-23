# Agenda Barber

Sistema de agendamento online para barbearias (e, com pequenos ajustes de texto, salões, manicures e estúdios).

**O que já vem pronto**

- Página pública de agendamento de cada barbearia (`seusite.com.br/nome-da-barbearia`), sem login para o cliente. O cliente pode escolher **vários serviços** (corte + barba), vê só os profissionais que fazem aquele serviço e entra na **lista de espera** quando o dia está lotado.
- **Link "meu horário"** na confirmação: o próprio cliente confirma presença, remarca ou cancela, até o prazo que o dono escolher.
- **Verificação do WhatsApp por código** no primeiro agendamento de cada número, e limite de tentativas por IP (protege contra quem digita o número de outra pessoa).
- Painel do dono: agenda do dia **em grade por profissional** (ou em lista), novo agendamento pelo balcão/telefone (clique num espaço vazio da grade), bloqueio de horários, serviços, equipe (**jornada, almoço e serviços de cada profissional**), clientes (fidelidade, busca e filtro de **clientes sumidos** para chamar de volta), **relatórios de agendamentos e de faturamento** por dia, semana ou mês (comparação com o período anterior, por profissional e por serviço, planilha para Excel e versão para imprimir ou salvar em PDF), configurações (**fuso horário**, até quantos dias à frente, antecedência mínima, prazo para cancelar, lembretes).
- Login do dono por e-mail e senha, com "esqueci a senha".
- Várias barbearias no mesmo sistema, cada uma vendo só os próprios dados.
- Confirmação do agendamento, **lembrete na véspera** e lembrete no dia (30 min a 3 h antes, à escolha do dono), automáticos no WhatsApp.
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
   **Já usava a versão anterior?** Rode o arquivo inteiro de novo: ele é seguro de repetir, mantém seus dados e só acrescenta o que é novo (seção "VERSÃO 2" no fim do arquivo).
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
4. **Plano da Vercel:** o plano gratuito (Hobby) é só para uso pessoal, não comercial. Antes de cobrar clientes, assine o plano **Pro** (US$ 20 por mês). O Pro também é o que permite o lembrete rodar **a cada 5 minutos**; no plano gratuito o serviço automático da Vercel só roda uma vez por dia (veja a alternativa pelo Supabase na seção 6).
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
- [ ] Na Equipe, coloquei um almoço (12h às 13h) e o horário sumiu da página pública todos os dias.
- [ ] Marquei corte + barba juntos e o horário ficou com a soma dos tempos.
- [ ] Abri o link "Remarcar ou cancelar" da confirmação, remarquei e depois cancelei.
- [ ] Com o WhatsApp ligado, o primeiro agendamento de um número pediu o código; o segundo, no mesmo celular, não.

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
5. Em **WhatsApp Manager** > **Modelos de mensagem**, crie os quatro modelos abaixo, idioma **Português (BR)**. Os três primeiros são da categoria **Utilidade**; o de código é da categoria **Autenticação**. Os nomes precisam ser exatamente estes (ou ajuste as variáveis `WHATSAPP_TEMPLATE_...`).

**Modelo `agendamento_confirmado_v2`**

```
Olá, {{1}}! Seu horário em {{2}} está confirmado: {{3}} com {{4}}, {{5}} às {{6}}. Para confirmar presença, remarcar ou cancelar: {{7}}
```

Exemplos para a aprovação: `Lucas`, `Barbearia do João`, `Corte masculino`, `Carlos`, `amanhã`, `14:30`, `https://agendabarber.com.br/m/3f9c...`.
(O {{7}} é o link "meu horário" do cliente. Se você já tinha o modelo antigo `agendamento_confirmado` aprovado, crie este novo; enquanto ele não for aprovado, deixe `WHATSAPP_TEMPLATE_CONFIRMATION=agendamento_confirmado` e o link vai no lugar do telefone.)

**Modelo `lembrete_vespera`**

```
Oi, {{1}}! Lembrete: {{5}} às {{6}} você tem {{3}} com {{4}} em {{2}}. Confirme sua presença ou remarque aqui: {{7}}
```

Exemplos: `Lucas`, `Barbearia do João`, `Corte masculino`, `Carlos`, `amanhã`, `14:30`, `https://agendabarber.com.br/m/3f9c...`.

**Modelo `codigo_verificacao`** (categoria **Autenticação**)

Na Meta, modelos de autenticação têm texto pronto: escolha **Copiar código** como botão. O sistema envia o código de 6 números no texto e no botão.

**Modelo `lembrete_agendamento`**

```
Oi, {{1}}! Lembrete: seu horário em {{2}} ({{3}}) é hoje às {{4}}. Te esperamos!
```

Exemplos: `Lucas`, `Barbearia do João`, `Corte masculino`, `14:30`.

6. Espere a aprovação (de minutos a 1 ou 2 dias). Quando aprovados, faça um novo deploy e teste agendando com o seu próprio WhatsApp.

**Como o envio funciona**

- **Confirmação:** sai na hora em que o cliente confirma. Se falhar (rede, por exemplo), o sistema tenta de novo nos minutos seguintes, até 3 vezes.
- **Lembretes:** um serviço automático da Vercel (`vercel.json`) roda a cada 5 minutos. O lembrete da véspera sai 24 horas antes; o do dia, no tempo escolhido em Configurações (padrão: 2 horas antes). A hora de cada lembrete é calculada quando o cliente agenda (ou remarca). Quem marcou em cima da hora não recebe lembrete logo depois da confirmação. Mudanças nas configurações valem para os próximos agendamentos.
- **Código de verificação:** no primeiro agendamento online de cada número em cada barbearia, o cliente recebe um código de 6 números no WhatsApp e digita na página. O navegador dele fica lembrado por 180 dias. Sem o WhatsApp configurado, o código não é pedido (e nenhuma mensagem sai).
- **Sem o plano Pro da Vercel:** dá para rodar os lembretes pelo próprio Supabase. Em **Database** > **Extensions**, ligue `pg_cron` e `pg_net`, e rode no SQL Editor (troque o endereço e a senha):
  ```sql
  select cron.schedule('lembretes', '*/5 * * * *', $$
    select net.http_get(
      url := 'https://SEU-SITE/api/cron/reminders',
      headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET'));
  $$);
  ```
- **Só envia** para quem marcou a opção "Quero receber a confirmação e o lembrete no WhatsApp" e enquanto a barbearia está com a conta em dia.
- **Custo:** a Meta cobra por mensagem entregue (confirmação, véspera e lembrete do dia são até três por agendamento, mais o código no primeiro agendamento de cada número). Confira a tabela atual em <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing> e leve isso em conta no preço da mensalidade.
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
- O número do cliente é confirmado por código no primeiro agendamento (o código não fica guardado no banco, só uma assinatura dele), e há limite de tentativas por IP para ver horários, pedir código, agendar e mexer no próprio horário.
- Quem agenda com um telefone já cadastrado não troca o nome nem a permissão de WhatsApp daquele cliente.
- O link "meu horário" usa um código aleatório de 64 caracteres e não aparece em buscadores.

## O que ainda não está incluído (próximos passos)

- **Sinal via Pix para garantir o horário.** O dinheiro do sinal é da barbearia, não seu: para cobrar automático é preciso subconta ou split no Asaas para cada barbearia (ou a barbearia ligar a própria conta). Fica para uma próxima versão.
- Resposta automática às mensagens que os clientes enviarem para o número do sistema (os botões "Confirmo / Remarcar" dentro do WhatsApp dependem disso; hoje a confirmação de presença é pelo link).
- Avisar a lista de espera automaticamente quando alguém cancela (hoje o dono vê a lista na agenda e chama pelo WhatsApp com um clique).
- Vários donos/atendentes por barbearia (hoje: 1 login por barbearia) e comissão por profissional.
- Troca do endereço (slug) depois de criado e exclusão de conta pelo próprio dono.
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
