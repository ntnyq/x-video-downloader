import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FilmIcon,
  HistoryIcon,
  KeyboardIcon,
  PaletteIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from '@lucide/vue'
import type { IconName } from '../types/icon'

/**
 * Lucide components associated with the extension's semantic icon names.
 */
export const ICONS = {
  alert: TriangleAlertIcon,
  back: ArrowLeftIcon,
  check: CheckIcon,
  chevronDown: ChevronDownIcon,
  clock: ClockIcon,
  close: XIcon,
  download: DownloadIcon,
  external: ExternalLinkIcon,
  file: FileTextIcon,
  help: CircleHelpIcon,
  history: HistoryIcon,
  keyboard: KeyboardIcon,
  palette: PaletteIcon,
  pause: PauseIcon,
  play: PlayIcon,
  refresh: RefreshCwIcon,
  search: SearchIcon,
  settings: Settings2Icon,
  trash: Trash2Icon,
  video: FilmIcon,
} satisfies Record<IconName, typeof DownloadIcon>
