'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '../lib/supabase-browser';
export default function AppShell({children,title}){
 const router=useRouter();
 const [menuOpen,setMenuOpen]=useState(false);
 async function logout(){await supabaseBrowser().auth.signOut();router.push('/login');router.refresh();}
 const closeMenu=()=>setMenuOpen(false);
 return <div className="shell"><aside className={`sidebar${menuOpen?' is-open':''}`} aria-label="Primary navigation"><div className="sidebar-head"><div className="brand">Delegation</div><button className="sidebar-close" type="button" aria-label="Close navigation" onClick={closeMenu}>×</button></div><nav className="nav" id="primary-navigation">
 {['dashboard','tasks','employees','mis','settings'].map(x=><Link key={x} href={'/'+x} onClick={closeMenu}>{x[0].toUpperCase()+x.slice(1)}</Link>)}
 </nav></aside>{menuOpen&&<button className="nav-backdrop" type="button" aria-label="Close navigation" onClick={closeMenu}/>}<main className="main"><div className="top"><div className="top-start"><button className="menu-toggle" type="button" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}>☰</button><div className="top-copy"><h1 className="page-title">{title}</h1><div className="muted">Arham task accountability system</div></div></div><button className="btn secondary" onClick={logout}>Sign out</button></div>{children}</main></div>
}
