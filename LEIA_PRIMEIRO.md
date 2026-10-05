# Atualização DanImports — fotos, descrições e notas

Este pacote atualiza o projeto já existente. Ainda não foi enviado ao seu GitHub, Vercel ou Supabase.

## Como colocar no seu app

1. Descompacte o ZIP. Dentro dele está a pasta `catalogo-perfumes`.
2. No Supabase, abra SQL Editor → New query. Abra o arquivo `supabase/03_descriptions.sql` com um editor de texto, copie todo o conteúdo e execute. Ele adiciona os campos e a função de importação, preservando os dados existentes. **Não é necessário executar novamente 01_schema.sql ou 02_seed_products.sql.**
3. No GitHub, entre no repositório DanImports e abra a pasta `catalogo-perfumes` que já existe. Escolha Add file → Upload files e envie o CONTEÚDO da nova pasta para substituir os arquivos correspondentes. Evite criar uma segunda pasta catalogo-perfumes dentro da primeira. Confira especialmente src/admin/PhotoImport.jsx, src/lib/photoImport.mjs, src/data/photo-import.json e public/importacao com as 64 imagens.
4. Conclua o commit. A Vercel publicará a atualização se estiver ligada ao repositório. Mantenha a pasta raiz `catalogo-perfumes` e as duas variáveis de ambiente que já estão configuradas.
5. Quando o deploy terminar, entre em https://dan-imports.vercel.app/admin com seu administrador e abra **Importar fotos**.
6. Confira a prévia. Há 50 produtos selecionados por correspondência segura; os 13 casos que precisam de revisão começam desmarcados. Toque em Importar selecionados e mantenha a página aberta até terminar.
7. Abra os produtos no catálogo para conferir. Depois você pode editar descrição, família e notas pela aba Produtos.

## Fotos e textos

O ZIP recebido contém 81 arquivos. Foram incluídas 64 artes, relativas a 63 produtos/versões. Dezesseis fotos com a mesma arte e uma foto geral do estoque não foram incluídas. As duas artes diferentes de Sabah Al Ward foram mantidas para revisão.

As descrições foram redigidas com base nas artes, sem promessa de duração, projeção ou eficácia. As notas foram transcritas das imagens; elas não foram verificadas com os fabricantes. A pirâmide de saída/coração/fundo só foi preenchida quando a imagem identificava essas etapas. Nos outros casos usamos notas gerais. Retinal Shot e Salvo Body Cream não receberam notas de perfume que não constam nas artes.

Os nomes do banco são preservados. Correspondências de grafia, como Menocline/Monocline, Emmer/Emeer e Fantasme/Fantosme, estão explícitas no manifesto e podem ser revistas no painel.

Sem foto correspondente na lista enviada: SALVO (perfume), So Candid Pour Homme, Hawas (versão sem Tropical) e Xerjoff Erba Gold. Eles permanecem cadastrados, sem preenchimento automático.

Os produtos extras podem ser cadastrados manualmente e associados depois na tela de importação. Não criamos produtos nem preços automaticamente.

## Preservação e erros

- Preços, categorias, disponibilidade, visibilidade, administradores e configurações da loja não são alterados pela importação.
- Textos existentes são mantidos por padrão. Para substituí-los, marque a opção específica do produto após conferir os textos.
- Fotos existentes são mantidas. As novas entram no final; se não houver foto, a primeira importada vira principal.
- A importação usa o login do administrador e as permissões existentes. Não há chave secreta de serviço no projeto.
- Repetir a importação pelo painel não duplica a mesma foto importada para o mesmo produto. Uma foto já enviada manualmente com outro caminho pode aparecer novamente; nesse caso, remova a duplicata pela edição de fotos.
- Se uma etapa falhar, o painel informa o produto e o erro. As etapas concluídas persistem. Tente novamente: as fotos já vinculadas pela importação são reconhecidas.
- Não feche a página durante o envio. Se fechar, pode abrir e importar novamente.

## Validação local

`npm install`, `npm run build` e `node --test tests/photoImport.test.mjs`.
A compilação e cinco testes passaram. Testamos correspondência, preservação de campos, identidade estável das fotos e retomada após falha simulada. Também validamos o SQL em um banco PostgreSQL local: execução repetida da migração, preservação dos 59 produtos e da foto principal, associação sem duplicação e bloqueio de usuários sem permissão. A importação real depende de executar o SQL no seu projeto e entrar com um administrador válido.
