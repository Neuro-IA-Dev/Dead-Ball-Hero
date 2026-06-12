import { t } from '@/core/i18n';
import { Game } from '@/game/game';
import { getCampaignLevels, type LevelSpec } from '@/game/level';
import {
  loadProgress,
  recordLevelResult,
  starsFor,
  isUnlocked,
  type Progress,
} from '@/game/progress-store';

/**
 * Shell de la aplicación — tarea 1.16. Gestiona dos pantallas: el MENÚ de
 * selección de nivel (con candados y estrellas, persistido en localStorage) y
 * el JUEGO. Decide qué pasa al superar o reintentar un nivel.
 */
export class App {
  private readonly levels: LevelSpec[] = getCampaignLevels();
  private readonly ids: string[];
  private readonly menuRoot: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private progress: Progress = loadProgress();
  private currentIndex = -1;

  constructor(
    private game: Game,
    mountRoot: HTMLElement,
  ) {
    this.ids = this.levels.map((l) => l.id);
    this.menuRoot = document.createElement('div');
    this.menuRoot.className = 'menu-screen';

    const card = document.createElement('div');
    card.className = 'menu-card';

    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.textContent = t('app.title');
    const tagline = document.createElement('p');
    tagline.className = 'menu-tagline';
    tagline.textContent = t('app.tagline');
    const subtitle = document.createElement('p');
    subtitle.className = 'menu-subtitle';
    subtitle.textContent = t('menu.selectLevel');

    this.coinsEl = document.createElement('p');
    this.coinsEl.className = 'menu-coins';

    this.grid = document.createElement('div');
    this.grid.className = 'menu-grid';

    card.append(title, tagline, subtitle, this.grid, this.coinsEl);
    this.menuRoot.append(card);
    mountRoot.append(this.menuRoot);

    this.game.onLevelResolved = (status, level) => {
      this.progress = recordLevelResult(level.id, status.stars, level.rewardCoins, status.score);
    };
    this.game.onRequestNext = () => this.playNextOrMenu();
    this.game.onRequestMenu = () => this.showMenu();

    // Modo sandbox de QA: ?canonical/?wall/?keeper saltan el menú.
    const params = new URLSearchParams(location.search);
    const sandbox =
      params.has('canonical') ||
      params.has('wall') ||
      params.has('barrier') ||
      params.has('keeper') ||
      params.has('sandbox');
    if (sandbox) this.game.enableSandbox();
    else this.showMenu();
  }

  private showMenu(): void {
    this.progress = loadProgress();
    this.game.hideLevelUi();
    this.renderGrid();
    this.coinsEl.textContent = t('menu.coins', { n: this.progress.coins });
    this.menuRoot.classList.add('show');
  }

  private renderGrid(): void {
    this.grid.replaceChildren();
    this.levels.forEach((level, index) => {
      const unlocked = isUnlocked(this.progress, this.ids, index);
      const stars = starsFor(this.progress, level.id);
      const cell = document.createElement('button');
      cell.className = `level-cell${unlocked ? '' : ' locked'}`;
      cell.disabled = !unlocked;

      const num = document.createElement('div');
      num.className = 'cell-num';
      num.textContent = unlocked ? String(level.order) : '🔒';
      const name = document.createElement('div');
      name.className = 'cell-name';
      name.textContent = unlocked ? t(level.nameKey) : t('common.locked');
      const starRow = document.createElement('div');
      starRow.className = 'cell-stars';
      for (let i = 1; i <= 3; i++) {
        const s = document.createElement('span');
        s.className = i <= stars ? 'star on' : 'star';
        s.textContent = '★';
        starRow.append(s);
      }
      cell.append(num, name, starRow);
      if (unlocked) cell.addEventListener('click', () => this.play(index));
      this.grid.append(cell);
    });
  }

  private play(index: number): void {
    this.currentIndex = index;
    this.menuRoot.classList.remove('show');
    this.game.loadLevel(this.levels[index]!);
  }

  private playNextOrMenu(): void {
    const next = this.currentIndex + 1;
    this.progress = loadProgress();
    if (next < this.levels.length && isUnlocked(this.progress, this.ids, next)) {
      this.play(next);
    } else {
      this.showMenu();
    }
  }
}
