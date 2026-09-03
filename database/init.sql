CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS configuracao (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome_loja varchar(120) NOT NULL DEFAULT 'Açougue',
  chave_pix varchar(120) NOT NULL DEFAULT '',
  cidade varchar(80) NOT NULL DEFAULT 'SAO PAULO',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_barras varchar(64) NOT NULL UNIQUE,
  nome varchar(120) NOT NULL,
  categoria varchar(80),
  preco numeric(12,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
  unidade varchar(5) NOT NULL DEFAULT 'kg' CHECK (unidade IN ('kg','un')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  forma_pagamento varchar(20) NOT NULL CHECK (forma_pagamento IN ('pix','cartao','dinheiro')),
  status_pagamento varchar(20) NOT NULL DEFAULT 'pago' CHECK (status_pagamento IN ('pendente','pago','cancelado')),
  pix_txid varchar(100),
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  pago_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos(codigo_barras);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(criado_em DESC);

INSERT INTO configuracao (id, nome_loja, chave_pix, cidade)
VALUES (1, 'Açougue Modelo', '', 'SAO PAULO')
ON CONFLICT (id) DO NOTHING;

INSERT INTO produtos (codigo_barras, nome, categoria, preco, unidade) VALUES
('7891404335001','Alcatra','Bovino',34.90,'kg'),
('7891404335002','Costela','Bovino',28.50,'kg'),
('7891404335003','Linguiça Toscana','Suíno',8.90,'un'),
('7891404335004','Picanha','Bovino',98.90,'kg'),
('7891404335005','Frango Inteiro','Aves',19.90,'kg'),
('7891404335006','Carvão 5kg','Extras',24.00,'un')
ON CONFLICT (codigo_barras) DO NOTHING;
