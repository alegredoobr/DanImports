# Catálogo de Perfumes

Vitrine mobile-first (React + Vite) com painel `/admin`, usando Supabase (banco, login e fotos) e pronta para a Vercel. Pedidos por WhatsApp; sem carrinho nem pagamento nesta etapa.

Depois de publicado, **preços, fotos, disponibilidade e dados da loja são alterados pelo `/admin`**, sem mexer no código e sem novo deploy.

---

## 1. Configurar o Supabase

1. Crie um projeto em <https://supabase.com> (plano gratuito serve).
2. No menu **SQL Editor**, abra uma consulta nova, cole o conteúdo de **`supabase/01_schema.sql`** e clique em **Run**.
   Isso cria as tabelas, o bucket de fotos `product-images` (público para leitura, 5 MB, só JPG/PNG/WebP) e todas as políticas de acesso:
   - visitantes só leem produtos **visíveis**;
   - só o administrador grava no banco e no armazenamento.
3. Em outra consulta, cole **`supabase/02_seed_products.sql`** e clique em **Run**. Importa os 59 produtos do PDF (nomes, valores e categorias exatos).
   - Pode rodar de novo sem duplicar nada: usa `ON CONFLICT DO NOTHING`, então **suas edições nunca são sobrescritas**. O app nunca importa nada sozinho (nem ao reiniciar ou fazer deploy).
   - Atenção: se você *excluir* um produto no painel e rodar este arquivo de novo, ele volta. Para esconder sem perder o cadastro, use “Visível”.
4. Em **Authentication → Sign In / Providers → Email**, deixe e-mail/senha ligado e **desative “Allow new users to sign up”** (cadastro público desligado). Mesmo que alguém criasse uma conta, sem estar na tabela `admins` nada seria gravado.

## 2. Criar o administrador

1. Em **Authentication → Users → Add user → Create new user**, informe seu e-mail e uma senha forte e marque **Auto Confirm User**.
2. No **SQL Editor**, execute (troque pelo seu e-mail):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com';
   ```

Pronto: só essa conta acessa `/admin`.

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com os valores de **Project Settings → API**:

| Variável | O que é |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto |
| `VITE_SUPABASE_ANON_KEY` | chave **anon/publishable** (pública) |

**Nunca** use a chave `service_role` no frontend. O app não precisa dela.

## 4. Rodar localmente (opcional)

```bash
npm install
npm run dev
```

Abra o endereço mostrado (ex.: <http://localhost:5173>). Painel em `/admin`.

## 5. Publicar na Vercel

1. Suba a pasta do projeto para um repositório no GitHub (o `.env.local` fica de fora, já está no `.gitignore`).
2. Em <https://vercel.com> → **Add New → Project**, importe o repositório. O framework Vite é detectado; o `vercel.json` já faz as rotas (`/admin`, `/produto/...`) funcionarem ao recarregar a página.
3. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Clique em **Deploy**.
5. Abra `https://SEU-SITE.vercel.app/admin`, entre com o e-mail e a senha do passo 2.

## 6. Configurar a loja e adicionar as fotos

**Loja:** `/admin` → **Configurações**: nome, logo e WhatsApp (DDD + número; o +55 é assumido). Enquanto o WhatsApp estiver vazio, o botão de pedido não aparece.

**Fotos de um produto:**
1. `/admin` → toque no nome do produto.
2. **+ Adicionar fotos** (do celular ou do computador; JPG, PNG ou WebP até 5 MB). As miniaturas aparecem antes de salvar.
3. Use ↑ ↓ para ordenar, **Tornar principal**, **Substituir** ou **Remover**. A primeira é a principal.
4. Toque em **Salvar** (as fotos só são enviadas aqui).

**Preço, disponibilidade e visibilidade** também podem ser alterados direto na lista de produtos (o preço salva ao sair do campo). As artes verticais aparecem inteiras (sem corte), e na página do produto dá para ampliar a imagem.

## Estrutura

```
supabase/01_schema.sql          tabelas, RLS, bucket e policies
supabase/02_seed_products.sql   importação idempotente (gerado)
scripts/products-data.mjs       dados do PDF; `npm run seed:generate` regera o SQL
src/pages/                      vitrine (lista e produto)
src/admin/                      login, lista, editor e configurações
```

## Observações

- Preços ficam em **centavos** (`price_cents`) e são exibidos em R$ no padrão brasileiro.
- Imagens enviadas têm nome único e cache longo; ao substituir/remover, o arquivo antigo é apagado do armazenamento.
- A tabela `admins` não tem policies: não pode ser lida nem alterada pela API.
