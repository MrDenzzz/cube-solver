export type Language = 'en' | 'ru';

/** Plural forms keyed by Intl.PluralRules categories; `{n}` is replaced with the count. */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { readonly other: string };

const en = {
  'app.title': 'Cube Solver',
  'app.subtitle': 'Fast and optimal solutions, computed in a Web Worker',
  'app.source': 'Source on GitHub',
  'language.label': 'Language',
  'cube.label': 'The cube in 3D. Drag to look around it.',

  'input.title': 'Cube state',
  'input.mode.scramble': 'Scramble',
  'input.mode.stickers': 'Stickers',
  'input.puzzle': 'Puzzle',

  'colour.U': 'white',
  'colour.R': 'red',
  'colour.F': 'green',
  'colour.D': 'yellow',
  'colour.L': 'orange',
  'colour.B': 'blue',
  'colour.unknown': 'not set',

  'face.U': 'top',
  'face.R': 'right',
  'face.F': 'front',
  'face.D': 'bottom',
  'face.L': 'left',
  'face.B': 'back',

  'stickers.hint.F':
    'Hold the cube with the {facing} centre facing you and {top} on top. This is the starting position.',
  'stickers.hint.R':
    'From the start, turn the cube a quarter to the left: {facing} centre facing you, {top} on top.',
  'stickers.hint.B':
    'From the start, turn the cube half way round: {facing} centre facing you, {top} on top.',
  'stickers.hint.L':
    'From the start, turn the cube a quarter to the right: {facing} centre facing you, {top} on top.',
  'stickers.hint.U':
    'From the start, tilt the top towards you: {facing} centre facing you, {top} on top.',
  'stickers.hint.D':
    'From the start, tilt the bottom towards you: {facing} centre facing you, {top} on top.',
  'stickers.hint4.F':
    'Hold the cube any way round: this face is the front, and this hold is the starting position.',
  'stickers.hint4.R':
    'From the start, turn the cube a quarter to the left: the right face is towards you.',
  'stickers.hint4.B': 'From the start, turn the cube half way round: the back face is towards you.',
  'stickers.hint4.L':
    'From the start, turn the cube a quarter to the right: the left face is towards you.',
  'stickers.hint4.U':
    'From the start, tilt the top towards you: the top face is towards you, the back face on top.',
  'stickers.hint4.D':
    'From the start, tilt the bottom towards you: the bottom face is towards you, the front face on top.',
  'stickers.net': 'Unfolded cube',
  'stickers.faceLabel': '{face} face',
  'stickers.sticker': '{face} face, row {row}, column {column}: {colour}',
  'stickers.palette': 'Colour',
  'stickers.count': '{colour}: {count} of {total}',
  'stickers.keys':
    'Keys W Y G B R O fill in the selected sticker and move on; arrow keys move around.',
  'stickers.clear': 'Clear',
  'stickers.missing': 'Stickers left to fill in: {count}',
  'stickers.valid': 'The state is valid and ready to solve.',
  'stickers.error.colour-count': '{colour}: {count} stickers instead of {expected}',
  'stickers.error.invalid-corner': 'Corner {position}: no corner has these colours',
  'stickers.error.mirrored-corner':
    'Corner {position}: the colours go in mirror order, so one of its stickers is wrong',
  'stickers.error.invalid-edge': 'Edge {position}: no edge has these colours',
  'stickers.error.duplicate-corner': 'Corner {piece} appears more than once',
  'stickers.error.duplicate-edge': 'Edge {piece} appears more than once',
  'stickers.error.twisted-corner':
    'One corner is twisted in place. Check the stickers; if they are right, the cube was reassembled wrongly and cannot be solved without taking it apart.',
  'stickers.error.flipped-edge':
    'One edge is flipped in place. Check the stickers; if they are right, the cube was reassembled wrongly and cannot be solved without taking it apart.',
  'stickers.error.parity':
    'Two pieces are swapped. Check the stickers; if they are right, the cube was reassembled wrongly and cannot be solved without taking it apart.',
  'stickers.error.other': 'These stickers do not describe a cube.',
  'stickers.error4.centre-count': '{colour}: {count} centre stickers instead of 4',
  'stickers.error4.invalid-corner': 'No corner has the colours of the highlighted one.',
  'stickers.error4.mirrored-corner':
    'The highlighted corner shows its colours in mirror order, so one of its stickers is wrong.',
  'stickers.error4.duplicate-corner': 'The highlighted corners have the same colours.',
  'stickers.error4.invalid-wing': 'No edge piece has the colours of the highlighted one.',
  'stickers.error4.duplicate-wing':
    'The highlighted edge pieces show the same colours the same way round; one of them is wrong.',

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
  'solve.mode': 'Mode',
  'solve.engine': 'Engine',
  'solve.engine.typescript': 'TypeScript',
  'solve.engine.wasm': 'WebAssembly',
  'solve.threads.typescript':
    'The optimal search uses {threads} threads; tables live in shared memory.',
  'solve.threads.wasm': 'Rust compiled to WebAssembly; the optimal search uses one thread.',
  'solve.mode.fast': 'Fast',
  'solve.mode.optimal': 'Optimal',
  'solve.tier': 'Table',
  'solve.tier.standard': 'Standard, 35 MB',
  'solve.tier.huge': 'Huge, 0.9 GB, desktop only',
  'solve.optimal.note':
    'An optimal solution is proven by ruling out every shorter one. That takes from seconds to many minutes; cancelling keeps the best solution found so far.',
  'solve.optimal.prepare': 'Prepare the table',
  'solve.optimal.preparing': 'Preparing the optimal table: {percent}%',
  'solve.optimal.loaded': 'Optimal table loaded from browser storage in {time}.',
  'solve.optimal.built': 'Optimal table built in {time} and saved in the browser.',
  'solve.optimal.notSaved':
    'Optimal table built in {time}; the browser could not store it: {message}',
  'solve.optimal.failed': 'Could not prepare the optimal table: {message}',
  'solve.optimal.searching': 'Searching {depth}-move solutions; all shorter ones are ruled out',
  'solve.optimal.known': 'known: {moves}',
  'solve.optimal.proven': '{moves}, proven optimal in {time}; {nodes} positions searched',
  'solve.optimal.cancelled':
    'Cancelled. The best solution found has {moves} and is not proven optimal.',
  'solve.stoppedBy.proven': 'Proven optimal: no shorter solution exists.',
  'time.ms': '{n} ms',
  'time.s': '{n} s',
  'time.min': '{m} min {s} s',
  'solve.stoppedBy.target': 'Reached the target length.',
  'solve.stoppedBy.time': 'Time limit reached: this is the shortest solution found in time.',
  'solve.stoppedBy.cancelled': 'Cancelled.',
  'solve.stoppedBy.exhausted': 'No shorter solution exists within the search limits.',
  'solve.noSolution': 'Cancelled before any solution was found.',
  'solve.solved': 'The cube is already solved.',
  'solve.four.method':
    'Reduction: centres and edge pairs first, in three searches after Chen Shuang’s TPR solver, then the two-phase 3×3×3 solver. About 45 moves; a solve takes a second or so.',
  'solve.four.preparing': 'Preparing the 4×4×4 tables: {percent}%',
  'solve.four.ready': '4×4×4 tables ready: {size} MB in {time}.',
  'solve.four.failed': 'The 4×4×4 solver failed: {message}',
  'solve.four.searching': 'Searching…',
  'solve.four.result': '{moves} found in {time}: {phases}.',
  'solve.four.phases': 'reduction {a} + {b} + {c}, then 3×3×3 {d}',

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

  'guide.hold': 'Hold the cube with the {top} centre on top and the {front} centre facing you.',
  'guide.hold4':
    'Hold the cube the way you held it to scramble it or to enter its first face: the picture shows that front towards you.',
  'guide.start': 'Make the moves on your cube one at a time and press Next after each.',
  'guide.step': 'Move {n} of {total}',
  'guide.face.U': 'Top face',
  'guide.face.R': 'Right face',
  'guide.face.F': 'Front face',
  'guide.face.D': 'Bottom face',
  'guide.face.L': 'Left face',
  'guide.face.B': 'Back face',
  'guide.wide.U': 'Top {n} layers',
  'guide.wide.R': 'Right {n} layers',
  'guide.wide.F': 'Front {n} layers',
  'guide.wide.D': 'Bottom {n} layers',
  'guide.wide.L': 'Left {n} layers',
  'guide.wide.B': 'Back {n} layers',
  'guide.towards': 'Turn it so the {side} goes {direction}.',
  'guide.side.F': 'front',
  'guide.side.U': 'top',
  'guide.direction.U': 'up',
  'guide.direction.R': 'right',
  'guide.direction.F': 'towards you',
  'guide.direction.D': 'down',
  'guide.direction.L': 'left',
  'guide.direction.B': 'away from you',
  'guide.half': 'Half turn, 180°, either way.',
  'guide.clockwise': 'Clockwise as seen from {from}.',
  'guide.counterClockwise': 'Counter-clockwise as seen from {from}.',
  'guide.from.U': 'above',
  'guide.from.R': 'the right',
  'guide.from.F': 'the front',
  'guide.from.D': 'below',
  'guide.from.L': 'the left',
  'guide.from.B': 'behind',
  'guide.next': 'Next',
  'guide.back': 'Back',
  'guide.done': 'Solved in {moves}.',
  'view.reset': 'Reset the view',
} as const;

