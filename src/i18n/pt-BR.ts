/** Source of truth for message keys; other locales must translate every key. */
export const ptBR = {
  'floor.label': 'Andar {n}',
  'boss.shadow-colossus': 'Colosso Sombrio',
  'death.title': 'Engolido pelas sombras',
  'death.hint': 'R para nova run',
  'pause.title': 'Pausado',
  'pause.seed': 'seed {seed}',
  'pause.language': 'Idioma: {language}',
  'pause.hint': 'Esc continuar   ·   R nova run   ·   L idioma',

  'item.ether-core.name': 'Núcleo de Éter',
  'item.ether-core.description': 'Dano +1.5',
  'item.quickcast.name': 'Conjuração Rápida',
  'item.quickcast.description': 'Cadência +30%',
  'item.trinity-sigil.name': 'Sigilo Trino',
  'item.trinity-sigil.description': 'Três projéteis em leque, dano -20%',
  'item.seeker-rune.name': 'Runa Buscadora',
  'item.seeker-rune.description': 'Projéteis perseguem inimigos',
  'item.swift-boots.name': 'Botas Ligeiras',
  'item.swift-boots.description': 'Velocidade +20%',
  'item.long-focus.name': 'Foco Distante',
  'item.long-focus.description': 'Alcance +40%, projéteis maiores',
  'item.vital-shard.name': 'Fragmento Vital',
  'item.vital-shard.description': '+1 coração',
} as const;

export type MessageKey = keyof typeof ptBR;
export type Messages = Record<MessageKey, string>;
