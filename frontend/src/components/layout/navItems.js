import { Layers, LayoutDashboard } from 'lucide-react';

// Primary navigation. Only pages that exist are listed.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/flashcards', label: 'Flashcards', icon: Layers },
];
