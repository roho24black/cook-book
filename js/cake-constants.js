// Справочники для конструктора торта. Отдельный файл от constants.js, чтобы не раздувать
// общий список категорий рецептов — здесь всё, что касается только тортов.

export const CAKE_DIAMETERS = [16, 18, 20, 22, 24, 26, 28];

// Порции — по диаметру самого широкого коржа (обычно нижнего), см. estimatePortions() в cake-builder.js
export const CAKE_PORTIONS = { 16:'6–8', 18:'8–10', 20:'10–12', 22:'12–16', 24:'16–20', 26:'20–24', 28:'24–28' };

// shape: 'slab' — обычный плоский корж на срезе, 'tartlet' — чаша с бортиками (песочное тесто)
// heightPx: высота ОДНОГО коржа на иллюстрации среза — разная у разных видов теста
// bakeMinutes/bakeTemp: попадают в автогенерируемую инструкцию как шаг выпечки с таймером
// doughIngredients: базовые продукты на ОДИН корж этого вида теста диаметром 20 см
// (масштабируется по площади под фактический диаметр каждого конкретного коржа).
// vars[].extra: доп. ингредиент только для этого вкуса (какао, клубника и т.п.)
export const CAKE_KINDS = [
  { id:'biscuit', label:'Бисквит', shape:'slab', heightPx:30, bakeMinutes:35, bakeTemp:180,
    doughIngredients:[['Мука пшеничная',80,'г'],['Яйца',1.5,'шт'],['Сахар',75,'г']],
    vars:[
      { id:'classic', label:'Классический', c:'#E8C88A' },
      { id:'choco', label:'Шоколадный', c:'#4A2F22', extra:['Какао-порошок',15,'г'] },
      { id:'straw', label:'Клубничный', c:'#E5A2AC', speck:'#B8465C', extra:['Клубника (пюре)',62.5,'г'] },
      { id:'carrot', label:'Морковный', c:'#C97B3C', speck:'#8E4A1E', extra:['Морковь',75,'г'] },
      { id:'lemon', label:'Лимонный', c:'#E8CE6A', extra:['Лимон',0.5,'шт'] }
    ] },
  { id:'honey', label:'Медовик', shape:'slab', heightPx:14, thin:true, bakeMinutes:6, bakeTemp:190,
    doughIngredients:[['Мука пшеничная',56,'г'],['Мёд',8,'г'],['Яйца',0.4,'шт'],['Масло сливочное',6,'г'],['Сахар',25,'г']],
    vars:[ { id:'honey', label:'Медовые коржи', c:'#C99447' } ] },
  { id:'velvet', label:'Красный бархат', shape:'slab', heightPx:30, bakeMinutes:32, bakeTemp:175,
    doughIngredients:[['Мука пшеничная',80,'г'],['Яйца',1.5,'шт'],['Сахар',75,'г'],['Кефир',50,'мл']],
    onceIngredient:['Краситель красный гелевый',1,'фл.'],
    vars:[ { id:'velvet', label:'Red Velvet', c:'#8E2B2B' } ] },
  { id:'short', label:'Песочное тесто', shape:'tartlet', heightPx:34, bakeMinutes:18, bakeTemp:190,
    doughIngredients:[['Мука пшеничная',60,'г'],['Масло сливочное',40,'г'],['Сахар',20,'г'],['Желток яичный',0.5,'шт']],
    vars:[ { id:'short', label:'Песочные коржи (тарталетка)', c:'#DEB878' } ] },
  { id:'curd', label:'Творожная основа', shape:'slab', heightPx:42, bakeMinutes:50, bakeTemp:150,
    doughIngredients:[['Творожный сыр',320,'г'],['Печенье песочное (для основы)',90,'г'],['Масло сливочное (для основы)',45,'г'],['Яйца',1,'шт'],['Сахар',85,'г']],
    vars:[ { id:'curd', label:'Для чизкейка', c:'#F2E4C0' } ] }
];

// ingredient: [название, база_на_один_корж_Ø20, единица]; fixed:true — не масштабируется
// (добавляется в список один раз, если сироп использован хоть раз)
export const CAKE_SYRUPS = [
  { id:'none', label:'Без пропитки', c:null },
  { id:'sugar', label:'Сахарный сироп', c:'#F3E7CB', ingredient:['Сахар (для сиропа)',50,'г'] },
  { id:'vanilla', label:'Ванильный', c:'#EBD8A6', ingredient:['Ваниль',1,'стручок'], fixed:true },
  { id:'coffee', label:'Кофейный', c:'#6B4A32', ingredient:['Кофе молотый',15,'г'] },
  { id:'berry', label:'Ягодный', c:'#A93B54', ingredient:['Вишня/малина для сиропа',70,'г'] },
  { id:'rum', label:'Ромово-коньячный', c:'#9A5A2B', ingredient:['Ром',20,'мл'] }
];

