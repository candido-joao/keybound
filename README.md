# Keybound

Roguelike de ação top-down inspirado em _The Binding of Isaac_. Você empunha uma keyblade, atravessa andares gerados proceduralmente, enfrenta sombras e um colosso por andar, e acumula itens que alteram seus atributos.

Feito com [Phaser 4](https://phaser.io), TypeScript e Vite.

## Como jogar

| Tecla           | Ação                               |
| --------------- | ---------------------------------- |
| `W` `A` `S` `D` | Mover                              |
| `↑` `↓` `←` `→` | Atirar                             |
| `Tab` (segurar) | Mapa expandido                     |
| `Esc`           | Pausar                             |
| `R`             | Nova run (no pause ou após morrer) |

Cada andar tem uma **sala do tesouro** e uma **sala do boss**. Os dois dão um item; derrotar o boss abre o portal para o próximo andar. Itens podem se repetir e seus efeitos acumulam.

## Rodando localmente

Requer Node 24+ e pnpm.

```bash
pnpm install
pnpm dev       # servidor de desenvolvimento
pnpm build     # build de produção em dist/
pnpm preview   # serve o build
```

### Parâmetros de URL

- `?seed=<valor>` — joga uma seed específica. A seed da run atual aparece no menu de pause.
- `?debug` — mostra os corpos de física.

## Estrutura

```
src/
  scenes/     Boot (texturas), Game (run e salas), Hud, Pause
  entities/   Player, Shadow (inimigos e boss), Bolt (projéteis)
  combat/     atributos do jogador e definição dos itens
  floor/      gerador procedural de andares
  core/       RNG determinístico a partir da seed
public/items/ ícones dos itens, nomeados pelo id do item
```

Para adicionar um item, basta incluí-lo em `src/combat/items.ts` e colocar o ícone em `public/items/<id>.png` (32×32).

## Licença

O código está disponível para leitura e estudo sob a [PolyForm Strict 1.0.0](LICENSE): você pode ler e rodar o jogo para fins não comerciais. Não pode alterar o código nem criar obras derivadas, mesmo sem publicá-las, nem redistribuir ou usar comercialmente.

Aprender com o código é bem-vindo; técnicas e ideias não precisam de permissão. O nome Keybound, a arte e o áudio são reservados e não estão cobertos por essa licença.
