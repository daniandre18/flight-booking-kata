import { type Routes } from '@angular/router';

/** Rutas lazy por pantalla (plan.md: búsqueda, mapa, pago, boleto, tablero y admin). */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'search' },
  {
    path: 'search',
    title: 'Buscar vuelos',
    loadComponent: () => import('./features/search/search.page').then((m) => m.SearchPage),
  },
  {
    path: 'flights/:id/seats',
    title: 'Elegir asientos',
    loadComponent: () => import('./features/seat-map/seat-map.page').then((m) => m.SeatMapPage),
  },
  {
    path: 'checkout',
    title: 'Pago',
    loadComponent: () => import('./features/checkout/checkout.page').then((m) => m.CheckoutPage),
  },
  {
    path: 'booking/:code',
    title: 'Tu boleto',
    loadComponent: () => import('./features/booking/booking.page').then((m) => m.BookingPage),
  },
  {
    path: 'booking',
    title: 'Consultar boleto',
    loadComponent: () => import('./features/booking/booking.page').then((m) => m.BookingPage),
  },
  {
    path: 'flights/:id/dashboard',
    title: 'Tablero del vuelo',
    loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'admin',
    title: 'Administración',
    loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: 'search' },
];
