import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Plus, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import ViewLink from './ViewLink';
import { creationDestinations } from './navigation';
export default function CreateMenu({ onNavigate, active = false }) {
  const [open, setOpen] = useState(false);
  return <Menu.Root open={open} onOpenChange={setOpen}><Menu.Trigger asChild><Button variant="primary" className={`create-menu-trigger${active ? ' is-active' : ''}`}><Plus size={18} aria-hidden="true"/><span>Create</span><ChevronDown size={14} className="create-chevron" aria-hidden="true"/></Button></Menu.Trigger>
    <Menu.Portal><Menu.Content className="ui-menu" sideOffset={8} collisionPadding={12} align="end" aria-label="Create content">
      {creationDestinations.map(item => <Menu.Item key={item.view} asChild><ViewLink view={item.view} onNavigate={view => { setOpen(false); onNavigate(view); }}>{item.label}</ViewLink></Menu.Item>)}
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}
