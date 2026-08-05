'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabase-browser';
export default function Login(){const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const router=useRouter();
 async function submit(e){e.preventDefault();setError('');const {error}=await supabaseBrowser().auth.signInWithPassword({email,password});if(error)return setError(error.message);router.push('/dashboard');router.refresh();}
 return <div className="login"><h1>Delegation App</h1><p className="muted">Sign in with your company account.</p><form onSubmit={submit}><label>Email</label><input className="input" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/><label>Password</label><input className="input" type="password" required value={password} onChange={e=>setPassword(e.target.value)}/>{error&&<div className="error">{error}</div>}<button className="btn" style={{width:'100%'}}>Sign in</button></form></div>}
