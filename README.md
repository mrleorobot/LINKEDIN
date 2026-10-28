# Sua voz no LinkedIn

Um espaço pessoal para guardar histórias e referências, criar rascunhos com seu jeito de escrever e publicar no seu perfil do LinkedIn.

## Hospedar sem mensalidade

O projeto está preparado para a Vercel, com o banco Neon conectado pelo Marketplace. Os planos gratuitos atuais cobrem um projeto pessoal, um banco pequeno e uma rotina diária. Eles têm limites de uso: a Vercel Hobby executa o agendador uma vez por dia, e a Neon Free oferece 1 GB de banco e 100 horas de computação por mês. Não escolha um plano pago nem ative cobrança para seguir estes passos. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Neon Free](https://neon.com/pricing).

1. Coloque estes arquivos em um repositório GitHub seu. Não envie `.env` nem a pasta `data/`.
2. Na Vercel, importe o repositório e crie o projeto.
3. No Marketplace do projeto, conecte o **Neon** no plano gratuito. A integração configura `DATABASE_URL` para você.
4. Em **Settings → Environment Variables**, adicione:
   - `APP_ACCESS_PASSWORD`: uma senha para abrir seu painel.
   - `CRON_SECRET`: uma frase aleatória que só a Vercel usa para acionar a agenda.
   - `GEMINI_API_KEY`: sua chave da API gratuita do Gemini.
5. Faça o primeiro deploy. Abra a URL `*.vercel.app` que aparecer.
6. Crie um app em [LinkedIn Developers](https://www.linkedin.com/developers/), habilite **Sign In with LinkedIn using OpenID Connect** e o produto **Share on LinkedIn**. Cadastre como retorno autorizado exatamente `https://SEU-PROJETO.vercel.app/auth/linkedin/callback`.
7. Na Vercel, adicione `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` e `LINKEDIN_OAUTH_MODE=server`, depois faça um novo deploy. Abra o painel, entre com sua senha e conecte seu LinkedIn.

O endereço de retorno é montado pela Vercel automaticamente. Se usar domínio próprio, informe `APP_PUBLIC_URL` com `https://`.

### Para não gerar cobrança

- **Vercel:** use Hobby, o plano gratuito para projetos pessoais. O projeto chama a rotina automática uma vez ao dia, por volta das 10h de Natal, com variação de até 59 minutos. Posts marcados para outro horário podem aguardar a próxima conferência diária. O Hobby tem limites de uso e não oferece horário exato. [Limites dos agendamentos](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- **Neon:** conecte somente o plano Free. Ele não pede cartão e inclui até 1 GB por projeto. Se alcançar a cota, o banco pode ficar limitado até o próximo período. [Planos Neon](https://neon.com/pricing).
- **Gemini:** sua assinatura Gemini Pro não é a chave da API. Crie uma chave separada no [Google AI Studio](https://aistudio.google.com/apikey) e use um projeto no nível gratuito. A API gratuita não exige ativar cobrança, mas os modelos e limites disponíveis variam. Se a página pedir pagamento ou ativação de cobrança, pare nessa etapa; a ferramenta continua servindo para rascunhos manuais. [Cotas e preços da API Gemini](https://ai.google.dev/gemini-api/docs/pricing) · [Chaves Gemini](https://ai.google.dev/gemini-api/docs/api-key).
- **LinkedIn:** a ferramenta usa a permissão `w_member_social` para publicar como você. A autorização depende da aprovação e da configuração do app LinkedIn. [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-10).

Na cota gratuita do Gemini, o Google pode usar os textos enviados para melhorar seus produtos. A ferramenta envia seu perfil, referências escolhidas e correções para preparar um rascunho. Não inclua informações confidenciais no caderno. [Uso dos dados no nível gratuito](https://ai.google.dev/gemini-api/docs/pricing).

## Rodar no computador

O modo local não precisa de Vercel nem Neon. Instale Python 3.11 ou mais recente e abra `start-local.sh` (Linux) ou `start-local.bat` (Windows). Na primeira abertura, o inicializador prepara o ambiente e abre a ferramenta no navegador padrão. No Linux, rode `python3 install_desktop_shortcut.py` uma vez para adicionar um ícone ao menu de aplicativos; esse atalho inicia o serviço local e abre a ferramenta. No Chrome ou Edge, você também pode instalar a página local pelo botão **Instalar** para abrir a interface em uma janela própria.

Os rascunhos e as referências ficam no SQLite dentro de `data/`. O agendador publica os posts devidos enquanto a ferramenta estiver aberta e o computador estiver ligado; quando o computador dormir ou desligar, a publicação aguarda o próximo momento em que o app estiver ativo. Para gerar textos com IA, copie `.env.example` para `.env` e inclua `GEMINI_API_KEY`. Sem essa chave, ainda é possível escrever e guardar rascunhos manualmente.

No computador, o padrão usa o fluxo nativo OAuth com PKCE do LinkedIn: informe somente `LINKEDIN_CLIENT_ID` no `.env`. O LinkedIn precisa habilitar esse fluxo para o app; a documentação orienta solicitar a habilitação ao contato do LinkedIn. A autorização usa um retorno temporário em `127.0.0.1`, sem endereço público ou Client Secret. Se o fluxo nativo não for habilitado para seu app, use o fluxo hospedado pela Vercel descrito acima. [OAuth nativo com PKCE do LinkedIn](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native).

Na Vercel, o app usa o Postgres conectado pelo Marketplace e o fluxo OAuth de servidor com retorno HTTPS. A chave do LinkedIn nunca vai ao navegador. Na Vercel, o token é criptografado a partir da senha do painel; se você trocar essa senha, conecte o LinkedIn novamente.

## O que a ferramenta aprende

Adicione ao **Caderno de voz** histórias, decisões de projeto, posts antigos e aprendizados que queira usar. O Gemini também considera seu perfil, seus textos editados e suas correções recentes. Ele prepara o post como rascunho; você pode revisar, editar, copiar, salvar ou agendar. O modo automático começa desligado. Para ativá-lo, conecte o LinkedIn e adicione pelo menos três referências.

Não há leitura do seu histórico privado de publicações. A automação gratuita da Vercel verifica posts devidos uma vez por dia; para publicações pontuais e em horários diferentes, considere a variação diária ao agendar. A ferramenta oferece uma cópia JSON do perfil, do caderno e da agenda em **Conexões**.

## APIs usadas

- **Gemini API** para gerar os rascunhos, com `gemini-3.7-flash` como padrão.
- **LinkedIn OpenID Connect** para conectar o perfil pessoal.
- **LinkedIn Posts API** para publicar com sua autorização.
- **Vercel Cron** para conferir a agenda diariamente.
- **Neon Postgres** para manter os dados entre execuções da Vercel.

A função Python e o agendador são servidos pela Vercel; o arquivo SQLite local não é usado como armazenamento hospedado. [Runtime Python da Vercel](https://vercel.com/docs/functions/runtimes/python).
