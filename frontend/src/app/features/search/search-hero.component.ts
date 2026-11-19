import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Banner de la búsqueda: degradado navy con una ilustración vectorial sutil (nubes, ruta de vuelo
 * y avión) dibujada en SVG en la plantilla. Es decorativa: `aria-hidden` y sin texto.
 */
@Component({
  selector: 'app-search-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero" aria-labelledby="hero-title">
      <svg
        class="art"
        viewBox="0 0 1200 320"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <svg:defs>
          <svg:radialGradient id="hero-glow" cx="78%" cy="18%" r="55%">
            <svg:stop offset="0" stop-color="#38bdf8" stop-opacity="0.35" />
            <svg:stop offset="1" stop-color="#38bdf8" stop-opacity="0" />
          </svg:radialGradient>
        </svg:defs>
        <svg:rect width="1200" height="320" fill="url(#hero-glow)" />
        <!-- Nubes -->
        <svg:g fill="#ffffff" opacity="0.07">
          <svg:ellipse cx="160" cy="250" rx="190" ry="48" />
          <svg:ellipse cx="300" cy="230" rx="120" ry="40" />
          <svg:ellipse cx="980" cy="270" rx="230" ry="52" />
          <svg:ellipse cx="840" cy="250" rx="130" ry="38" />
          <svg:ellipse cx="620" cy="90" rx="110" ry="22" />
        </svg:g>
        <svg:g fill="#ffffff" opacity="0.05">
          <svg:ellipse cx="420" cy="300" rx="260" ry="46" />
          <svg:ellipse cx="1120" cy="130" rx="120" ry="26" />
        </svg:g>
        <!-- Ruta de vuelo punteada -->
        <svg:path
          d="M-20 230 C 240 120, 520 260, 790 140 S 1060 70, 1220 40"
          fill="none"
          stroke="#7dd3fc"
          stroke-opacity="0.35"
          stroke-width="2"
          stroke-dasharray="2 10"
          stroke-linecap="round"
        />
        <!-- Avión (silueta de Lucide escalada) -->
        <svg:g
          transform="translate(905 58) rotate(28) scale(3.2)"
          fill="none"
          stroke="#e0f2fe"
          stroke-opacity="0.55"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <svg:path
            d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
          />
        </svg:g>
      </svg>

      <div class="content">
        <p class="eyebrow">Reservas en tiempo real</p>
        <h2 id="hero-title">Encuentra tu próximo vuelo</h2>
        <p class="lead">
          Elige tu asiento en un mapa en vivo: lo que ves es exactamente lo que está disponible.
        </p>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      /* Ancho completo aunque la página viva dentro del contenedor de 1200 px. */
      margin-inline: calc(50% - 50vw);
      margin-top: calc(-1 * var(--space-4));
    }
    .hero {
      position: relative;
      overflow: hidden;
      color: var(--on-navy);
      background:
        linear-gradient(180deg, var(--navy-900) 0%, transparent 40%),
        linear-gradient(115deg, var(--navy-800) 0%, var(--navy-700) 55%, var(--navy-600) 100%);
      /* Espacio inferior para que la tarjeta del buscador flote sobre el borde. */
      padding: var(--space-8) var(--space-4) 6.5rem;
    }
    .art {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .content {
      position: relative;
      max-width: 1200px;
      margin: 0 auto;
      padding-inline: var(--space-4);
    }
    .eyebrow {
      display: inline-block;
      margin: 0 0 var(--space-2);
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      background: rgb(125 211 252 / 0.14);
      color: var(--navy-accent);
      font-size: var(--font-size-sm);
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0 0 var(--space-2);
      font-size: clamp(1.75rem, 4vw, 2.75rem);
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .lead {
      margin: 0;
      max-width: 36rem;
      color: var(--on-navy-muted);
      font-size: var(--font-size-lg);
    }
    @media (max-width: 640px) {
      .hero {
        padding: var(--space-6) var(--space-2) 5.5rem;
      }
      .lead {
        font-size: var(--font-size-md);
      }
    }
  `,
})
export class SearchHeroComponent {}
