# Keybound

Roguelike de ação top-down inspirado em _The Binding of Isaac_. Você empunha uma chave mágica, atravessa andares gerados proceduralmente, enfrenta sombras e um colosso por andar, e acumula itens que alteram seus atributos.

Feito com [Phaser 4](https://phaser.io), TypeScript e Vite.

## Como jogar

| Tecla           | Ação                                              |
| --------------- | ------------------------------------------------- |
| `W` `A` `S` `D` | Mover                                             |
| `↑` `↓` `←` `→` | Atirar                                            |
| `Tab` (segurar) | Mapa expandido                                    |
| `Esc`           | Pausar                                            |
| `R`             | Nova run (no pause) ou repetir a seed (no resumo) |
| `Q`             | Voltar ao menu (no pause)                         |
| `L`             | Trocar idioma (no pause; `Tab` no menu)           |

Cada andar tem uma **sala do tesouro** e uma **sala do boss**. Os dois dão um item; derrotar o boss abre o portal para o próximo andar. Itens podem se repetir e seus efeitos acumulam.

No menu, digite letras e números para fixar uma seed; vazio sorteia uma. A seed da run aparece no pause e no resumo ao morrer. Runs com seed fixa (digitada, repetida ou por URL) ficam marcadas e não vão contar para progresso.

## Rodando localmente

Requer Node 24+ e pnpm.

```bash
pnpm install
pnpm dev       # servidor de desenvolvimento
pnpm build     # build de produção em dist/
pnpm preview   # serve o build
```

### Parâmetros de URL

- `?seed=<valor>` — joga uma seed específica.
- `?depth=<n>` — começa no andar `n`.
- `?items=<id>,<id>` — começa com esses itens (ids de `src/combat/items.ts`; repetir empilha).

Qualquer um desses três pula o menu e inicia a run com seed fixa.

- `?debug` — mostra os corpos de física.

## Estrutura

```
src/
  scenes/     Boot (texturas), Title (menu e seed), Game (run e salas), Hud, Pause, Summary (resumo da run)
  entities/   Player, Enemy (inimigos e bosses do registro), Bolt (projéteis)
  combat/     atributos do jogador, balanceamento, itens e inimigos
  floor/      gerador procedural de andares
  core/       RNG determinístico, estado da run e parâmetros de URL
public/items/ ícones dos itens, nomeados pelo id do item
```

Para adicionar um item, basta incluí-lo em `src/combat/items.ts` e colocar o ícone em `public/items/<id>.png` (32×32).

Inimigos e bosses ficam em `src/combat/enemies.ts`: atributos, dano de contato e ataques (como a investida do boss) são dados. O nome vai no `src/i18n`.

## Licença

O código está disponível para leitura e estudo sob a [PolyForm Strict 1.0.0](LICENSE): você pode ler e rodar o jogo para fins não comerciais. Não pode alterar o código nem criar obras derivadas, mesmo sem publicá-las, nem redistribuir ou usar comercialmente.

Aprender com o código é bem-vindo; técnicas e ideias não precisam de permissão. O nome Keybound, a arte e o áudio são reservados e não estão cobertos por essa licença.
