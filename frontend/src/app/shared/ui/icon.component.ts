import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'plane'
  | 'plane-takeoff'
  | 'plane-landing'
  | 'calendar'
  | 'search'
  | 'exit-left'
  | 'exit-right'
  | 'restroom';

/**
 * Iconos de Lucide (https://lucide.dev, licencia ISC) como SVG en la plantilla: sin dependencias,
 * sin peticiones externas y sin `innerHTML` (principio X). Decorativos: el texto lo da la etiqueta.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('plane') {
          <svg:path
            d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
          />
        }
        @case ('plane-takeoff') {
          <svg:path d="M2 22h20" />
          <svg:path
            d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z"
          />
        }
        @case ('plane-landing') {
          <svg:path d="M2 22h20" />
          <svg:path
            d="M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z"
          />
        }
        @case ('calendar') {
          <svg:rect width="18" height="18" x="3" y="4" rx="2" />
          <svg:path d="M16 2v4" />
          <svg:path d="M8 2v4" />
          <svg:path d="M3 10h18" />
        }
        @case ('search') {
          <svg:circle cx="11" cy="11" r="8" />
          <svg:path d="m21 21-4.3-4.3" />
        }
        @case ('exit-left') {
          <svg:path d="M21 4v16" />
          <svg:path d="M15 12H3" />
          <svg:path d="m9 6-6 6 6 6" />
        }
        @case ('exit-right') {
          <svg:path d="M3 4v16" />
          <svg:path d="M9 12h12" />
          <svg:path d="m15 6 6 6-6 6" />
        }
        @case ('restroom') {
          <svg:path
            d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.6a.5.5 0 0 0-.42.77l1.54 2.47a.5.5 0 0 1-.42.76H5.4a.5.5 0 0 1-.42-.76L7 18"
          />
          <svg:path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
}
