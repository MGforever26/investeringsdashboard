(function(){
  const HISTORY_KEY='madplan_meal_history_v1';
  const MAX_WEEKS=30;
  const DAY_MS=86400000;
  let mealHistory=loadHistory();

  function norm(x){
    return String(x||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function loadHistory(){
    try{
      const x=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
      return normalizeHistory(x);
    }catch(e){return [];}
  }

  function normalizeHistory(list){
    if(!Array.isArray(list)) return [];
    return list.map(x=>({
      startedAt:x&&x.startedAt||null,
      endedAt:x&&x.endedAt||null,
      label:x&&x.label||'',
      recipes:Array.isArray(x&&x.recipes)?x.recipes.map(v=>String(v||'').trim()).filter(Boolean):[],
      confidence:Number(x&&x.confidence)||0
    })).filter(x=>x.startedAt&&x.endedAt&&x.recipes.length)
      .sort((a,b)=>new Date(a.endedAt)-new Date(b.endedAt))
      .slice(-MAX_WEEKS);
  }

  function historyKey(x){
    return String(x.startedAt||'');
  }

  function mergeHistory(incoming){
    const map=new Map();
    normalizeHistory([].concat(mealHistory||[],incoming||[])).forEach(x=>map.set(historyKey(x),x));
    mealHistory=[...map.values()].sort((a,b)=>new Date(a.endedAt)-new Date(b.endedAt)).slice(-MAX_WEEKS);
    saveHistory();
  }

  function saveHistory(){
    try{localStorage.setItem(HISTORY_KEY,JSON.stringify(mealHistory));}catch(e){}
  }

  function currentRecipeNames(){
    try{
      return (plan||[]).map(x=>{
        const r=byId(x);
        return r&&r.name?String(r.name).trim():'';
      }).filter(Boolean);
    }catch(e){return [];}
  }

  function hasShoppingUse(){
    try{
      return (shopping||[]).some(i=>(i&&i.on===false)||i&&['manuelt','ekstra'].includes(i.source));
    }catch(e){return false;}
  }

  function dayIsWeekendish(d){
    const n=d.getDay();
    return n===0||n===1||n===6;
  }

  function archiveConfidence(meta,names,endedAt){
    if(!meta||!meta.createdAt||names.length<3) return 0;
    const start=new Date(meta.createdAt),end=new Date(endedAt);
    if(!isFinite(start)||!isFinite(end)) return 0;
    const age=(end-start)/DAY_MS;
    if(age<3.25) return 0;

    let score=age>=5?3:2;
    const distinct=new Set(names.map(norm)).size;
    if(distinct>=4) score+=1;
    else if(distinct>=3) score+=0.5;
    if(dayIsWeekendish(start)) score+=1;
    if(dayIsWeekendish(end)) score+=1;
    if(hasShoppingUse()) score+=0.5;
    return score;
  }

  function archiveCurrentWeek(){
    try{
      const names=currentRecipeNames();
      const endedAt=new Date().toISOString();
      const meta=activeWeek||{};
      const confidence=archiveConfidence(meta,names,endedAt);
      if(confidence<4.5) return false;
      if(mealHistory.some(x=>x.startedAt===meta.createdAt)) return false;
      mealHistory.push({
        startedAt:meta.createdAt,
        endedAt,
        label:meta.label||'',
        recipes:names,
        confidence:Math.round(confidence*10)/10
      });
      mealHistory=normalizeHistory(mealHistory);
      saveHistory();
      return true;
    }catch(e){return false;}
  }

  function ensureWeekMeta(){
    try{
      if(!activeWeek) return;
      const now=new Date().toISOString();
      if(!activeWeek.createdAt) activeWeek.createdAt=now;
      activeWeek.lastSeenAt=now;
      if(typeof store!=='undefined'&&store&&store.set) store.set('madplan_week_meta_v1',activeWeek);
    }catch(e){}
  }

  ensureWeekMeta();

  if(typeof newWeekMeta==='function'){
    const oldNewWeekMeta=newWeekMeta;
    newWeekMeta=function(){
      archiveCurrentWeek();
      const m=oldNewWeekMeta();
      const now=new Date().toISOString();
      m.createdAt=now;
      m.lastSeenAt=now;
      return m;
    };
  }

  if(typeof applyState==='function'){
    const oldApplyState=applyState;
    applyState=function(d){
      const out=oldApplyState(d);
      try{if(d&&Array.isArray(d.h)) mergeHistory(d.h);}catch(e){}
      return out;
    };
  }

  if(typeof stateObj==='function'){
    const oldStateObj=stateObj;
    stateObj=function(){
      ensureWeekMeta();
      const o=oldStateObj();
      try{
        o.h=mealHistory;
        o.w=o.w||{};
        o.w.createdAt=(activeWeek&&activeWeek.createdAt)||null;
        o.w.lastSeenAt=(activeWeek&&activeWeek.lastSeenAt)||null;
        saveHistory();
      }catch(e){}
      return o;
    };
  }

  function historyStats(recipeName){
    const target=norm(recipeName);
    const newest=[...mealHistory].sort((a,b)=>new Date(b.endedAt)-new Date(a.endedAt));
    let usedWeeks=0,lastIndex=-1;
    newest.forEach((w,idx)=>{
      if(new Set((w.recipes||[]).map(norm)).has(target)){
        usedWeeks++;
        if(lastIndex<0) lastIndex=idx;
      }
    });
    return {usedWeeks,lastIndex,total:newest.length};
  }

  function recipeWeight(r){
    if(!mealHistory.length) return 1;
    const s=historyStats(r.name);
    if(!s.usedWeeks) return 0.85;
    const freq=s.usedWeeks/Math.max(1,s.total);
    let recency=1;
    if(s.lastIndex===0) recency=0.18;
    else if(s.lastIndex===1) recency=0.70;
    else if(s.lastIndex===2) recency=1.00;
    else if(s.lastIndex===3) recency=1.20;
    else recency=Math.min(1.55,1.30+(s.lastIndex-4)*0.06);
    return Math.max(0.12,(0.65+1.9*freq)*recency);
  }

  function weightedPick(pool,count){
    const left=[...(pool||[])],picked=[];
    while(left.length&&picked.length<count){
      const weights=left.map(r=>recipeWeight(r));
      const total=weights.reduce((a,b)=>a+b,0);
      let x=Math.random()*(total||left.length),idx=0;
      if(total){
        for(;idx<left.length-1;idx++){
          x-=weights[idx];
          if(x<=0) break;
        }
      }else idx=Math.floor(Math.random()*left.length);
      picked.push(left.splice(idx,1)[0]);
    }
    return picked;
  }

  if(typeof generatePlan==='function'){
    generatePlan=function(){
      const meat=(recipes||[]).filter(r=>r.type==='kød');
      const other=(recipes||[]).filter(r=>r.type!=='kød');
      let pick=weightedPick(meat,Math.min(meatDays,meat.length));
      const chosen=new Set(pick.map(r=>r.id));
      pick=pick.concat(weightedPick(other.filter(r=>!chosen.has(r.id)),Math.max(0,days-pick.length)));
      pick.forEach(r=>chosen.add(r.id));
      if(pick.length<days){
        pick=pick.concat(weightedPick((recipes||[]).filter(r=>!chosen.has(r.id)),days-pick.length));
      }
      plan=shuffle(pick).slice(0,days).map(r=>r.id);
      excluded={};
      buildShopping();
      saveSession();
    };
  }

  function realSuggestionIds(limit=5){
    if(mealHistory.length<2||!Array.isArray(recipes)) return [];
    const inPlan=new Set(Array.isArray(plan)?plan:[]);
    return recipes.map(r=>{
      const s=historyStats(r.name);
      return {r,s,score:recipeWeight(r)};
    }).filter(x=>x.s.usedWeeks>0&&x.s.lastIndex>0&&!inPlan.has(x.r.id))
      .sort((a,b)=>b.score-a.score||b.s.lastIndex-a.s.lastIndex||a.r.name.localeCompare(b.r.name,'da'))
      .slice(0,limit).map(x=>x.r.id);
  }

  function previewSuggestionIds(limit=5){
    const inPlan=new Set(Array.isArray(plan)?plan:[]);
    const preferred=['dahl','rød karry','fiskefrikadeller','Pasta bolognese','bygotto','tacos','butter chicken','pasta carbonara'];
    const ids=[];
    preferred.forEach(name=>{
      const r=(recipes||[]).find(x=>norm(x.name)===norm(name));
      if(r&&!inPlan.has(r.id)&&!ids.includes(r.id))ids.push(r.id);
    });
    (recipes||[]).forEach(r=>{
      if(ids.length<limit&&!inPlan.has(r.id)&&!ids.includes(r.id))ids.push(r.id);
    });
    return ids.slice(0,limit);
  }

  function suggestionState(){
    const real=realSuggestionIds();
    if(real.length)return {ids:real,cold:false};
    return {ids:previewSuggestionIds(),cold:mealHistory.length<2};
  }

  function suggestionIds(limit=5){
    return suggestionState().ids.slice(0,limit);
  }

  function pickerRow(day,r,selected){
    return '<button type="button" data-meal-day="'+day+'" data-meal-id="'+esc(r.id)+'" style="display:block;width:100%;text-align:left;padding:10px 11px;border:0;background:'+(selected?'var(--soft)':'transparent')+';border-radius:10px;font:inherit;color:inherit;cursor:pointer;font-weight:'+(selected?'700':'500')+'">'+esc(cap(r.name))+(selected?' <span class="sub" style="float:right">valgt</span>':'')+'</button>';
  }

  if(typeof dayCard==='function'){
    dayCard=function(i,rid){
      const r=byId(rid);
      const state=suggestionState();
      const suggested=state.ids.map(v=>(recipes||[]).find(x=>x.id===v)).filter(Boolean);
      const suggestedSet=new Set(suggested.map(x=>x.id));
      const rest=(recipes||[]).filter(x=>!suggestedSet.has(x.id));
      const picker='<details data-meal-picker="'+i+'" style="margin:10px 0">'
        +'<summary style="cursor:pointer;border:1px solid var(--line);border-radius:12px;padding:11px 12px;background:#fff;font-weight:600">'+esc(cap(r.name))+'</summary>'
        +'<div data-meal-menu="'+i+'" style="margin-top:6px;border:1px solid var(--line);border-radius:14px;padding:8px;background:#fff;max-height:360px;overflow:auto">'
        +(suggested.length?'<div class="sub" style="font-weight:700;padding:5px 8px 6px">Oplagte denne uge</div>'+suggested.map(x=>pickerRow(i,x,x.id===rid)).join(''):'')
        +'<div class="sub" style="font-weight:700;padding:10px 8px 6px">Alle øvrige retter</div>'
        +rest.map(x=>pickerRow(i,x,x.id===rid)).join('')
        +'</div></details>';
      return '<div class="card day"><div class="bubble">'+(i+1)+'</div><div><div class="row" style="justify-content:space-between"><h3>Dag '+(i+1)+'</h3><span class="pill">'+esc(r.type)+'</span></div>'
        +picker
        +'<details><summary class="sub">Ingredienser ('+r.ingredients.filter(x=>ingOn(i,x)).length+'/'+r.ingredients.length+' valgt)</summary><div style="margin-top:8px">'
        +r.ingredients.map((x,idx)=>'<div class="item" style="grid-template-columns:32px 1fr"><button class="check '+(ingOn(i,x)?'on':'')+'" onclick="toggleIng('+i+','+idx+')">'+(ingOn(i,x)?'✓':'')+'</button><div><b>'+esc(x.name)+'</b><div class="sub" style="margin:2px 0 0">'+esc(x.category)+'</div></div></div>').join('')
        +'</div></details></div></div>';
    };
  }

  function attachMealPickers(){
    try{
      document.querySelectorAll('details[data-meal-picker]').forEach(d=>{
        d.addEventListener('toggle',()=>{
          if(!d.open)return;
          document.querySelectorAll('details[data-meal-picker]').forEach(other=>{if(other!==d)other.open=false;});
          const menu=d.querySelector('[data-meal-menu]');
          if(menu)menu.scrollTop=0;
        });
      });
      document.querySelectorAll('[data-meal-day][data-meal-id]').forEach(b=>{
        b.onclick=()=>{
          const day=Number(b.dataset.mealDay),recipeId=b.dataset.mealId;
          if(!Number.isInteger(day)||!recipeId)return;
          plan[day]=recipeId;
          excluded={};
          buildShopping();
          saveSession();
          renderAll();
        };
      });
    }catch(e){}
  }

  function renderSuggestionStrip(){
    try{
      const host=document.querySelector('#plan .grid.days');
      if(!host||!host.parentNode)return;
      const old=document.getElementById('meal-history-suggestions');
      if(old)old.remove();
      const state=suggestionState();
      if(!state.ids.length)return;
      const names=state.ids.map(v=>{
        const r=(recipes||[]).find(x=>x.id===v);
        return r?r.name:'';
      }).filter(Boolean);
      if(!names.length)return;
      const box=document.createElement('div');
      box.id='meal-history-suggestions';
      box.className='card no-print';
      box.style.padding='13px 16px';
      box.style.marginBottom='14px';
      const note=state.cold
        ?'Forslagene bliver skarpere, efterhånden som vi bygger historik op. De samme retter ligger øverst i retvælgerne nedenfor.'
        :'Baseret på hvad vi plejer at vælge, og hvor længe siden retterne sidst var på planen. De samme forslag ligger øverst i retvælgerne nedenfor.';
      box.innerHTML='<div class="sub" style="font-weight:700;margin-bottom:7px">Oplagte denne uge</div>'
        +'<div class="row" style="gap:7px">'+names.map(n=>'<span class="pill" style="cursor:default;opacity:.88">'+esc(cap(n))+'</span>').join('')+'</div>'
        +'<div class="sub" style="margin-top:6px">'+esc(note)+'</div>';
      host.parentNode.insertBefore(box,host);
    }catch(e){}
  }

  if(typeof renderPlan==='function'){
    const oldRenderPlan=renderPlan;
    renderPlan=function(){
      const out=oldRenderPlan();
      renderSuggestionStrip();
      attachMealPickers();
      return out;
    };
  }

  window.madplanMealHistory={
    count:()=>mealHistory.length,
    suggestions:()=>suggestionIds().map(x=>{const r=(recipes||[]).find(y=>y.id===x);return r?r.name:x;})
  };
})();