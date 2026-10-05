(function(){
  const KEY='madplan_learning_v1';
  const MAX_EVENTS=900;
  const DISMISS_DAYS=28;
  let learning=loadLocal();
  let applying=false;
  let patternIndex=0;

  function norm(x){
    return String(x||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function nowIso(){return new Date().toISOString();}

  function weekKey(){
    try{
      return String((activeWeek&&activeWeek.createdAt)||'')||String((activeWeek&&activeWeek.label)||'')||'aktiv';
    }catch(e){return 'aktiv';}
  }

  function blank(){
    return {events:[],rules:[],dismissed:{}};
  }

  function cleanEvent(e){
    if(!e||!e.id||!e.type)return null;
    return {
      id:String(e.id),
      ts:e.ts||nowIso(),
      week:String(e.week||'aktiv'),
      type:String(e.type),
      recipe:e.recipe||null,
      recipeId:e.recipeId||null,
      item:e.item||null,
      category:e.category||null,
      source:e.source||null,
      before:e.before==null?null:e.before,
      after:e.after==null?null:e.after,
      meta:e.meta&&typeof e.meta==='object'?e.meta:null
    };
  }

  function normalizeLearning(x){
    const base=blank();
    if(!x||typeof x!=='object')return base;
    const byId=new Map();
    (Array.isArray(x.events)?x.events:[]).forEach(e=>{
      const c=cleanEvent(e);
      if(c)byId.set(c.id,c);
    });
    base.events=[...byId.values()].sort((a,b)=>String(a.ts).localeCompare(String(b.ts))).slice(-MAX_EVENTS);
    const rules=new Map();
    (Array.isArray(x.rules)?x.rules:[]).forEach(r=>{if(r&&r.key)rules.set(String(r.key),r);});
    base.rules=[...rules.values()];
    base.dismissed=x.dismissed&&typeof x.dismissed==='object'?x.dismissed:{};
    return base;
  }

  function loadLocal(){
    try{return normalizeLearning(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(e){return blank();}
  }

  function saveLocal(){
    try{localStorage.setItem(KEY,JSON.stringify(learning));}catch(e){}
  }

  function mergeLearning(incoming){
    if(!incoming)return;
    const other=normalizeLearning(incoming);
    const events=new Map();
    [...learning.events,...other.events].forEach(e=>events.set(e.id,e));
    const rules=new Map();
    [...learning.rules,...other.rules].forEach(r=>{if(r&&r.key)rules.set(String(r.key),r);});
    learning.events=[...events.values()].sort((a,b)=>String(a.ts).localeCompare(String(b.ts))).slice(-MAX_EVENTS);
    learning.rules=[...rules.values()];
    learning.dismissed=Object.assign({},other.dismissed||{},learning.dismissed||{});
    saveLocal();
    applyRulesNow();
  }

  try{
    if(window.madplanLastRemotePayload&&window.madplanLastRemotePayload.learning){
      mergeLearning(window.madplanLastRemotePayload.learning);
    }
  }catch(e){}

  if(typeof applyState==='function'){
    const oldApplyState=applyState;
    applyState=function(d){
      const out=oldApplyState(d);
      try{if(d&&d.learning)mergeLearning(d.learning);}catch(e){}
      return out;
    };
  }

  if(typeof stateObj==='function'){
    const oldStateObj=stateObj;
    stateObj=function(){
      const o=oldStateObj();
      try{o.learning=normalizeLearning(learning);}catch(e){}
      return o;
    };
  }

  function eventId(){
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  }

  function record(type,data={}){
    if(applying)return;
    const e=cleanEvent(Object.assign({
      id:eventId(),
      ts:nowIso(),
      week:weekKey(),
      type
    },data));
    if(!e)return;
    learning.events.push(e);
    learning.events=learning.events.slice(-MAX_EVENTS);
    saveLocal();
  }

  function currentPlanNames(){
    try{
      return [...new Set((plan||[]).map(rid=>{const r=byId(rid);return r&&r.name?String(r.name).trim():'';}).filter(Boolean))];
    }catch(e){return [];}
  }

  function historyEntries(){
    try{
      if(window.madplanMealHistory&&typeof window.madplanMealHistory.entries==='function'){
        return window.madplanMealHistory.entries()||[];
      }
    }catch(e){}
    return [];
  }

  function median(values){
    const a=(values||[]).filter(Number.isFinite).sort((x,y)=>x-y);
    if(!a.length)return null;
    const m=Math.floor(a.length/2);
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }

  function recipeContextForItem(item){
    try{
      const target=norm(item),seen=new Map();
      (plan||[]).forEach(rid=>{
        const r=byId(rid);
        if(!r||seen.has(r.id))return;
        if((r.ingredients||[]).some(i=>norm(i.name)===target))seen.set(r.id,r);
      });
      const arr=[...seen.values()];
      return arr.length===1?arr[0]:null;
    }catch(e){return null;}
  }

  function optionalContains(cat,name){
    try{return Array.isArray(OPTIONAL[cat])&&OPTIONAL[cat].some(x=>norm(x)===norm(name));}catch(e){return false;}
  }

  function ruleByKey(key){
    return learning.rules.find(r=>r&&r.key===key);
  }

  function applyOptionalRules(){
    try{
      learning.rules.filter(r=>r.type==='optional_item').forEach(r=>{
        const cat=r.category||'andet';
        if(!Array.isArray(OPTIONAL[cat]))return;
        if(!OPTIONAL[cat].some(x=>norm(x)===norm(r.item)))OPTIONAL[cat].push(r.item);
      });
    }catch(e){}
  }

  function ingredientCount(r,item){
    const target=norm(item);
    return (r&&r.ingredients||[]).filter(i=>norm(i.name)===target).length;
  }

  function applyQuantityRules(){
    try{
      learning.rules.filter(r=>r.type==='recipe_qty').forEach(rule=>{
        const selected=(plan||[]).filter(rid=>{
          const r=byId(rid);
          return r&&norm(r.name)===norm(rule.recipe);
        });
        if(!selected.length)return;
        const sample=byId(selected[0]);
        const base=ingredientCount(sample,rule.item);
        if(!base)return;
        const desired=Math.max(1,Number(rule.qty)||1);
        const delta=(desired-base)*selected.length;
        if(!delta)return;
        const it=(shopping||[]).find(x=>x.source==='ret'&&norm(x.name)===norm(rule.item));
        if(it)it.qty=Math.max(1,(Number(it.qty)||1)+delta);
      });
    }catch(e){}
  }

  function applyStandardRules(){
    try{
      const removed=learning.rules.filter(r=>r.type==='standard_remove');
      if(removed.length){
        shopping=shopping.filter(i=>!(
          i.source==='standard' &&
          removed.some(r=>norm(r.item)===norm(i.name))
        ));
      }

      learning.rules.filter(r=>r.type==='standard_add').forEach(rule=>{
        const cat=rule.category||'andet',name=cleanName(rule.item);
        if(!name)return;
        const exists=shopping.some(i=>i.source==='standard'&&norm(i.name)===norm(name));
        if(!exists)shopping.push({
          id:id(),name,category:cat,qty:Math.max(1,Number(rule.qty)||1),on:true,source:'standard'
        });
      });

      shopping.sort((a,b)=>CATS.indexOf(a.category)-CATS.indexOf(b.category)||String(a.source||'').localeCompare(String(b.source||''),'da')||a.name.localeCompare(b.name,'da'));
    }catch(e){}
  }

  function applyRecipeItemRules(){
    try{
      learning.rules.filter(r=>r.type==='recipe_item_add').forEach(rule=>{
        const selected=(plan||[]).filter(rid=>{
          const r=byId(rid);
          return r&&norm(r.name)===norm(rule.recipe);
        });
        if(!selected.length)return;
        const recipe=byId(selected[0]);
        if((recipe.ingredients||[]).some(i=>norm(i.name)===norm(rule.item)))return;
        const existing=(shopping||[]).find(i=>i.source==='ret'&&norm(i.name)===norm(rule.item)&&norm(i.category||'')===norm(rule.category||''));
        const addQty=Math.max(1,Number(rule.qty)||1)*selected.length;
        if(existing)existing.qty=(Number(existing.qty)||1)+addQty;
        else shopping.push({
          id:id(),name:cleanName(rule.item),category:rule.category||'andet',
          qty:addQty,on:true,source:'ret'
        });
      });
      shopping.sort((a,b)=>CATS.indexOf(a.category)-CATS.indexOf(b.category)||String(a.source||'').localeCompare(String(b.source||''),'da')||a.name.localeCompare(b.name,'da'));
    }catch(e){}
  }

  function ingredientRuleFor(day,item){
    try{
      const r=byId(plan[day]);
      if(!r)return null;
      return learning.rules.find(rule=>
        rule.type==='ingredient_off' &&
        norm(rule.recipe)===norm(r.name) &&
        norm(rule.item)===norm(item&&item.name)
      )||null;
    }catch(e){return null;}
  }

  if(typeof ingOn==='function'){
    const oldIngOn=ingOn;
    ingOn=function(day,item){
      try{
        const k=ingredientKey(day,item);
        if(Object.prototype.hasOwnProperty.call(excluded,k))return !excluded[k];
        if(ingredientRuleFor(day,item))return false;
      }catch(e){}
      return oldIngOn(day,item);
    };
  }

  if(typeof toggleIng==='function'){
    const oldToggleIng=toggleIng;
    toggleIng=function(day,idx){
      try{
        const r=byId(plan[day]),item=(r&&r.ingredients||[])[idx];
        if(item&&ingredientRuleFor(day,item)){
          const before=ingOn(day,item);
          const k=ingredientKey(day,item);
          if(before) delete excluded[k];
          else excluded[k]=false;
          record('ingredient_toggle',{
            recipe:r.name,recipeId:r.id,item:item.name,category:item.category,
            before:!!before,after:!before
          });
          buildShopping();saveSession();renderAll();
          return;
        }
      }catch(e){}
      return oldToggleIng(day,idx);
    };
  }

  function applyRulesNow(){
    if(applying)return;
    applying=true;
    try{applyOptionalRules();applyQuantityRules();applyStandardRules();applyRecipeItemRules();}catch(e){}
    applying=false;
  }

  applyOptionalRules();

  if(typeof buildShopping==='function'){
    const oldBuildShopping=buildShopping;
    buildShopping=function(opts={}){
      const out=oldBuildShopping(opts);
      applyQuantityRules();
      applyStandardRules();
      applyRecipeItemRules();
      return out;
    };
  }

  if(typeof addItem==='function'){
    const oldAddItem=addItem;
    addItem=function(cat,name){
      const n=cleanName(name),wasOptional=optionalContains(cat,n);
      record(wasOptional?'optional_add':'manual_add',{
        item:n,category:cat||'andet',source:'manuelt',
        meta:{plan:currentPlanNames()}
      });
      return oldAddItem(cat,name);
    };
  }

  if(typeof toggleIng==='function'){
    const oldToggleIng=toggleIng;
    toggleIng=function(day,idx){
      try{
        const r=byId(plan[day]),i=(r&&r.ingredients||[])[idx];
        if(i){
          const before=ingOn(day,i);
          record('ingredient_toggle',{
            recipe:r.name,recipeId:r.id,item:i.name,category:i.category,
            before:!!before,after:!before
          });
        }
      }catch(e){}
      return oldToggleIng(day,idx);
    };
  }

  if(typeof generatePlan==='function'){
    const oldGeneratePlan=generatePlan;
    generatePlan=function(){
      const before=(plan||[]).slice();
      const out=oldGeneratePlan.apply(this,arguments);
      try{
        record('plan_generate',{
          before:before.map(rid=>{const r=byId(rid);return r?r.name:rid;}),
          after:(plan||[]).map(rid=>{const r=byId(rid);return r?r.name:rid;}),
          meta:{days:Number(days)||0,meatDays:Number(meatDays)||0}
        });
        saveSession();
      }catch(e){}
      return out;
    };
  }

  if(typeof startNewWeek==='function'){
    const oldStartNewWeek=startNewWeek;
    startNewWeek=function(){
      const beforeCreated=activeWeek&&activeWeek.createdAt;
      const out=oldStartNewWeek.apply(this,arguments);
      try{
        const afterCreated=activeWeek&&activeWeek.createdAt;
        if(afterCreated&&afterCreated!==beforeCreated){
          record('new_week',{meta:{previousCreatedAt:beforeCreated||null}});
          saveSession();
        }
      }catch(e){}
      return out;
    };
  }

  function attachListObservers(){
    try{
      document.querySelectorAll('[data-plus],[data-minus]').forEach(b=>{
        if(b.dataset.learningBound)return;
        b.dataset.learningBound='1';
        b.addEventListener('click',()=>{
          const iid=b.dataset.plus||b.dataset.minus;
          const it=(shopping||[]).find(x=>x.id===iid);
          if(!it)return;
          const before=Number(it.qty)||1;
          const after=b.dataset.plus?before+1:Math.max(0,before-1);
          const r=it.source==='ret'?recipeContextForItem(it.name):null;
          record('shopping_qty',{
            recipe:r?r.name:null,recipeId:r?r.id:null,item:it.name,category:it.category,
            source:it.source||null,before,after
          });
        },true);
      });
      document.querySelectorAll('[data-toggle]').forEach(b=>{
        if(b.dataset.learningBound)return;
        b.dataset.learningBound='1';
        b.addEventListener('click',()=>{
          const it=(shopping||[]).find(x=>x.id===b.dataset.toggle);
          if(!it)return;
          const r=it.source==='ret'?recipeContextForItem(it.name):null;
          record('shopping_toggle',{
            recipe:r?r.name:null,recipeId:r?r.id:null,item:it.name,category:it.category,
            source:it.source||null,before:it.on!==false,after:it.on===false
          });
        },true);
      });
    }catch(e){}
  }

  function attachPlanObservers(){
    try{
      const d=document.getElementById('days');
      if(d&&!d.dataset.learningBound){
        d.dataset.learningBound='1';
        d.addEventListener('change',()=>record('days_change',{before:Number(days),after:Number(d.value)}),true);
      }
      const m=document.getElementById('meat');
      if(m&&!m.dataset.learningBound){
        m.dataset.learningBound='1';
        m.addEventListener('change',()=>record('meat_days_change',{before:Number(meatDays),after:Number(m.value)}),true);
      }
      document.querySelectorAll('[data-meal-day][data-meal-id]').forEach(b=>{
        if(b.dataset.learningBound)return;
        b.dataset.learningBound='1';
        b.addEventListener('click',()=>{
          const day=Number(b.dataset.mealDay),beforeId=(plan||[])[day],afterId=b.dataset.mealId;
          if(beforeId===afterId)return;
          const br=byId(beforeId),ar=byId(afterId);
          record('meal_change',{
            recipe:ar&&ar.name,recipeId:afterId,
            before:br&&br.name||beforeId,after:ar&&ar.name||afterId,
            meta:{day}
          });
        },true);
      });
    }catch(e){}
  }

  function distinctWeeks(events){
    return new Set(events.map(e=>e.week)).size;
  }

  function finalPerWeek(events){
    const map=new Map();
    [...events].sort((a,b)=>String(a.ts).localeCompare(String(b.ts))).forEach(e=>map.set(e.week,e));
    return [...map.values()];
  }

  function quantityPatterns(){
    const groups=new Map();
    learning.events.filter(e=>e.type==='shopping_qty'&&e.source==='ret'&&e.recipe&&Number(e.after)>0).forEach(e=>{
      const k=norm(e.recipe)+'|'+norm(e.item);
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(e);
    });
    const out=[];
    groups.forEach(events=>{
      const final=finalPerWeek(events);
      const byTarget=new Map();
      final.forEach(e=>{
        const target=Number(e.after);
        if(!byTarget.has(target))byTarget.set(target,[]);
        byTarget.get(target).push(e);
      });
      byTarget.forEach((matches,target)=>{
        if(distinctWeeks(matches)<3)return;
        const evidence=distinctWeeks(matches);
        const sample=matches[matches.length-1];
        const key='qty|'+norm(sample.recipe)+'|'+norm(sample.item);
        if(ruleByKey(key))return;
        out.push({
          key,type:'recipe_qty',evidence,
          recipe:sample.recipe,item:sample.item,qty:target,
          title:'Madplan har opdaget et mønster',
          text:'Vi har ændret '+sample.item+' til '+target+' i '+evidence+' forskellige uger, når '+sample.recipe+' har været på planen.',
          question:'Gør '+target+' til standard for '+sample.recipe+'?'
        });
      });
    });
    return out;
  }

  function manualItemPatterns(){
    const groups=new Map();
    learning.events.filter(e=>e.type==='manual_add'&&e.item).forEach(e=>{
      const k=norm(e.category)+'|'+norm(e.item);
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(e);
    });
    const out=[];
    groups.forEach(events=>{
      const evidence=distinctWeeks(events);
      if(evidence<4)return;
      const sample=events[events.length-1];
      const key='optional|'+norm(sample.category)+'|'+norm(sample.item);
      if(ruleByKey(key)||optionalContains(sample.category,sample.item))return;
      out.push({
        key,type:'optional_item',evidence,
        item:sample.item,category:sample.category,
        title:'Madplan har opdaget et mønster',
        text:'Vi har tilføjet '+sample.item+' manuelt i '+evidence+' forskellige uger.',
        question:'Gør '+sample.item+' til fast tilvalg?'
      });
    });
    return out;
  }

  function ingredientOffPatterns(){
    const groups=new Map();
    learning.events.filter(e=>e.type==='ingredient_toggle'&&e.recipe&&e.item).forEach(e=>{
      const k=norm(e.recipe)+'|'+norm(e.item);
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(e);
    });
    const out=[];
    groups.forEach(events=>{
      const final=finalPerWeek(events).filter(e=>e.after===false);
      const evidence=distinctWeeks(final);
      if(evidence<3)return;
      const sample=final[final.length-1];
      const key='ingredient-off|'+norm(sample.recipe)+'|'+norm(sample.item);
      if(ruleByKey(key))return;
      out.push({
        key,type:'ingredient_off',evidence,
        recipe:sample.recipe,item:sample.item,category:sample.category,
        title:'Madplan har opdaget et mønster',
        text:'Vi har fravalgt '+sample.item+' i '+evidence+' forskellige uger, når '+sample.recipe+' har været på planen.',
        question:'Fravælg '+sample.item+' som standard i '+sample.recipe+'?'
      });
    });
    return out;
  }

  function standardOffPatterns(){
    const groups=new Map();
    learning.events.filter(e=>e.type==='shopping_toggle'&&e.source==='standard'&&e.item).forEach(e=>{
      const k=norm(e.item);
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(e);
    });
    const out=[];
    groups.forEach(events=>{
      const final=finalPerWeek(events).filter(e=>e.after===false);
      const evidence=distinctWeeks(final);
      if(evidence<4)return;
      const sample=final[final.length-1];
      const key='standard-remove|'+norm(sample.item);
      if(ruleByKey(key))return;
      out.push({
        key,type:'standard_remove',evidence,
        item:sample.item,category:sample.category,
        title:'Madplan har opdaget et mønster',
        text:'Vi har slået '+sample.item+' fra som standardvare i '+evidence+' forskellige uger.',
        question:'Fjern '+sample.item+' fra standardvarerne fremover?'
      });
    });
    return out;
  }

  function optionalToStandardPatterns(){
    const groups=new Map();
    learning.events.filter(e=>e.type==='optional_add'&&e.item).forEach(e=>{
      const k=norm(e.category)+'|'+norm(e.item);
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(e);
    });
    const out=[];
    groups.forEach(events=>{
      const evidence=distinctWeeks(events);
      if(evidence<5)return;
      const sample=events[events.length-1];
      const key='standard-add|'+norm(sample.category)+'|'+norm(sample.item);
      if(ruleByKey(key))return;
      out.push({
        key,type:'standard_add',evidence,
        item:sample.item,category:sample.category,qty:1,
        title:'Madplan har opdaget et mønster',
        text:'Vi har valgt '+sample.item+' som tilvalg i '+evidence+' forskellige uger.',
        question:'Gør '+sample.item+' til standardvare fremover?'
      });
    });
    return out;
  }

  function recipeItemPatterns(){
    const events=learning.events.filter(e=>(e.type==='manual_add'||e.type==='optional_add')&&e.item&&e.meta&&Array.isArray(e.meta.plan)&&e.meta.plan.length);
    const grouped=new Map();
    events.forEach(e=>{
      const k=norm(e.category)+'|'+norm(e.item);
      if(!grouped.has(k))grouped.set(k,[]);
      grouped.get(k).push(e);
    });
    const history=historyEntries();
    const out=[];

    grouped.forEach(eventsForItem=>{
      const perWeek=finalPerWeek(eventsForItem);
      if(distinctWeeks(perWeek)<3)return;
      const candidates=new Map();

      perWeek.forEach(e=>{
        [...new Set((e.meta.plan||[]).map(String))].forEach(recipe=>{
          const k=norm(recipe);
          if(!candidates.has(k))candidates.set(k,{recipe,weeks:new Set()});
          candidates.get(k).weeks.add(e.week);
        });
      });

      const scored=[];
      candidates.forEach(c=>{
        const matches=c.weeks.size;
        if(matches<3)return;
        const additionWeeks=distinctWeeks(perWeek);
        const precision=matches/Math.max(1,additionWeeks);
        const histOpp=history.filter(w=>new Set((w.recipes||[]).map(norm)).has(norm(c.recipe))).length;
        const currentOpp=currentPlanNames().some(x=>norm(x)===norm(c.recipe))?1:0;
        const opportunities=histOpp+currentOpp;
        const hitRate=opportunities?matches/opportunities:0;
        if(precision<0.75||opportunities<3||hitRate<0.60)return;

        const recipe=(recipes||[]).find(r=>norm(r.name)===norm(c.recipe));
        const sample=perWeek[perWeek.length-1];
        if(recipe&&(recipe.ingredients||[]).some(i=>norm(i.name)===norm(sample.item)))return;

        scored.push({
          recipe:c.recipe,matches,precision,hitRate,
          score:matches*precision*hitRate,
          sample
        });
      });

      scored.sort((a,b)=>b.score-a.score);
      if(!scored.length)return;
      if(scored.length>1&&scored[1].score>scored[0].score*0.82)return;

      const best=scored[0],sample=best.sample;
      const key='recipe-add|'+norm(best.recipe)+'|'+norm(sample.item);
      if(ruleByKey(key))return;
      out.push({
        key,type:'recipe_item_add',evidence:best.matches,
        recipe:best.recipe,item:sample.item,category:sample.category,qty:1,
        title:'Madplan har opdaget et mønster',
        text:'Vi tilføjer '+sample.item+' næsten hver gang '+best.recipe+' er på planen.',
        question:'Føj '+sample.item+' til '+best.recipe+' fremover?'
      });
    });
    return out;
  }

  function cyclePatterns(){
    const WEEK_MS=7*86400000;
    const groups=new Map();
    learning.events.filter(e=>(e.type==='manual_add'||e.type==='optional_add')&&e.item).forEach(e=>{
      const k=norm(e.category)+'|'+norm(e.item);
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(e);
    });
    const out=[];
    groups.forEach(events=>{
      const perWeek=finalPerWeek(events).sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));
      if(perWeek.length<4)return;
      const times=perWeek.map(e=>Date.parse(e.week)||Date.parse(e.ts)).filter(Number.isFinite).sort((a,b)=>a-b);
      if(times.length<4)return;
      const gaps=[];
      for(let i=1;i<times.length;i++)gaps.push((times[i]-times[i-1])/WEEK_MS);
      const typical=median(gaps);
      if(!typical||typical<1.5||typical>8.5)return;
      const deviations=gaps.map(x=>Math.abs(x-typical));
      const mad=median(deviations)||0;
      if(mad>Math.max(0.8,typical*0.32))return;

      const last=times[times.length-1],since=(Date.now()-last)/WEEK_MS;
      if(since<typical*0.85)return;
      const sample=perWeek[perWeek.length-1];
      if(perWeek.some(e=>e.week===weekKey()))return;

      const rounded=Math.max(2,Math.round(typical));
      const key='cycle-due|'+norm(sample.category)+'|'+norm(sample.item)+'|'+weekKey();
      out.push({
        key,type:'cycle_due',evidence:perWeek.length,
        item:sample.item,category:sample.category,qty:1,
        title:'Madplan har opdaget en rytme',
        text:'Vi plejer at tilføje '+sample.item+' cirka hver '+rounded+'. uge, og det er omtrent nu.',
        question:'Tilføj '+sample.item+' denne uge?',
        yesLabel:'Tilføj denne uge',
        noLabel:'Ikke nu'
      });
    });
    return out;
  }

  function describeRecipeChange(p){
    if(p.type==='recipe_qty')return p.item+' → '+p.qty;
    if(p.type==='ingredient_off')return 'fravælg '+p.item;
    if(p.type==='recipe_item_add')return 'tilføj '+p.item;
    return p.item||p.type;
  }

  function bundleRecipePatterns(patterns){
    const groups=new Map();
    patterns.filter(p=>p.recipe&&['recipe_qty','ingredient_off','recipe_item_add'].includes(p.type)).forEach(p=>{
      const k=norm(p.recipe);
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(p);
    });
    const hidden=new Set(),bundles=[];
    groups.forEach(items=>{
      if(items.length<2)return;
      items.forEach(p=>hidden.add(p.key));
      const recipe=items[0].recipe;
      const evidence=Math.min(...items.map(p=>Number(p.evidence)||0));
      bundles.push({
        key:'bundle|'+norm(recipe)+'|'+items.map(p=>p.key).sort().join('~'),
        type:'recipe_bundle',recipe,evidence,
        components:items,
        title:'Madplan har opdaget et samlet mønster',
        text:'Når '+recipe+' er på planen, laver vi flere af de samme rettelser igen og igen: '+items.map(describeRecipeChange).join(', ')+'.',
        question:'Husk disse ændringer samlet?',
        yesLabel:'Ja, husk dem',
        noLabel:'Ikke nu'
      });
    });
    return [...patterns.filter(p=>!hidden.has(p.key)),...bundles];
  }

  function preferenceMultiplier(recipeName){
    const target=norm(recipeName);
    const inWeeks=new Set(),outWeeks=new Set();
    learning.events.filter(e=>e.type==='meal_change').forEach(e=>{
      if(norm(e.after)===target)inWeeks.add(e.week);
      if(norm(e.before)===target)outWeeks.add(e.week);
    });
    const signals=inWeeks.size+outWeeks.size;
    if(signals<2)return 1;
    const up=Math.min(0.24,inWeeks.size*0.06);
    const down=Math.min(0.22,outWeeks.size*0.055);
    return Math.max(0.74,Math.min(1.28,1+up-down));
  }

  function allPatterns(){
    const raw=[
      ...quantityPatterns(),
      ...manualItemPatterns(),
      ...ingredientOffPatterns(),
      ...standardOffPatterns(),
      ...optionalToStandardPatterns(),
      ...recipeItemPatterns(),
      ...cyclePatterns()
    ];
    return bundleRecipePatterns(raw)
      .filter(p=>{
        const d=learning.dismissed[p.key];
        if(!d)return true;
        const age=Date.now()-(Date.parse(d.ts)||0);
        return p.evidence>Number(d.evidence||0)||age>DISMISS_DAYS*86400000;
      })
      .sort((a,b)=>b.evidence-a.evidence);
  }

  function ruleFromPattern(p){
    return {
      key:p.key,type:p.type,createdAt:nowIso(),evidence:p.evidence,
      recipe:p.recipe||null,item:p.item||null,category:p.category||null,qty:p.qty||null
    };
  }

  function acceptPattern(key){
    const p=allPatterns().find(x=>x.key===key);
    if(!p)return;

    if(p.type==='cycle_due'){
      delete learning.dismissed[key];
      record('cycle_accept',{item:p.item||null,meta:{evidence:p.evidence}});
      saveLocal();
      try{addItem(p.category||'andet',p.item);renderAll();}catch(e){}
      return;
    }

    const patterns=p.type==='recipe_bundle'?(p.components||[]):[p];
    patterns.forEach(component=>{
      const rule=ruleFromPattern(component);
      learning.rules=learning.rules.filter(r=>r.key!==rule.key);
      learning.rules.push(rule);
    });
    delete learning.dismissed[key];
    record('rule_accept',{
      item:p.item||null,recipe:p.recipe||null,
      meta:{ruleType:p.type,evidence:p.evidence,components:patterns.map(x=>x.type)}
    });
    saveLocal();
    applyRulesNow();
    try{buildShopping();saveSession();renderAll();}catch(e){}
  }

  function dismissPattern(key){
    const p=allPatterns().find(x=>x.key===key);
    if(!p)return;
    learning.dismissed[key]={ts:nowIso(),evidence:p.evidence};
    record('pattern_dismiss',{item:p.item||null,recipe:p.recipe||null,meta:{patternType:p.type,evidence:p.evidence}});
    saveLocal();
    try{saveSession();renderAll();}catch(e){}
  }

  function renderLearningCard(){
    try{
      const host=document.querySelector('#plan .grid.days');
      if(!host||!host.parentNode)return;
      const old=document.getElementById('madplan-learning-card');
      if(old)old.remove();

      const patterns=allPatterns();
      if(!patterns.length){
        patternIndex=0;
        return;
      }

      patternIndex=((patternIndex%patterns.length)+patterns.length)%patterns.length;
      const p=patterns[patternIndex];
      const box=document.createElement('div');
      box.id='madplan-learning-card';
      box.className='card no-print';
      box.style.padding='13px 16px';
      box.style.marginBottom='14px';

      const nav=patterns.length>1
        ?'<div class="row" style="margin-top:10px;justify-content:space-between;align-items:center">'
          +'<button class="btn small ghost" data-learn-prev="1">← Forrige</button>'
          +'<span class="sub">'+(patternIndex+1)+' af '+patterns.length+'</span>'
          +'<button class="btn small ghost" data-learn-next="1">Næste →</button></div>'
        :'';

      box.innerHTML='<div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">'
        +'<div class="sub" style="font-weight:700;margin-bottom:6px">'+esc(p.title)+'</div>'
        +(patterns.length>1?'<div class="sub" style="white-space:nowrap">'+(patternIndex+1)+' af '+patterns.length+'</div>':'')
        +'</div>'
        +'<div style="font-weight:650;line-height:1.35">'+esc(p.text)+'</div>'
        +'<div class="sub" style="margin-top:5px">'+esc(p.question)+'</div>'
        +'<div class="row" style="margin-top:10px;gap:8px"><button class="btn small" data-learn-yes="'+esc(p.key)+'">'+esc(p.yesLabel||'Ja, husk det')+'</button><button class="btn small ghost" data-learn-no="'+esc(p.key)+'">'+esc(p.noLabel||'Ikke nu')+'</button></div>'
        +nav;

      const anchor=document.getElementById('meal-history-suggestions');
      if(anchor&&anchor.parentNode===host.parentNode)anchor.insertAdjacentElement('afterend',box);
      else host.parentNode.insertBefore(box,host);

      box.querySelectorAll('[data-learn-yes]').forEach(b=>b.onclick=()=>{
        acceptPattern(b.dataset.learnYes);
        patternIndex=Math.min(patternIndex,Math.max(0,allPatterns().length-1));
      });
      box.querySelectorAll('[data-learn-no]').forEach(b=>b.onclick=()=>{
        dismissPattern(b.dataset.learnNo);
        patternIndex=Math.min(patternIndex,Math.max(0,allPatterns().length-1));
      });

      const prev=box.querySelector('[data-learn-prev]');
      if(prev)prev.onclick=()=>{
        patternIndex=(patternIndex-1+patterns.length)%patterns.length;
        renderLearningCard();
      };
      const next=box.querySelector('[data-learn-next]');
      if(next)next.onclick=()=>{
        patternIndex=(patternIndex+1)%patterns.length;
        renderLearningCard();
      };
    }catch(e){}
  }

  if(typeof renderList==='function'){
    const oldRenderList=renderList;
    renderList=function(){
      const out=oldRenderList();
      attachListObservers();
      return out;
    };
  }

  if(typeof renderPlan==='function'){
    const oldRenderPlan=renderPlan;
    renderPlan=function(){
      const out=oldRenderPlan();
      attachPlanObservers();
      renderLearningCard();
      return out;
    };
  }

  try{applyRulesNow();renderAll();}catch(e){}

  window.madplanLearning={
    events:()=>learning.events.slice(),
    rules:()=>learning.rules.slice(),
    patterns:()=>allPatterns(),
    preferenceMultiplier:name=>preferenceMultiplier(name),
    counts:()=>({
      events:learning.events.length,
      rules:learning.rules.length,
      quantityChanges:learning.events.filter(e=>e.type==='shopping_qty').length,
      manualAdds:learning.events.filter(e=>e.type==='manual_add').length,
      mealChanges:learning.events.filter(e=>e.type==='meal_change').length,
      ingredientChanges:learning.events.filter(e=>e.type==='ingredient_toggle').length
    })
  };
})();
