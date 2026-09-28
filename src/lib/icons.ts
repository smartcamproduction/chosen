import {
  BookOpen,
  Briefcase,
  Camera,
  Clapperboard,
  FileDown,
  GraduationCap,
  Image,
  LayoutTemplate,
  Megaphone,
  Newspaper,
  Pin,
  Search,
  Shirt,
  Smartphone,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Icon names stored in the database (hustles.icon) → icon components.
 * Add a line here when you use a new icon name in the database.
 */
const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  briefcase: Briefcase,
  camera: Camera,
  clapperboard: Clapperboard,
  'file-down': FileDown,
  'graduation-cap': GraduationCap,
  image: Image,
  'layout-template': LayoutTemplate,
  megaphone: Megaphone,
  newspaper: Newspaper,
  pin: Pin,
  search: Search,
  shirt: Shirt,
  smartphone: Smartphone,
  sparkles: Sparkles,
  workflow: Workflow,
};

export function iconByName(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Sparkles;
}
