import {
  ChartColumn,
  Layers,
  LayoutDashboard,
  Library,
  MessagesSquare,
  Settings,
  TextCursorInput,
} from 'lucide-react';

// Primary navigation
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/library', label: 'My Library', icon: Library },
  { to: '/chat', label: 'AI Chat', icon: MessagesSquare },
  { to: '/flashcards', label: 'Flashcards', icon: Layers },
  { to: '/fill-blanks', label: 'Fill in the Blanks', icon: TextCursorInput },
  { to: '/progress', label: 'Progress', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
];
