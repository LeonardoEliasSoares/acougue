# PDV de Açougue — Portainer + PostgreSQL

## O que foi melhorado

- Front-end convertido para **HTML + CSS + JavaScript puro** (sem React/TanStack/Supabase).
- **PostgreSQL 16** local e persistente em volume Docker.
- API Node.js/Express entre o navegador e o banco.
- Cadastro/desativação de produtos.
- Caixa com leitura de código de barras (scanners USB normalmente funcionam como teclado).
- Produtos por kg ou unidade.
- Histórico de vendas e painel do dia.
- Pix Copia e Cola + QR Code com valor fixo.
- Endpoint `/api/pix/webhook` preparado para futura integração com banco/PSP.
- Healthcheck do PostgreSQL e persistência.

## Implantação no Portainer

### Opção A — Git

1. Extraia este projeto e coloque-o em um repositório Git.
2. No Portainer: **Stacks → Add stack → Git repository**.
3. Informe o repositório.
4. O arquivo da stack é `docker-compose.yml`.
5. Em **Environment variables**, configure pelo menos:
   - `POSTGRES_PASSWORD` = uma senha forte
   - `APP_PORT` = `3000` (ou outra porta livre)
6. Clique em **Deploy the stack**.
7. Acesse `http://IP-DO-SERVIDOR:3000`.

### Opção B — Web editor

O Portainer precisa conseguir acessar o contexto do Dockerfile e `database/init.sql`. Por isso, o método mais confiável é Git ou copiar o conteúdo completo do projeto para o host e fazer o deploy a partir dele.

Se sua versão do Portainer não aceitar `build:` no Web editor, use o método Git ou construa a imagem antes.

## Importante sobre PostgreSQL

O volume `postgres_data` mantém os dados mesmo se o container da aplicação for recriado.

Para backup:
```bash
docker exec acougue-postgres pg_dump -U acougue -d acougue > backup.sql
```

Para restaurar, faça isso somente com o serviço parado e seguindo o procedimento de PostgreSQL adequado.

## Pix

A aplicação gera um BR Code/Pix Copia e Cola usando a chave cadastrada em Configurações.

**Isso não confirma sozinho que o cliente pagou.** O botão "Confirmar pagamento" é manual. Para confirmação automática, é necessário conectar um PSP/banco que forneça API de cobrança Pix e webhook (por exemplo, uma instituição compatível com sua conta). O endpoint de webhook está preparado, mas deve ser protegido com autenticação/assinatura do provedor antes de uso em produção.

## Produção

Antes de colocar em uso real, recomendo:
- colocar HTTPS via Nginx Proxy Manager, Traefik ou Cloudflare Tunnel;
- proteger o painel com login/perfis (caixa, gerente, administrador);
- configurar backup automático do PostgreSQL;
- integrar Pix dinâmico com o banco/PSP escolhido;
- adicionar emissão fiscal/NFC-e conforme a operação e legislação aplicável;
- adicionar controle de estoque por peso, entradas, perdas e ajustes.
