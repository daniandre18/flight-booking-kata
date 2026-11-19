import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  createSearchFlightsQuerySchema,
  toBogotaDate,
  type SearchFlightsQuery,
} from '@kata/shared';
import { SearchFormComponent } from './search-form.component';
import { SearchHeroComponent } from './search-hero.component';
import { SearchResultsComponent } from './search-results.component';
import { SearchResultsStore } from './search-results.store';

const DAY_MS = 86_400_000;

/** `/search`: formulario, resultados en vivo y store; la consulta vive en la URL (recargable). */
@Component({
  selector: 'app-search-page',
  imports: [SearchHeroComponent, SearchFormComponent, SearchResultsComponent],
  providers: [SearchResultsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-search-hero />
    <app-search-form [initial]="initial()" (search)="onSearch($event)" />
    @switch (store.status()) {
      @case ('loading') {
        <p role="status">Buscando vuelos…</p>
      }
      @case ('ready') {
        <app-search-results [flights]="store.flights()" [notices]="store.notices()" />
      }
      @case ('error') {
        <p class="notice notice-danger" role="alert">
          No pudimos cargar los vuelos. Intenta de nuevo.
        </p>
      }
    }
  `,
})
export class SearchPage implements OnInit {
  readonly origin = input<string>();
  readonly destination = input<string>();
  readonly date = input<string>();

  protected readonly store = inject(SearchResultsStore);
  private readonly router = inject(Router);

  private readonly fromUrl = computed(() =>
    createSearchFlightsQuerySchema().safeParse({
      origin: this.origin(),
      destination: this.destination(),
      date: this.date(),
    }),
  );

  protected readonly initial = computed<SearchFlightsQuery>(() => {
    const parsed = this.fromUrl();
    return parsed.success
      ? parsed.data
      : { origin: 'BOG', destination: 'MDE', date: toBogotaDate(new Date(Date.now() + DAY_MS)) };
  });

  ngOnInit(): void {
    const parsed = this.fromUrl();
    if (parsed.success) {
      void this.store.search(parsed.data);
    }
  }

  protected onSearch(query: SearchFlightsQuery): void {
    void this.router.navigate([], { queryParams: query, replaceUrl: true });
    void this.store.search(query);
  }
}
