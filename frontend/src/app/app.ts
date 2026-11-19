import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Shell de la aplicación. El badge de conexión se añade en la fase 7 (RUX-018). */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
