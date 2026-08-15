import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  CirclePlus,
  Compass,
  Dumbbell,
  FilePenLine,
  FileSpreadsheet,
  Home,
  Pencil,
  Play,
  RotateCcw,
  Settings,
  ShoppingBag,
  Trash2,
  Upload,
  UserRound,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";

const icons = {
  archive: Archive,
  back: ArrowLeft,
  calendar: CalendarDays,
  check: Check,
  close: X,
  edit: Pencil,
  feed: Compass,
  home: Home,
  import: FileSpreadsheet,
  plan: FilePenLine,
  play: Play,
  plus: CirclePlus,
  profile: UserRound,
  progress: ChartNoAxesColumnIncreasing,
  reset: RotateCcw,
  settings: Settings,
  shop: ShoppingBag,
  trash: Trash2,
  upload: Upload,
  utensils: Utensils,
  workouts: Dumbbell,
  forward: ArrowRight,
} satisfies Record<string, LucideIcon>;

export type AppIconName = keyof typeof icons;

export function AppIcon({
  name,
  size = 24,
}: Readonly<{ name: AppIconName; size?: number }>) {
  const Icon = icons[name];
  return (
    <Icon aria-hidden="true" focusable="false" size={size} strokeWidth={2.2} />
  );
}
