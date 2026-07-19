// Единое хранилище изменяемого состояния приложения.
// Модули импортируют этот объект и читают/пишут его поля напрямую (store.recipes = [...] и т.д.),
// вместо того чтобы держать разрозненные `let`-переменные в разных файлах — так проще избежать
// путаницы с тем, кто и когда что обновил.

export const store = {
  // данные
  recipes: [],
  hasLoadedOnce: false,

  // фильтры/вид списка
  activeCategory: 'Все',
  searchQuery: '',
  activeDifficulty: null,
  favOnly: false,
  queueOnly: false,
  sortMode: 'new',

  // форма добавления/редактирования
  editingId: null,

  // детальный просмотр рецепта
  currentServings: null,
  checkedIngredients: new Set(),
  selectedReviewStars: 0,

  // фотогалерея / лайтбокс
  lightboxPhotos: [],
  lightboxIndex: 0,
  currentPhotoUploadRecipeId: null,

  // список покупок
  shopMode: false,
  selectedForShop: new Set(JSON.parse(localStorage.getItem('shopCart') || '[]')),
  shopCheckedItems: new Set(JSON.parse(localStorage.getItem('shopChecked') || '[]')),

  // режим готовки
  cookRecipe: null,
  cookStepIdx: 0,
  cookTimerInterval: null,
  cookTimerSeconds: 0,
  cookTimerRunning: false,
  wakeLock: null,
};
