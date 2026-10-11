import {
  BedDouble,
  Bus,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  Ellipsis,
  FileText,
  Image,
  Link,
  MapPin,
  NotebookText,
  Paperclip,
  Plus,
  Search,
  Shapes,
  Share2,
  ShoppingBag,
  ShoppingBasket,
  Sun,
  Ticket,
  Utensils,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { useColors } from '../tokens';

/**
 * The app's icon vocabulary. Screens say what an icon means; this map decides how it is drawn,
 * so changing the icon set touches this file and nothing else.
 */
const ICONS = {
  back: ChevronLeft,
  forward: ChevronRight,
  close: X,
  add: Plus,
  check: Check,
  more: Ellipsis,
  search: Search,
  now: Sun,
  timeline: CalendarDays,
  places: MapPin,
  notes: NotebookText,
  file: FileText,
  image: Image,
  link: Link,
  ticket: Ticket,
  wallet: Wallet,
  backup: DatabaseBackup,
  share: Share2,
  receipt: Paperclip,
  // Expense categories (N5).
  food: Utensils,
  groceries: ShoppingBasket,
  transport: Bus,
  activities: Ticket,
  shopping: ShoppingBag,
  accommodation: BedDouble,
  other: Shapes,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

/** Lucide at a heavier stroke, as the Organic system asks. */
export function Icon({ name, size = 22, color, strokeWidth = 2.2 }: Props) {
  const c = useColors();
  const Glyph = ICONS[name];
  return <Glyph size={size} color={color ?? c.text} strokeWidth={strokeWidth} />;
}
