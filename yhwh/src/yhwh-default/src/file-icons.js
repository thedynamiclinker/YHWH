import {
  ArrowLeft, ArrowRight, ChevronRight, CornerLeftUp, Ellipsis, Eye, EyeOff,
  FilePlus, FileText, Folder, FolderOpen, FolderPlus, House, List, Grid2X2,
  Maximize, RefreshCw, Orbit, DoorOpen, Terminal as TerminalIcon, createElement,
} from 'lucide';

const icons = {
  back: ArrowLeft, forward: ArrowRight, parent: CornerLeftUp, expand: ChevronRight,
  more: Ellipsis, visible: Eye, hidden: EyeOff, newFile: FilePlus, file: FileText,
  folder: Folder, openFolder: FolderOpen, newFolder: FolderPlus, home: House,
  maximize: Maximize, refresh: RefreshCw, list: List, grid: Grid2X2,
  newUniverse: Orbit, enterUniverse: DoorOpen, chrootUniverse: TerminalIcon,
};

export const fileIcons = Object.fromEntries(Object.entries(icons).map(([name, [tag, attrs, children]]) => [
  name,
  createElement([tag, {
    ...attrs, class: 'file-control-icon', width: 18, height: 18, 'stroke-width': 1.75,
    'aria-hidden': 'true', focusable: 'false',
  }, children]).outerHTML,
]));
