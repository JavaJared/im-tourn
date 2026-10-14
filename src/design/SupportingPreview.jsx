// Development-only examples. Private features remain gated in AppRoutes.
import { useState } from 'react';
import { ItemTile, ItemModal } from '../pages/tiers/shared';
import { DraftCard } from '../pages/drafts/shared';
export default function SupportingPreview() {
  const [item,setItem]=useState({id:'example',label:'Pizza'}),[editing,setEditing]=useState(false);
  const [selected,setSelected]=useState(false);
  return <section className="preview-section" id="supporting-review">
    <h2>Supporting screens · local examples</h2>
    <div className="preview-grid">
      <section className="kt-page"><h3>Private tier editor</h3>
        <label className="kt-field-label" htmlFor="example-tier-title">List title</label><input id="example-tier-title" className="kt-input" defaultValue="Game-day food"/>
        <div className="kt-tier"><div className="kt-tier-head"><h4 className="kt-tier-name">Favorites</h4></div><div className="kt-slots"><ItemTile item={item} selected={selected} onClick={()=>setSelected(v=>!v)} ariaLabel="Select Pizza"/><ItemTile empty selected={selected} onClick={()=>setSelected(false)} ariaLabel="Place selected entry"/></div></div>
        <button className="back-btn" onClick={()=>setEditing(true)}>Edit example item</button>
        <ItemModal open={editing} mode="edit" item={item} onSave={async value=>{setItem(previous=>({...previous,label:value.label}));setEditing(false);}} onClose={()=>setEditing(false)} busy={false}/>
      </section>
      <section><h3>Draft cards</h3><DraftCard draft={{title:'Movie night',status:'open',category:'Movies',participantCount:4,rounds:5,hostDisplayName:'@alex'}} onClick={()=>setSelected(v=>!v)}/></section>
      <section className="prediction-pool-form"><h3>Prediction pool controls</h3><div className="category-card"><div className="category-header"><input className="category-name-input" aria-label="Example category" defaultValue="Best picture"/><label className="category-points"><input className="points-input" aria-label="Example points" type="number" defaultValue={5}/><span>pts</span></label></div><button className="nav-btn">Save example</button></div></section>
      <section className="wv-page"><h3>Weekly matchup</h3><div className="wv-card"><button className="wv-panel pickable my-pick"><span className="wv-seed">1</span><span className="wv-name">Wings</span><span className="wv-your-pick">Your pick</span></button><div className="wv-vs">VS</div><button className="wv-panel pickable"><span className="wv-seed">2</span><span className="wv-name">Pizza</span></button><button className="wv-submit">Submit example</button></div></section>
    </div>
  </section>;
}
