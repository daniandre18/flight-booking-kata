import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'plane'
  | 'ticket'
  | 'key'
  | 'mail'
  | 'shield'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'clock'
  | 'alert'
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
        @case ('ticket') {
          <svg:path d="M2 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3Z" />
          <svg:path d="M13 5v2" />
          <svg:path d="M13 17v2" />
          <svg:path d="M13 11v2" />
        }
        @case ('key') {
          <svg:circle cx="7.5" cy="15.5" r="5.5" />
          <svg:path d="m21 2-9.6 9.6" />
          <svg:path d="m15 6 3 3" />
        }
        @case ('mail') {
          <svg:rect width="20" height="16" x="2" y="4" rx="2" />
          <svg:path d="m22 7-8.97 5.7a2 2 0 0 1-2.06 0L2 7" />
        }
        @case ('shield') {
          <svg:path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z" />
          <svg:path d="m9 12 2 2 4-4" />
        }
        @case ('lock') {
          <svg:rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <svg:path d="M7 11V7a5 5 0 0 1 10 0v4" />
        }
        @case ('eye') {
          <svg:path d="M2.1 12.2a1 1 0 0 1 0-.4C3.6 7.9 7.4 5 12 5s8.4 2.9 9.9 6.8a1 1 0 0 1 0 .4C20.4 16.1 16.6 19 12 19s-8.4-2.9-9.9-6.8Z" />
          <svg:circle cx="12" cy="12" r="3" />
        }
        @case ('eye-off') {
          <svg:path d="m2 2 20 20" />
          <svg:path d="M6.7 6.7C4.5 8.1 3 10.1 2.1 12a1 1 0 0 0 0 .4C3.6 16.1 7.4 19 12 19c1.8 0 3.5-.4 4.9-1.1" />
          <svg:path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <svg:path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c4.6 0 8.4 2.9 9.9 6.8a1 1 0 0 1 0 .4c-.4 1-1.1 2-1.9 2.9" />
        }
        @case ('clock') {
          <svg:circle cx="12" cy="12" r="9" />
          <svg:path d="M12 7v5l3 2" />
        }
        @case ('alert') {
          <svg:path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
          <svg:path d="M12 9v4" />
          <svg:path d="M12 17h.01" />
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
