'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '../lib/supabase-browser';
export default function AppShell({children,title}){
 const router=useRouter();
 async function logout(){await supabaseBrowser().auth.signOut();router.push('/login');router.refresh();}
 return <div className="shell"><aside className="sidebar"><div className="brand">Delegation</div><nav className="nav">
 {['dashboard','tasks','employees','mis','settings'].map(x=><Link key={x} href={'/'+x}>{x[0].toUpperCase()+x.slice(1)}</Link>)}
 </nav></aside><main className="main"><div className="top"><div><h1 style={{margin:0}}>{title}</h1><div className="muted">Arham task accountability system</div></div><button className="btn secondary" onClick={logout}>Sign out</button></div>{children}</main></div>
}
