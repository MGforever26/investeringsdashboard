/* Group duplicate recipe ingredients and allow per-day quantity adjustments. */
(function(){
  'use strict';
  const LIMIT=50;
  let values={};
  let editing=null;

  function cleanOverrides(input){
    const out={};
    if(input&&typeof input==='object'&&!Array.isArray(input)){
      Object.keys(input).forEach(k=>{
        const n=Number(input[k]);
        if(Number.isInteger(n)&&n>=1&&n<=LIMIT)out[k]=n;
      });
    }
    return out;
  }
  function bootstrap(){
    // The base app restores local/session state before extension scripts load.
    for(const storage of [sessionStorage,localStorage]){
      try{
        const key=storage===sessionStorage?'madplan_state_v1':'madplan_state_local_v1';
        const data=JSON.parse(storage.getItem(key)||'null');
        const localWeek=data&&data.w&&data.w.createdAt;
        if(data&&data.iq&&(!localWeek||!activeWeek||!activeWeek.createdAt||localWeek===activeWeek.createdAt)){
          values=cleanOverrides(data.iq);return;
        }
      }catch(e){}
    }
  }
  function groups(day,r){
    const map=new Map();
    (r&&r.ingredients||[]).forEach((item,index)=>{
      const id=ingredientKey(day,item);
      if(!map.has(id))map.set(id,{item,index,count:0,key:id});
      map.get(id).count++;
    });
    return [...map.values()];
  }
  function recordKey(day,r,g){
    return String(day)+'|'+String(r.id)+'|'+g.key;
  }
  function amount(day,r,g){
    const k=recordKey(day,r,g);
    return Object.prototype.hasOwnProperty.call(values,k)?values[k]:g.count;
  }
  function norm(name){
    return cleanName(name).toLocaleLowerCase('da-DK').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }
  function contributions(day,r){
    return groups(day,r).filter(g=>ingOn(day,g.item)).map(g=>({
      name:g.item.name,category:g.item.category,qty:amount(day,r,g),
      adjusted:Object.prototype.hasOwnProperty.call(values,recordKey(day,r,g))
    }));
  }
  function alignEditedShopping(){
    try{
      const totals=new Map(),edited=new Set();
      (plan||[]).forEach((rid,day)=>{
        const r=byId(rid);
        contributions(day,r).forEach(g=>{
          const k=norm(g.name);
          totals.set(k,(totals.get(k)||0)+g.qty);
          if(g.adjusted)edited.add(k);
        });
      });
      if(!edited.size)return;
      (shopping||[]).forEach(it=>{
        if(it.source!=='ret')return;
        const key=norm(it.name);
        if(edited.has(key)&&totals.has(key))it.qty=totals.get(key);
      });
    }catch(e){}
  }

  function change(day,index,delta){
    const r=byId(plan[day]);
    if(!r)return;
    const g=groups(day,r).find(g=>g.index===index);
    if(!g)return;
    const next=Math.max(1,Math.min(LIMIT,amount(day,r,g)+delta));
    const key=recordKey(day,r,g);
    if(next===amount(day,r,g))return;
    if(next===g.count)delete values[key];
    else values[key]=next;
    editing=key;
    buildShopping();
    alignEditedShopping();
    saveSession();
    renderAll();
  }
  function edit(day,index){
    const r=byId(plan[day]);
    const g=groups(day,r).find(g=>g.index===index);
    if(!g)return;
    const key=recordKey(day,r,g);
    editing=editing===key?null:key;
    renderPlan();
  }

  function renderDay(day,r){
    const list=groups(day,r);
    const selected=list.filter(g=>ingOn(day,g.item)).length;
    return '<details data-ingredient-details="'+day+'"><summary class="sub">Ingredienser ('+selected+'/'+list.length+' valgt)</summary>'
      +'<div style="margin-top:8px">'
      +list.map(g=>{
        const on=ingOn(day,g.item);
        const key=recordKey(day,r,g);
        const current=amount(day,r,g);
        const controls=editing===key
          ?'<div style="display:flex;align-items:center;gap:7px;white-space:nowrap">'
            +'<button type="button" class="pill" style="cursor:pointer;padding:7px 10px;border:1px solid var(--line);font:inherit" onclick="changeIngredientAmount('+day+','+g.index+',-1)" aria-label="Færre '+esc(g.item.name)+'" '+(current<=1?'disabled':'')+'>−</button>'
            +'<span style="min-width:17px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums">'+current+'</span>'
            +'<button type="button" class="pill" style="cursor:pointer;padding:7px 10px;border:1px solid var(--line);font:inherit" onclick="changeIngredientAmount('+day+','+g.index+',1)" aria-label="Flere '+esc(g.item.name)+'" '+(current>=LIMIT?'disabled':'')+'>+</button>'
            +'</div>'
          :'<button type="button" class="pill" style="cursor:pointer;border:1px solid var(--line);font:inherit;min-width:32px;justify-content:center" onclick="editIngredientAmount('+day+','+g.index+')" aria-label="Justér antal '+esc(g.item.name)+'">'+current+'</button>';
        return '<div class="item" style="grid-template-columns:32px minmax(0,1fr) auto">'
          +'<button type="button" class="check '+(on?'on':'')+'" onclick="toggleIng('+day+','+g.index+')" aria-label="'+(on?'Fravælg ':'Vælg ')+esc(g.item.name)+'">'+(on?'✓':'')+'</button>'
          +'<div><b>'+esc(g.item.name)+'</b><div class="sub" style="margin:2px 0 0">'+esc(g.item.category)+'</div></div>'
          +controls+'</div>';
      }).join('')
      +'</div></details>';
  }

  window.changeIngredientAmount=change;
  window.editIngredientAmount=edit;
  window.madplanIngredientQuantities={renderDay,contributions,
    overrides:()=>Object.assign({},values)};

  if(typeof stateObj==='function'){
    const previous=stateObj;
    stateObj=function(){const state=previous();state.iq=Object.assign({},values);return state;};
  }
  if(typeof applyState==='function'){
    const previous=applyState;
    applyState=function(state){
      const out=previous(state);
      values=cleanOverrides(state&&state.iq);
      editing=null;
      return out;
    };
  }
  if(typeof newWeekMeta==='function'){
    const previous=newWeekMeta;
    newWeekMeta=function(){
      const meta=previous.apply(this,arguments);
      values={};
      editing=null;
      return meta;
    };
  }
  if(typeof buildShopping==='function'){
    const previous=buildShopping;
    buildShopping=function(opts){
      const out=previous.apply(this,arguments);
      alignEditedShopping();
      return out;
    };
  }
  // quantity-fix runs just before renderAll and may recheck generated counts.
  // Keep the final rendering consistent with the per-day quantity choices.
  if(typeof renderAll==='function'){
    const previous=renderAll;
    renderAll=function(){
      const out=previous.apply(this,arguments);
      if(Object.keys(values).length){
        const before=(shopping||[]).map(i=>i.source==='ret'?[i.id,i.qty]:null).filter(Boolean);
        alignEditedShopping();
        const changed=before.some(([id,qty])=>shopping.some(i=>i.id===id&&i.qty!==qty));
        if(changed){
          renderList();
          renderPrint();
        }
      }
      return out;
    };
  }

  bootstrap();
  try{renderPlan();}catch(e){}
})();
