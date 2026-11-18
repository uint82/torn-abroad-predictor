import './styles/main.scss';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root not found');
}

root.textContent = 'Loading Torn Abroad Predictor...';
