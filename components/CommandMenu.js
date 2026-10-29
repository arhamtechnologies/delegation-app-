'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { StatusIcon } from './Workflow';
import { goShortcuts } from './WorkspaceShortcuts';
import { supabaseBrowser } from '../lib/supabase-browser';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { Spinner } from './Loader';

function useTaskSearch(query, enabled) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const term = query.trim();
    if (!enabled || term.length < 2) { setResults([]); setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const { data } = await supabaseBrowser().from('work_items')
        .select('id,kind,title,employee_name,effective_status')
        .ilike('search_text', `%${term.slice(0, 80)}%`)
        .order('sort_group', { ascending: true })
        .order('sort_key', { ascending: true })
        .limit(8)
        .abortSignal(controller.signal);
      if (!controller.signal.aborted) { setResults(data || []); setLoading(false); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [enabled, query]);
  return { results, loading };
}

export function CommandMenu({ open, onOpenChange, navItems, canCreate }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { results, loading } = useTaskSearch(query, open);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  function run(href) {
    onOpenChange(false);
    router.push(href);
  }

  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Command menu" description="Jump to a screen, run an action or find work." className="sm:max-w-xl">
    <Command className="rounded-none!">
    <CommandInput placeholder="Type a command or search work…" value={query} onValueChange={setQuery} />
    <CommandList className="max-h-[min(60dvh,420px)]">
      <CommandEmpty>{loading ? <><Spinner />Searching…</> : 'No results found.'}</CommandEmpty>
      {results.length > 0 && <CommandGroup heading="Work">
        {results.map((item) => <CommandItem key={`${item.kind}-${item.id}`} value={`work ${item.title} ${item.employee_name || ''} ${query}`} onSelect={() => run(item.kind === 'checklist' ? `/tasks/checklist/${item.id}` : `/tasks/${item.id}`)}>
          <StatusIcon status={item.effective_status} size={15} />
          <span className="truncate">{item.title}</span>
          <span className="ml-auto truncate text-xs text-muted-foreground">{item.employee_name}</span>
        </CommandItem>)}
      </CommandGroup>}
      {canCreate && <CommandGroup heading="Actions">
        <CommandItem value="create new task" onSelect={() => run('/tasks?create=1')}><Icon name="plus" size={16} />Create task<CommandShortcut>C</CommandShortcut></CommandItem>
      </CommandGroup>}
      <CommandSeparator />
      <CommandGroup heading="Go to">
        {navItems.map((item) => {
          const key = Object.entries(goShortcuts).find(([, href]) => href === item.href)?.[0];
          return <CommandItem key={item.href} value={`go ${item.label}`} onSelect={() => run(item.href)}>
            <Icon name={item.icon} size={16} />{item.label}
            {key && <CommandShortcut>G {key.toUpperCase()}</CommandShortcut>}
          </CommandItem>;
        })}
      </CommandGroup>
    </CommandList>
    </Command>
  </CommandDialog>;
}