export type MessageKey = keyof typeof en;

const ru: Record<MessageKey, string> = {
  'app.title': 'Сборщик кубика',
  'app.subtitle': 'Быстрые и оптимальные решения, вычисляемые в Web Worker',
  'app.source': 'Исходный код на GitHub',
  'language.label': 'Язык',
  'cube.label': 'Кубик в 3D. Потяните, чтобы осмотреть его со всех сторон.',

  'input.title': 'Состояние кубика',
  'input.mode.scramble': 'Скрэмбл',
  'input.mode.stickers': 'Наклейки',
  'input.puzzle': 'Головоломка',

  'colour.U': 'белый',
  'colour.R': 'красный',
  'colour.F': 'зелёный',
  'colour.D': 'жёлтый',
  'colour.L': 'оранжевый',
  'colour.B': 'синий',
  'colour.unknown': 'не задан',

  'face.U': 'верхняя',
  'face.R': 'правая',
  'face.F': 'передняя',
  'face.D': 'нижняя',
  'face.L': 'левая',
  'face.B': 'задняя',

  'stickers.hint.F':
    'Держите кубик так: {facing} центр к себе, {top} сверху. Это исходное положение.',
  'stickers.hint.R':
    'Из исходного положения поверните кубик на четверть влево: {facing} центр к себе, {top} сверху.',
  'stickers.hint.B':
    'Из исходного положения поверните кубик на пол-оборота: {facing} центр к себе, {top} сверху.',
  'stickers.hint.L':
    'Из исходного положения поверните кубик на четверть вправо: {facing} центр к себе, {top} сверху.',
  'stickers.hint.U':
    'Из исходного положения наклоните кубик верхом к себе: {facing} центр к себе, {top} сверху.',
  'stickers.hint.D':
    'Из исходного положения наклоните кубик низом к себе: {facing} центр к себе, {top} сверху.',
  'stickers.hint4.F':
    'Возьмите кубик как угодно: эта грань — передняя, а это положение — исходное.',
  'stickers.hint4.R':
    'Из исходного положения поверните кубик на четверть влево: к вам правая грань.',
  'stickers.hint4.B': 'Из исходного положения поверните кубик на пол-оборота: к вам задняя грань.',
  'stickers.hint4.L':
    'Из исходного положения поверните кубик на четверть вправо: к вам левая грань.',
  'stickers.hint4.U':
    'Из исходного положения наклоните верх к себе: к вам верхняя грань, сверху задняя.',
  'stickers.hint4.D':
    'Из исходного положения наклоните низ к себе: к вам нижняя грань, сверху передняя.',
  'stickers.net': 'Развёртка кубика',
  'stickers.faceLabel': '{face} грань',
  'stickers.sticker': '{face} грань, ряд {row}, столбец {column}: {colour}',
  'stickers.palette': 'Цвет',
  'stickers.count': '{colour}: {count} из {total}',
  'stickers.keys':
    'Клавиши Б Ж З С К О заполняют выбранную наклейку и переходят к следующей, стрелки — перемещение.',
  'stickers.clear': 'Очистить',
  'stickers.missing': 'Осталось заполнить наклеек: {count}',
  'stickers.valid': 'Состояние корректно, можно решать.',
  'stickers.error.colour-count': '{colour}: наклеек {count} вместо {expected}',
  'stickers.error.invalid-corner': 'Угол {position}: такого сочетания цветов не бывает',
  'stickers.error.mirrored-corner':
    'Угол {position}: цвета идут в зеркальном порядке, одна из наклеек введена неверно',
  'stickers.error.invalid-edge': 'Ребро {position}: такого сочетания цветов не бывает',
  'stickers.error.duplicate-corner': 'Угол {piece} встречается больше одного раза',
  'stickers.error.duplicate-edge': 'Ребро {piece} встречается больше одного раза',
  'stickers.error.twisted-corner':
    'Один угол повёрнут на месте. Проверьте наклейки; если они верны, кубик собран неправильно и без разборки не решается.',
  'stickers.error.flipped-edge':
    'Одно ребро перевёрнуто на месте. Проверьте наклейки; если они верны, кубик собран неправильно и без разборки не решается.',
  'stickers.error.parity':
    'Две детали поменяны местами. Проверьте наклейки; если они верны, кубик собран неправильно и без разборки не решается.',
  'stickers.error.other': 'Эти наклейки не описывают кубик.',
  'stickers.error4.centre-count': '{colour}: центральных наклеек {count} вместо 4',
  'stickers.error4.invalid-corner': 'Угла с цветами выделенного не бывает.',
  'stickers.error4.mirrored-corner':
    'Цвета выделенного угла идут в зеркальном порядке, значит, одна из его наклеек неверна.',
  'stickers.error4.duplicate-corner': 'У выделенных углов одинаковые цвета.',
  'stickers.error4.invalid-wing': 'Рёберного элемента с цветами выделенного не бывает.',
  'stickers.error4.duplicate-wing':
    'Выделенные рёберные элементы показывают одни и те же цвета одинаково; один из них неверен.',

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
  'solve.mode': 'Режим',
  'solve.engine': 'Движок',
  'solve.engine.typescript': 'TypeScript',
  'solve.engine.wasm': 'WebAssembly',
  'solve.threads.typescript':
    'Оптимальный поиск идёт в {threads} потоках, таблицы лежат в общей памяти.',
  'solve.threads.wasm':
    'Rust, скомпилированный в WebAssembly; оптимальный поиск идёт в одном потоке.',
  'solve.mode.fast': 'Быстро',
  'solve.mode.optimal': 'Оптимально',
  'solve.tier': 'Таблица',
  'solve.tier.standard': 'Стандартная, 35 МБ',
  'solve.tier.huge': 'Большая, 0,9 ГБ, только для компьютера',
  'solve.optimal.note':
    'Оптимальность доказывается перебором всех более коротких решений. Это занимает от секунд до многих минут; при отмене остаётся лучшее найденное решение.',
  'solve.optimal.prepare': 'Подготовить таблицу',
  'solve.optimal.preparing': 'Готовлю таблицу оптимального режима: {percent}%',
  'solve.optimal.loaded': 'Таблица оптимального режима загружена из хранилища браузера за {time}.',
  'solve.optimal.built': 'Таблица оптимального режима построена за {time} и сохранена в браузере.',
  'solve.optimal.notSaved':
    'Таблица оптимального режима построена за {time}, но браузер не смог её сохранить: {message}',
  'solve.optimal.failed': 'Не удалось подготовить таблицу оптимального режима: {message}',
  'solve.optimal.searching': 'Ищу решения из {depth} ходов; все более короткие исключены',
  'solve.optimal.known': 'известно: {moves}',
  'solve.optimal.proven': '{moves}, оптимальность доказана за {time}; просмотрено позиций: {nodes}',
  'solve.optimal.cancelled':
    'Отменено. Лучшее найденное решение — {moves}, его оптимальность не доказана.',
  'solve.stoppedBy.proven': 'Оптимальность доказана: короче решения нет.',
  'time.ms': '{n} мс',
  'time.s': '{n} с',
  'time.min': '{m} мин {s} с',
  'solve.stoppedBy.target': 'Целевая длина достигнута.',
  'solve.stoppedBy.time': 'Время вышло: это самое короткое решение, найденное за лимит.',
  'solve.stoppedBy.cancelled': 'Отменено.',
  'solve.stoppedBy.exhausted': 'Короче в пределах поиска не бывает.',
  'solve.noSolution': 'Отменено до первого найденного решения.',
  'solve.solved': 'Кубик уже собран.',
  'solve.four.method':
    'Редукция: сначала центры и пары рёбер — три поиска по образцу солвера TPR Чэнь Шуана, затем двухфазный солвер 3×3×3. Около 45 ходов, решение занимает примерно секунду.',
  'solve.four.preparing': 'Готовлю таблицы 4×4×4: {percent}%',
  'solve.four.ready': 'Таблицы 4×4×4 готовы: {size} МБ за {time}.',
  'solve.four.failed': 'Солвер 4×4×4 не сработал: {message}',
  'solve.four.searching': 'Ищу решение…',
  'solve.four.result': '{moves} за {time}: {phases}.',
  'solve.four.phases': 'редукция {a} + {b} + {c}, затем 3×3×3 {d}',

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

  'guide.hold': 'Держите кубик: {top} центр сверху, {front} — к себе.',
  'guide.hold4':
    'Держите кубик так же, как при скрамбле или вводе первой грани: на картинке эта сторона смотрит на вас.',
  'guide.start': 'Делайте ходы на своём кубике по одному и после каждого нажимайте «Дальше».',
  'guide.step': 'Ход {n} из {total}',
  'guide.face.U': 'Верхняя грань',
  'guide.face.R': 'Правая грань',
  'guide.face.F': 'Передняя грань',
  'guide.face.D': 'Нижняя грань',
  'guide.face.L': 'Левая грань',
  'guide.face.B': 'Задняя грань',
  'guide.wide.U': 'Верхние {n} слоя',
  'guide.wide.R': 'Правые {n} слоя',
  'guide.wide.F': 'Передние {n} слоя',
  'guide.wide.D': 'Нижние {n} слоя',
  'guide.wide.L': 'Левые {n} слоя',
  'guide.wide.B': 'Задние {n} слоя',
  'guide.towards': 'Поверните так, чтобы {side} ушла {direction}.',
  'guide.side.F': 'передняя сторона',
  'guide.side.U': 'верхняя сторона',
  'guide.direction.U': 'вверх',
  'guide.direction.R': 'вправо',
  'guide.direction.F': 'к вам',
  'guide.direction.D': 'вниз',
  'guide.direction.L': 'влево',
  'guide.direction.B': 'от вас',
  'guide.half': 'Пол-оборота, 180°, в любую сторону.',
  'guide.clockwise': 'По часовой стрелке, если смотреть {from}.',
  'guide.counterClockwise': 'Против часовой стрелки, если смотреть {from}.',
  'guide.from.U': 'сверху',
  'guide.from.R': 'справа',
  'guide.from.F': 'спереди',
  'guide.from.D': 'снизу',
  'guide.from.L': 'слева',
  'guide.from.B': 'сзади',
  'guide.next': 'Дальше',
  'guide.back': 'Назад',
  'guide.done': 'Собрано за {moves}.',
  'view.reset': 'Вернуть вид',
};

export const MESSAGES: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = {
  en,
  ru,
};

export const MOVES: Readonly<Record<Language, Plural>> = {
  en: { one: '{n} move', other: '{n} moves' },
  ru: { one: '{n} ход', few: '{n} хода', many: '{n} ходов', other: '{n} хода' },
};
