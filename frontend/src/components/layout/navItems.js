import { Layers, LayoutDashboard, Library } from 'lucide-react';

// Primary navigation. Only pages that exist are listed.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/library', label: 'My Library', icon: Library },
  { to: '/flashcards', label: 'Flashcards', icon: Layers },
];