// ingredient: [название, база_в_г_или_мл] — используется для расчёта списка покупок
export const CAKE_CREAMS = [
  { id:'butter', label:'Масляный крем', c:'#F3E5C6', ingredient:['Масло сливочное', 400, 'г'] },
  { id:'cheese', label:'Крем-чиз', c:'#FBF6EA', ingredient:['Сливочный сыр', 600, 'г'] },
  { id:'ganache', label:'Шоколадный ганаш', c:'#5A3520', ingredient:['Шоколад тёмный 55%', 350, 'г'] },
  { id:'custard', label:'Заварной крем', c:'#F2DFA6', ingredient:['Молоко', 500, 'мл'] },
  { id:'whipped', label:'Взбитые сливки', c:'#FFFDF8', ingredient:['Сливки 33%', 450, 'мл'] },
  { id:'curd', label:'Ягодный курд', c:'#C4485F', ingredient:['Ягоды для курда', 350, 'г'] },
  { id:'yogurt', label:'Йогуртовый мусс', c:'#F1E8DA', ingredient:['Йогурт греческий', 450, 'г'] }
];

export const CAKE_COATS = [
  // У "Гладкого крема" как ВНЕШНЕГО покрытия (когда оно отличается от кремов внутри —
  // не coatSame) раньше не было своего ingredient — расход крема на обмазку снаружи
  // просто не попадал в список покупок. Берём как масляный крем на покрытие.
  { id:'cream', label:'Гладкий крем', c:'#F1E2C6', ingredient:['Масло сливочное (на обмазку снаружи)', 250, 'г'] },
  { id:'glaze', label:'Шоколадная глазурь', c:'#3E2418', ingredient:['Шоколад для глазури', 250, 'г'] },
  { id:'naked', label:'Голый торт', c:null },
  { id:'fondant', label:'Мастика', c:'#EDE3D6', ingredient:['Мастика', 400, 'г'] }
];

export const CAKE_DECORS = [
  { id:'berries', label:'Свежие ягоды', ingredient:['Ягоды свежие', 300, 'г'] },
  { id:'shavings', label:'Шоколадная стружка', ingredient:['Шоколад для стружки', 100, 'г'] },
  { id:'sprinkles', label:'Посыпка', ingredient:['Кондитерская посыпка', 50, 'г'] },
  { id:'caramel', label:'Карамель', ingredient:['Карамель солёная', 150, 'г'] },
  { id:'none', label:'Без декора' }
];

export const CAKE_STATUSES = { draft:'черновик', planned:'запланирован', cooked:'приготовлен' };

// Пресеты для быстрого старта — заполняют черновик целиком, дальше можно доредактировать
// любой корж по отдельности (пресет — это просто разумная отправная точка, не жёсткий рецепт).
export const CAKE_PRESETS = [
  { id:'honey-classic', emoji:'🍯', label:'Медовик классический',
    layers:[
      {kind:'honey',variant:'honey',diameter:18,syrup:'none'},
      {kind:'honey',variant:'honey',diameter:18,syrup:'none'},
      {kind:'honey',variant:'honey',diameter:18,syrup:'none'},
      {kind:'honey',variant:'honey',diameter:18,syrup:'none'}
    ], creams:['custard','custard','custard'], coatSame:true, coat:'cream', decor:'none' },
  { id:'velvet-party', emoji:'🎉', label:'Красный бархат на праздник',
    layers:[
      {kind:'velvet',variant:'velvet',diameter:20,syrup:'none'},
      {kind:'velvet',variant:'velvet',diameter:20,syrup:'none'},
      {kind:'velvet',variant:'velvet',diameter:20,syrup:'none'}
    ], creams:['cheese','cheese'], coatSame:false, coat:'cream', decor:'berries' },
  { id:'choco-tower', emoji:'🍫', label:'Шоколадный трёхъярусный',
    layers:[
      {kind:'biscuit',variant:'choco',diameter:22,syrup:'coffee'},
      {kind:'biscuit',variant:'choco',diameter:22,syrup:'coffee'},
      {kind:'biscuit',variant:'choco',diameter:22,syrup:'coffee'}
    ], creams:['ganache','ganache'], coatSame:false, coat:'glaze', decor:'shavings' },
  { id:'straw-biscuit', emoji:'🍓', label:'Клубничный бисквит',
    layers:[
      {kind:'biscuit',variant:'straw',diameter:18,syrup:'berry'},
      {kind:'biscuit',variant:'straw',diameter:18,syrup:'berry'},
      {kind:'biscuit',variant:'straw',diameter:18,syrup:'berry'}
    ], creams:['whipped','whipped'], coatSame:true, coat:'cream', decor:'berries' }
];

export function findKind(id){ return CAKE_KINDS.find(k=>k.id===id) || CAKE_KINDS[0]; }
export function findVariant(kind, id){ return kind.vars.find(v=>v.id===id) || kind.vars[0]; }
export function findSyrup(id){ return CAKE_SYRUPS.find(x=>x.id===id) || CAKE_SYRUPS[0]; }
export function findCream(id){ return CAKE_CREAMS.find(x=>x.id===id) || CAKE_CREAMS[0]; }
export function findCoat(id){ return CAKE_COATS.find(x=>x.id===id) || CAKE_COATS[0]; }
export function findDecor(id){ return CAKE_DECORS.find(x=>x.id===id) || CAKE_DECORS[0]; }
