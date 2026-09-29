# Keybound

## Branches e PRs

- `main`: só recebe versões estáveis, via PR de uma branch `release/*`.
- `development`: branch de integração. Todo trabalho sai dela e volta para ela.
- Trabalho do dia a dia: crie `feat/*`, `fix/*` ou `chore/*` a partir da `development` e abra PR para a `development`.
- Release: quando a `development` atingir um estágio estável, crie `release/*` a partir dela e abra PR para a `main`.
- Nunca abra PR de uma branch de trabalho direto para a `main`.
- Quem aprova e mescla os PRs é o dono do repositório. Não aprove nem mescle.

## Código

- Lógica simples e robusta. Funções curtas, com uma responsabilidade.
- Não use `else`: prefira guard clauses e early return.
- Comente só o porquê que o código não mostra. Nada de comentário que repete o código.
- Separe a lógica de jogo pura (atributos, vida, drops, desbloqueios, geração de andar) do Phaser. Ela não importa `phaser` e fica testável isolada; cenas e entidades só leem esse estado e desenham. A migração é gradual, feita junto com cada mudança.
- Conteúdo (itens, inimigos, bosses, fases, personagens) vive em registros de dados, no padrão de `ITEMS`.
- Texto visível ao jogador fica em `src/i18n`, nunca literal no código. `pt-BR.ts` define as chaves; `en-US.ts` e `es.ts` precisam traduzir todas (o `tsc` falha se faltar). Registros de conteúdo guardam a chave, não o texto.
- Tudo que afeta a jogabilidade usa o `Rng` da seed, nunca `Math.random`. Mesma seed, mesma run.
- Estabilidade: nada no loop de update lança exceção; dados salvos são versionados e, se inválidos, voltam ao padrão.
- Performance: sem alocação por frame em caminhos quentes (loops simples em vez de `filter`/`map` no `update`), pool de objetos para projéteis e partículas, redesenho do HUD só quando o estado muda.
- Arte e áudio: sem asset fornecido, use o fallback (texturas geradas no `BootScene`, som sintetizado). O asset real substitui o fallback sem mudar a lógica.

## Verificação

- Antes de qualquer push, precisam passar:
  - `pnpm lint`: ESLint. Bloqueia `else`, `Math.random` e `phaser` importado na lógica pura.
  - `pnpm format:check`: Prettier. `pnpm format` corrige.
  - `pnpm build`: `tsc` e `vite build`.
- O projeto ainda não tem testes nem CI.
