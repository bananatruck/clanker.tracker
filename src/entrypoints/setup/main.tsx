import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Setup from './Setup';
import '@/ui/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <StrictMode>
    <Setup />
  </StrictMode>,
);
