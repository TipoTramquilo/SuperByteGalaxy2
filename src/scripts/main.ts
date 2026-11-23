/* Punto de entrada: cada módulo busca su sección y no hace nada si no está en la página. */
import { initReveal } from './reveal';
import { initNav } from './nav';
import { initServices } from './services';
import { initProducts } from './products';
import { initMethod } from './method';
import { initAbout } from './about';
import { initContact } from './contact';
import { initEffects } from './effects';

initReveal();
initEffects();
initNav();
initServices();
initProducts();
initMethod();
initAbout();
initContact();
