import {
  Bed,
  BedDouble,
  Binoculars,
  Bus,
  CalendarCheck,
  CalendarDays,
  Car,
  CarTaxiFront,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Copy,
  Croissant,
  DatabaseBackup,
  Ellipsis,
  FerrisWheel,
  FileDown,
  FileText,
  FileX,
  Flag,
  Flower2,
  Footprints,
  Frame,
  Globe,
  Hotel,
  House,
  Image,
  Landmark,
  Link,
  ListChecks,
  Luggage,
  MapPin,
  MountainSnow,
  NotebookPen,
  NotebookText,
  Paperclip,
  PartyPopper,
  Pin,
  Plane,
  PlaneTakeoff,
  Plus,
  ReceiptText,
  Route,
  Search,
  Settings,
  Shapes,
  Share2,
  ShieldCheck,
  Ship,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  SquareCheckBig,
  SquareParking,
  Store,
  Sun,
  Tent,
  Theater,
  Ticket,
  TrainFront,
  Users,
  TriangleAlert,
  Utensils,
  Van,
  Wallet,
  Wine,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import type { Subkind, TripItemKind } from '../../domain/tripItem';
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
  // A time zone, the chip that opens its picker, and a notice worth checking (N6).
  zone: Globe,
  expand: ChevronDown,
  warning: TriangleAlert,
  // Expense categories (N5).
  food: Utensils,
  groceries: ShoppingBasket,
  transport: Bus,
  activities: Ticket,
  shopping: ShoppingBag,
  accommodation: BedDouble,
  other: Shapes,
  // What an add button adds, when it is not an item (F2).
  addExpense: ReceiptText,
  addNote: NotebookPen,
  // Fieldbook (B, C).
  pin: Pin,
  copy: Copy,
  missingFile: FileX,
  settings: Settings,
  lists: ListChecks,
  packing: Luggage,
  shoppingList: ShoppingCart,
  travellers: Users,
  pdf: FileDown,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

/** Lucide at a heavier stroke, as the Organic system asks. */
export function Icon({ name, size = 22, color, strokeWidth = 2.2 }: Props) {
  const c = useColors();
  const Glyph = ICONS[name];
  return <Glyph size={size} color={color ?? c.text} strokeWidth={strokeWidth} />;
}

/**
 * An item's icon by what it is (F1): the subkind's when it has one, the kind's otherwise. Typed
 * against every kind and subkind, so a new one without an icon does not compile. Shape, not colour,
 * tells them apart (WCAG 1.4.1).
 */
const ITEM_ICONS = {
  transport: Route,
  flight: Plane,
  train: TrainFront,
  bus: Bus,
  ferry: Ship,
  car: Car,
  taxi: CarTaxiFront,
  transfer: Van,
  walk: Footprints,
  stay: BedDouble,
  hotel: Hotel,
  apartment: House,
  hostel: Bed,
  guesthouse: House,
  camping: Tent,
  activity: Ticket,
  museum: Landmark,
  gallery: Frame,
  tour: Flag,
  attraction: FerrisWheel,
  event: PartyPopper,
  theatre: Theater,
  outdoor: MountainSnow,
  spa: Flower2,
  food: Utensils,
  restaurant: Utensils,
  cafe: Coffee,
  bar: Wine,
  bakery: Croissant,
  market: Store,
  task: SquareCheckBig,
  'check-in': PlaneTakeoff,
  booking: CalendarCheck,
  document: FileText,
  packing: Luggage,
  other: Shapes,
  luggage: Luggage,
  insurance: ShieldCheck,
  parking: SquareParking,
  shopping: ShoppingBag,
  viewpoint: Binoculars,
} satisfies Record<TripItemKind | Subkind, LucideIcon>;

export type ItemIconKey = keyof typeof ITEM_ICONS;

export function ItemIcon({
  iconKey,
  size = 20,
  color,
}: {
  iconKey: ItemIconKey;
  size?: number;
  color?: string;
}) {
  const c = useColors();
  const Glyph = ITEM_ICONS[iconKey];
  return <Glyph size={size} color={color ?? c.text} strokeWidth={2.2} />;
}
