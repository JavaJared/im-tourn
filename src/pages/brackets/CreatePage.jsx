import BracketLoader from '../../components/BracketLoader';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createCustomBracket, createStandardBracket } from '../../services/customBracketService';
import { generateSeededBracket } from '../../lib/standardBracket';
import { MAX_PARTICIPANTS } from '../../lib/customBracket';
import BracketBoard from '../../components/BracketBoard';
import { CATEGORIES } from '../../config/app.js';

export default function CreatePage({ onNavigate }) {
  const { currentUser } = useAuth();
  const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[category,setCategory]=useState('');
  const [step,setStep]=useState(0),[count,setCount]=useState('16'),[entries,setEntries]=useState(Array(16).fill(''));
  const [showSeeds,setShowSeeds]=useState(true),[paste,setPaste]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef(false),heading=useRef(null);
  useEffect(()=>{heading.current?.focus();},[step]);
  const size=Number(count),validCount=Number.isInteger(size)&&size>=2&&size<=MAX_PARTICIPANTS;
  const names=entries.slice(0,validCount?size:0);
  const ready=validCount&&names.length===size&&names.every(name=>name.trim());
  const preview=useMemo(()=>ready?generateSeededBracket(names):null,[entries,count]);
  const displayedPreview=useMemo(()=>{
    if(!preview||showSeeds)return preview;
    return {...preview,boxes:Object.fromEntries(Object.entries(preview.boxes).map(([id,box])=>[id,{...box,slotA:{...box.slotA,seed:undefined},slotB:{...box.slotB,seed:undefined}}]))};
  },[preview,showSeeds]);
  const changeCount=value=>{setCount(value);const n=Number(value);if(Number.isInteger(n)&&n>=2&&n<=MAX_PARTICIPANTS)setEntries(previous=>Array.from({length:Math.max(previous.length,n)},(_,i)=>previous[i]||''));};
  const create=async(advanced=false)=>{
    if(pending.current||!currentUser||!title.trim()||!category||(!advanced&&!ready))return;
    pending.current=true;setBusy(true);setError('');
    try {
      const common={hostId:currentUser.uid,hostName:currentUser.displayName||null,title:title.trim(),description,category};
      const id=advanced?await createCustomBracket({...common,initialState:preview}):await createStandardBracket({...common,entries:names.map(name=>({name}))});
      onNavigate(`custom-bracket-${id}`);
    }catch(reason){setError(reason.message||'Could not save the bracket. Your entries are still here.');}
    finally{pending.current=false;setBusy(false);}
  };
  if(!currentUser)return <div className="create-container"><h1>Create a bracket</h1><p>Please log in to create a bracket.</p></div>;
  return <div className="create-container create-flow">
    <h1>Create a bracket</h1>
    <ol className="creation-steps" aria-label="Creation progress">{['Details','Entries','Review'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined}>{index+1}. {label}</li>)}</ol>
    <div className="form-card">
      <h2 ref={heading} tabIndex={-1}>{['Details','Entries','Review matchups'][step]}</h2>
      {step===0&&<>
        <label className="form-group">Bracket title<input className="form-input" value={title} maxLength={200} required onChange={e=>setTitle(e.target.value)}/></label>
        <label className="form-group">Category<select className="form-input" value={category} required onChange={e=>setCategory(e.target.value)}><option value="">Choose category</option>{CATEGORIES.map(cat=><option key={cat}>{cat}</option>)}</select></label>
        <label className="form-group">Description (optional)<textarea className="form-input" maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
      </>}
      {step===1&&<>
        <label className="form-group">Number of entries<input className="form-input" type="number" min="2" max={MAX_PARTICIPANTS} value={count} onChange={e=>changeCount(e.target.value)} aria-describedby="entry-count-help"/></label>
        <p id="entry-count-help">{validCount?`${2**Math.ceil(Math.log2(size))-size} automatic byes`:`Choose 2–${MAX_PARTICIPANTS} entries.`}</p>
        <div className="size-options" aria-label="Common entry counts">{[4,8,16,32,64].map(n=><button type="button" className={`size-option ${size===n?'selected':''}`} aria-pressed={size===n} key={n} onClick={()=>changeCount(String(n))}>{n}</button>)}</div>
        <label className="seed-toggle"><input type="checkbox" checked={showSeeds} onChange={e=>setShowSeeds(e.target.checked)}/>Show seed numbers in preview</label>
        <p className="field-help">Entry order determines seeds. Top seeds receive byes.</p>
        <details className="paste-entries"><summary>Paste an entry list</summary><label>One participant per line<textarea className="form-input" value={paste} onChange={e=>setPaste(e.target.value)}/></label><button className="back-btn" type="button" onClick={()=>{
          const list=paste.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
          if(list.length<2||list.length>MAX_PARTICIPANTS){setError(`Paste 2–${MAX_PARTICIPANTS} entries.`);return;}
          setEntries(list);setCount(String(list.length));setError('');
        }}>Use list</button></details>
        {validCount&&<div className="entries-list">{names.map((name,index)=><label className="entry-row" key={index}><span className="entry-seed">{showSeeds?index+1:<span className="sr-only">Entry {index+1}</span>}</span><input className="entry-input" aria-label={`Entry ${index+1}`} value={name} maxLength={200} onChange={e=>setEntries(previous=>previous.map((value,i)=>i===index?e.target.value:value))}/></label>)}</div>}
      </>}
      {step===2&&preview&&<><h3>{title}</h3><div className="creation-preview"><BracketBoard state={displayedPreview} editable={false}/></div></>}
      {error&&<p role="alert">{error}</p>}
      <div className="creation-actions">
        {step>0&&<button className="back-btn" disabled={busy} onClick={()=>{setError('');setStep(step-1);}}>Back</button>}
        {step<2?<button className="nav-btn" disabled={busy||(step===0? !title.trim()||!category:!ready)} onClick={()=>{setError('');setStep(step+1);}}>{step===0?'Add entries':'Review matchups'}</button>:<button className="nav-btn" disabled={busy||!ready} onClick={()=>create()}>{busy?<BracketLoader inline label="Saving…"/>:'Publish bracket'}</button>}
      </div>
      <details className="advanced-layout"><summary>Advanced layout</summary><button className="back-btn" disabled={busy||!title.trim()||!category} onClick={()=>create(true)}>{preview?'Edit this layout as a draft':'Start a free-form draft'}</button></details>
    </div>
  </div>;
}
