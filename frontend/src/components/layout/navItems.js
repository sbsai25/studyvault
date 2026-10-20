import { Layers, LayoutDashboard, Library, MessagesSquare, TextCursorInput } from 'lucide-react';

// Primary navigation. Only pages that exist are listed.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/library', label: 'My Library', icon: Library },
  { to: '/chat', label: 'AI Chat', icon: MessagesSquare },
  { to: '/flashcards', label: 'Flashcards', icon: Layers },
  { to: '/fill-blanks', label: 'Fill in the Blanks', icon: TextCursorInput },
];
