# Keybound

## Branches e PRs

- `main`: só recebe versões estáveis, via PR de uma branch `release/*`.
- `development`: branch de integração. Todo trabalho sai dela e volta para ela.
- Trabalho do dia a dia: crie `feat/*`, `fix/*` ou `chore/*` a partir da `development` e abra PR para a `development`.
- Release: quando a `development` atingir um estágio estável, crie `release/*` a partir dela e abra PR para a `main`.
- Nunca abra PR de uma branch de trabalho direto para a `main`.
- Quem aprova e mescla os PRs é o dono do repositório. Não aprove nem mescle.

## Verificação

- `pnpm build` roda `tsc` e `vite build`. Precisa passar antes de qualquer push.
- O projeto ainda não tem testes nem CI.
