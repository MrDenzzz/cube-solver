export type Language = 'en' | 'ru';

/** Plural forms keyed by Intl.PluralRules categories; `{n}` is replaced with the count. */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { readonly other: string };

const en = {
  'app.title': 'Cube Solver',
  'app.subtitle': "Kociemba's two-phase algorithm in a Web Worker",
  'app.source': 'Source on GitHub',
  'language.label': 'Language',
  'cube.label': 'The cube in 3D. Drag to look around it.',

  'scramble.title': 'Scramble',
  'scramble.label': 'Moves in WCA notation (SiGN slices and wide moves also work)',
  'scramble.placeholder': "e.g. R U R' U' F2 D L2",
  'scramble.random': 'Random state',
  'scramble.clear': 'Clear',
  'scramble.generating': 'Generating…',
  'scramble.error.unexpected-character': 'Unexpected character “{token}” at position {position}',
  'scramble.error.invalid-move': '“{token}” at position {position} is not a valid move',
  'scramble.error.not-wca': '“{token}” at position {position} is not WCA notation',
  'scramble.error.layer-out-of-range':
    '“{token}” at position {position} needs layers a {size}×{size}×{size} cube does not have',

  'solve.title': 'Solve',
  'solve.target': 'Stop at',
  'solve.targetOption': '{n} moves or fewer',
  'solve.timeLimit': 'Time limit',
  'solve.seconds': '{n} s',
  'solve.button': 'Solve',
  'solve.cancel': 'Cancel',
  'solve.preparing': 'Preparing solver tables',
  'solve.ready': 'Tables ready: {size} MB in {ms} ms',
  'solve.failed': 'The solver failed to start: {message}',
  'solve.searching': 'Searching at phase 1 depth {depth}',
  'solve.best': 'best so far: {moves}',
  'solve.result': '{moves} found in {ms} ms, {nodes} nodes searched',
  'solve.stoppedBy.target': 'Reached the target length.',
  'solve.stoppedBy.time': 'Time limit reached: this is the shortest solution found in time.',
  'solve.stoppedBy.cancelled': 'Cancelled.',
  'solve.stoppedBy.exhausted': 'No shorter solution exists within the search limits.',
  'solve.noSolution': 'Cancelled before any solution was found.',
  'solve.solved': 'The cube is already solved.',

  'playback.title': 'Solution',
  'playback.start': 'Back to the scramble',
  'playback.back': 'Previous move',
  'playback.play': 'Play',
  'playback.pause': 'Pause',
  'playback.forward': 'Next move',
  'playback.end': 'To the solved cube',
  'playback.speed': 'Speed',
  'playback.position': 'Move {position} of {total}',
  'playback.keys': 'Space plays and pauses, arrow keys step.',
} as const;

export type MessageKey = keyof typeof en;

const ru: Record<MessageKey, string> = {
  'app.title': 'Сборщик кубика',
  'app.subtitle': 'Двухфазный алгоритм Коцембы в Web Worker',
  'app.source': 'Исходный код на GitHub',
  'language.label': 'Язык',
  'cube.label': 'Кубик в 3D. Потяните, чтобы осмотреть его со всех сторон.',

  'scramble.title': 'Скрэмбл',
  'scramble.label': 'Ходы в нотации WCA (срезы и широкие ходы SiGN тоже подходят)',
  'scramble.placeholder': "например, R U R' U' F2 D L2",
  'scramble.random': 'Случайное состояние',
  'scramble.clear': 'Очистить',
  'scramble.generating': 'Генерирую…',
  'scramble.error.unexpected-character': 'Неожиданный символ «{token}» в позиции {position}',
  'scramble.error.invalid-move': '«{token}» в позиции {position} — не ход',
  'scramble.error.not-wca': '«{token}» в позиции {position} — не нотация WCA',
  'scramble.error.layer-out-of-range':
    '«{token}» в позиции {position} требует слоёв, которых нет у куба {size}×{size}×{size}',

  'solve.title': 'Поиск решения',
  'solve.target': 'Остановиться на',
  'solve.targetOption': 'не больше {n} ходов',
  'solve.timeLimit': 'Лимит времени',
  'solve.seconds': '{n} с',
  'solve.button': 'Решить',
  'solve.cancel': 'Отменить',
  'solve.preparing': 'Готовлю таблицы солвера',
  'solve.ready': 'Таблицы готовы: {size} МБ за {ms} мс',
  'solve.failed': 'Солвер не запустился: {message}',
  'solve.searching': 'Поиск, глубина фазы 1: {depth}',
  'solve.best': 'лучшее пока: {moves}',
  'solve.result': '{moves} за {ms} мс, просмотрено узлов: {nodes}',
  'solve.stoppedBy.target': 'Целевая длина достигнута.',
  'solve.stoppedBy.time': 'Время вышло: это самое короткое решение, найденное за лимит.',
  'solve.stoppedBy.cancelled': 'Отменено.',
  'solve.stoppedBy.exhausted': 'Короче в пределах поиска не бывает.',
  'solve.noSolution': 'Отменено до первого найденного решения.',
  'solve.solved': 'Кубик уже собран.',

  'playback.title': 'Решение',
  'playback.start': 'К скрэмблу',
  'playback.back': 'Предыдущий ход',
  'playback.play': 'Воспроизвести',
  'playback.pause': 'Пауза',
  'playback.forward': 'Следующий ход',
  'playback.end': 'К собранному кубику',
  'playback.speed': 'Скорость',
  'playback.position': 'Ход {position} из {total}',
  'playback.keys': 'Пробел — пуск и пауза, стрелки — по ходу.',
};

export const MESSAGES: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = {
  en,
  ru,
};

export const MOVES: Readonly<Record<Language, Plural>> = {
  en: { one: '{n} move', other: '{n} moves' },
  ru: { one: '{n} ход', few: '{n} хода', many: '{n} ходов', other: '{n} хода' },
};
