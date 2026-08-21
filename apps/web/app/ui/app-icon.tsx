import {
  Archive,
  ArrowRight,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronLeft,
  ChevronsUpDown,
  CirclePlus,
  Compass,
  Dumbbell,
  FilePenLine,
  FileSpreadsheet,
  Home,
  History,
  Lightbulb,
  Minus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  ShoppingBag,
  SkipForward,
  Trash2,
  Upload,
  UserRound,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";

const icons = {
  archive: Archive,
  back: ChevronLeft,
  calendar: CalendarDays,
  check: Check,
  close: X,
  feed: Compass,
  home: Home,
  history: History,
  tip: Lightbulb,
  import: FileSpreadsheet,
  increase: Plus,
  plan: FilePenLine,
  pause: Pause,
  play: Play,
  more: MoreHorizontal,
  decrease: Minus,
  plus: CirclePlus,
  profile: UserRound,
  progress: ChartNoAxesColumnIncreasing,
  reset: RotateCcw,
  settings: Settings,
  select: ChevronsUpDown,
  shop: ShoppingBag,
  skip: SkipForward,
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
