(function(){
  const API='https://script.google.com/macros/s/AKfycbzJyz-EbpidFmHsylCUqJ16uuDPHWUDfQde2bcOwYs6egreJwKqeKsYUshl8ov7RnA/exec';
  const CURRENT_ID='madplan-faelles-aktiv';
  const LOCAL_STATE_KEY='madplan_state_local_v1';
  // Beskyt den seneste uge mod forsinkede svar fra en tidligere uge.
  const LAST_RESET_KEY='madplan_last_new_week_reset_v2';
  function lastReset(){
    try{
      const v=JSON.parse(localStorage.getItem(LAST_RESET_KEY)||'null');
      return v && v.createdAt ? v : null;
    }catch(e){return null;}
  }
  function rememberReset(){
    try{
      if(activeWeek && activeWeek.createdAt) localStorage.setItem(LAST_RESET_KEY,JSON.stringify({
        createdAt:activeWeek.createdAt, changedAt:activeWeek.changedAt
      }));
    }catch(e){}
  }
  function olderThanLastReset(remoteMeta){
    const reset=lastReset();
    if(!reset) return false;
    const localEpoch=Date.parse(reset.createdAt);
    const remoteEpoch=Date.parse((remoteMeta||{}).createdAt||'');
    return Number.isFinite(localEpoch) && (!Number.isFinite(remoteEpoch) || remoteEpoch < localEpoch);
  }
  if(!API) return;
  let syncing=false,timer=null,dirty=false,sending=false,retryCount=0;
  let retryTimer=null;

  function currentLabel(){
    try{return 'Uge '+isoWeek().w}catch(e){return (activeWeek&&activeWeek.label)||'Uge'}
  }

  function saveWeekMeta(){
    try{localStorage.setItem('madplan_week_meta_v1',JSON.stringify(activeWeek));}catch(e){}
  }

  function deviceEditor(){
    try{return (localStorage.getItem('madplan_editor_name')||'').trim()||'app';}catch(e){return 'app';}
  }

  function showSyncStatus(text){
    try{
      window.madplanSyncStatus={label:text||''};
      const node=document.querySelector('[data-week-sync-status]');
      if(node)node.textContent=text||'';
    }catch(e){}
  }

  function refreshWeekHeader(){
    try{
      const node=document.querySelector('[data-week-last-change]');
      if(!node)return;
      const changed=activeWeek&& (activeWeek.changedAt||activeWeek.updatedAt);
      const date=typeof formatDateTime==='function'?formatDateTime(changed):(changed?new Date(changed).toLocaleString('da-DK'):'ikke ændret endnu');
      const editor=activeWeek&&activeWeek.lastEditor;
      node.textContent='Senest ændret '+date+(editor&&editor!=='app'?' af '+editor:'');
    }catch(e){}
  }

  function markChanged(){
    try{
      const now=new Date().toISOString();
      activeWeek=Object.assign({},activeWeek||{}, {changedAt:now, updatedAt:now,lastEditor:deviceEditor()});
      dirty=true;
      retryCount=0;
      saveWeekMeta();
      showSyncStatus('Synkroniserer…');
      refreshWeekHeader();
    }catch(e){dirty=true;}
  }

  function markSaved(ts,editor){
    try{
      activeWeek=Object.assign({},activeWeek||{}, {savedAt:ts||new Date().toISOString(), lastEditor:editor||((activeWeek&&activeWeek.lastEditor)||'app')});
      saveWeekMeta();
      refreshWeekHeader();
    }catch(e){}
  }

  if(typeof touchWeek==='function'){
    touchWeek=function(){markChanged();};
  }

  function useCurrentPlanId(){
    activeWeek=Object.assign({},activeWeek||{}, {id:CURRENT_ID,label:currentLabel()});
    saveWeekMeta();
  }

  function fixCategory(name,cat){
    let n=cleanName(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if(['havregryn','grove havregryn'].includes(n)) return 'mel og gryn';
    if(['hakkede tomater','tomatpure','tomatpuré','kokosmælk','kokosmaelk','ris','grødris','grodris','nudler','bulgur','couscous','linser','bønner','bonner','kikærter','kikaerter','pasta','lasagneplader','suppehorn'].includes(n)) return 'konserves og tørvarer';
    if(['blomkålsris','blomkalsris'].includes(n)) return 'frostvarer';
    if(['spidskommen','spidskommenfrø','spidskommenfro','karry','kardemomme','stødt koriander','stodt koriander','gurkemeje','sennepsfrø','sennepsfro','krydderier','kanel','sesamfrø','sesamfro','peanuts','honning','mandler','rosiner','pinjekærner','pinjekaerner'].includes(n)) return 'mel og gryn';
    // Samme butikskategorier som i opskriftsdatabasen og kategori-reglerne.
    if(['grøntsagsbouillon','grontsagsbouillon','lage fra ananas'].includes(n)) return 'konserves og tørvarer';
    if(['sukker','majsstivelse','laurbærblade','laurbaerblade'].includes(n)) return 'mel og gryn';
    if(['frisk pasta','tortellini'].includes(n)) return 'mælkeprodukter og pålæg';
    if(['kylling'].includes(n)) return 'andet';
    if(['pølser','pølse','polser','polse','bacon','pulled pork','pepperoni','kyllingepålæg','kyllingepalaeg'].includes(n)) return 'mælkeprodukter og pålæg';
    return cat||'andet';
  }

  function resolvedCategory(name,cat,source){
    source=source==='ekstra'?'manuelt':(source||'ret');
    return source==='manuelt' ? (cat||'andet') : fixCategory(name,cat);
  }

  function shoppingKey(name,cat,source){
    source=source==='ekstra'?'manuelt':(source||'ret');
    cat=resolvedCategory(name,cat,source);
    return source+'|'+cat+'|'+cleanName(name).toLowerCase();
  }

  function shoppingSnapshot(){
    try{return shopping.map(i=>{let source=i.source==='ekstra'?'manuelt':(i.source||'ret');let cat=resolvedCategory(i.name,i.category,source);return [i.name,Math.max(0,CATS.indexOf(cat||'andet')),source,Number(i.qty)||1,i.on!==false];});}
    catch(e){return []}
  }

  function applyShoppingSnapshot(data){
    try{
      let arr=(data&&Array.isArray(data.sx))?data.sx:[];
      if(!arr.length) return;
      let map={};
      arr.forEach(x=>{
        let name=x[0],cat=typeof x[1]==='number'?(CATS[x[1]]||'andet'):(x[1]||'andet'),source=x[2]==='ekstra'?'manuelt':(x[2]||'ret');
        cat=resolvedCategory(name,cat,source);
        map[shoppingKey(name,cat,source)]={qty:Number(x[3])||1,on:x[4]!==false};
      });
      shopping.forEach(i=>{i.category=resolvedCategory(i.name,i.category,i.source);let v=map[shoppingKey(i.name,i.category,i.source)];if(v){i.qty=v.qty;i.on=v.on;}});
    }catch(e){}
  }

  if(typeof stateObj==='function'){
    const oldStateObj=stateObj;
    stateObj=function(){
      let o=oldStateObj();
      try{o.sx=shoppingSnapshot();}catch(e){}
      try{o.w={id:(activeWeek&&activeWeek.id)||CURRENT_ID,label:(activeWeek&&activeWeek.label)||currentLabel(),createdAt:(activeWeek&&activeWeek.createdAt)||null,changedAt:(activeWeek&&activeWeek.changedAt)||null,updatedAt:(activeWeek&&activeWeek.changedAt)||null,savedAt:(activeWeek&&activeWeek.savedAt)||null,lastEditor:(activeWeek&&activeWeek.lastEditor)||null};}catch(e){}
      return o;
    };
  }

  function writeLocalState(){
    try{if(typeof stateObj==='function') localStorage.setItem(LOCAL_STATE_KEY,JSON.stringify(stateObj()));}catch(e){}
  }

  function restoreLocalState(){
    try{
      let raw=localStorage.getItem(LOCAL_STATE_KEY);
      if(!raw) return false;
      let data=JSON.parse(raw);
      if(!data) return false;
      shopping=[]; pendingShopping=null;
      applyState(data);
      if(data.w) activeWeek=Object.assign({},activeWeek||{},data.w,{changedAt:data.w.changedAt||data.w.updatedAt||null});
      if(pendingShopping){
        shopping=pendingShopping.map(i=>{let source=i.source==='ekstra'?'manuelt':(i.source||'manuelt');return {id:Math.random().toString(36).slice(2,9),name:cleanName(i.name),category:resolvedCategory(i.name,i.category,source),qty:Number(i.qty)||1,on:i.on!==false,source};});
        pendingShopping=null;
        buildShopping();
      }else buildShopping();
      applyShoppingSnapshot(data);
      renderAll();
      return true;
    }catch(e){return false;}
  }

  function outgoingBody(weekId,version,editor){
    const source=stateObj();
    // Google Sheets cells have a finite size, and keepalive requests have
    // a 64 KB body limit. Preserve the meal plan and shopping in full, and
    // only shorten the *remote copy* of historical learning events as needed.
    let payload=source;
    const args=data=>new URLSearchParams({
      action:'save',id:weekId,version,payload:JSON.stringify(data),
      lastEditor:editor,note:activeWeek.label||''
    });
    let body=args(payload);
    const rawLimit=44000, encodedLimit=55000;
    if((JSON.stringify(payload).length>rawLimit||body.toString().length>encodedLimit)
       &&source.learning&&Array.isArray(source.learning.events)){
      const allEvents=source.learning.events;
      let count=allEvents.length;
      while(count>=0){
        payload=Object.assign({},source,{
          learning:Object.assign({},source.learning,{events:count===0?[]:allEvents.slice(-count)})
        });
        body=args(payload);
        if(JSON.stringify(payload).length<=rawLimit && body.toString().length<=encodedLimit)break;
        if(count===0)break;
        count=count<=8?count-1:Math.floor(count*0.75);
      }
    }
    if(JSON.stringify(payload).length>rawLimit || body.toString().length>encodedLimit)
      throw new Error('Den fælles uge er for stor til at gemme');
    return body;
  }

  function retryUnconfirmed(){
    clearTimeout(retryTimer);
    if(retryCount>=3){
      showSyncStatus('Synkronisering mislykkedes – kontrollér forbindelsen');
      return;
    }
    retryCount++;
    retryTimer=setTimeout(()=>{if(dirty&&!sending)saveRemoteNow(false);},retryCount*2500);
  }

  async function saveRemoteNow(force=false){
    if(sending||syncing)return;
    if(!activeWeek||!activeWeek.id||typeof stateObj!=='function')return;
    if(!force&&!dirty)return;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    sending=true;
    const weekId=activeWeek.id;
    const version=activeWeek.changedAt||new Date().toISOString();
    const editor=deviceEditor();
    try{
      writeLocalState();
      const body=outgoingBody(weekId,version,editor);
      // Do not clear 'dirty' before a real read-back confirms the save.
      showSyncStatus('Synkroniserer…');
      await fetch(API,{
        method:'POST',mode:'no-cors',keepalive:true,
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body
      });
      // no-cors returns an opaque response even for server-side errors.
      // The only reliable confirmation available with this backend is GET.
      let confirmed=null;
      for(let attempt=0;attempt<3&&!confirmed;attempt++){
        if(attempt)await new Promise(resolve=>setTimeout(resolve,600*attempt));
        const response=await jsonp({action:'get',id:weekId});
        if(!response||!response.ok||!response.found||!response.week)continue;
        const remote=response.week, meta=(remote.payload&&remote.payload.w)||{};
        const stored=remote.version||meta.changedAt||meta.updatedAt;
        if(stored===version)confirmed=remote;
      }
      if(!confirmed)throw new Error('Serveren bekræftede ikke den gemte version');
      if(activeWeek.id===weekId&&activeWeek.changedAt===version){
        dirty=false;
        retryCount=0;
        markSaved(confirmed.updatedAt||new Date().toISOString(),confirmed.lastEditor||editor);
        showSyncStatus('Synkroniseret');
      }
    }catch(e){
      dirty=true;
      showSyncStatus('Synkronisering ikke bekræftet – prøver igen');
      retryUnconfirmed();
    }finally{
      sending=false;
      if(dirty&&activeWeek&&activeWeek.changedAt!==version){
        clearTimeout(timer);
        timer=setTimeout(()=>saveRemoteNow(false),250);
      }
    }
  }

  function saveRemoteSoon(){
    writeLocalState();
    if(syncing)return;
    clearTimeout(timer);
    timer=setTimeout(()=>saveRemoteNow(false),500);
  }

  function jsonp(params){
    return new Promise((resolve,reject)=>{
      const cb='madplan_cb_'+Math.random().toString(36).slice(2,10);
      const s=document.createElement('script');
      let done=false;
      const timeout=setTimeout(()=>{
        if(done) return;
        done=true; delete window[cb]; s.remove(); reject(new Error('timeout'));
      },10000);
      window[cb]=data=>{
        if(done) return;
        done=true; clearTimeout(timeout); delete window[cb]; s.remove(); resolve(data);
      };
      s.onerror=()=>{
        if(done) return;
        done=true; clearTimeout(timeout); delete window[cb]; s.remove(); reject(new Error('load failed'));
      };
      params=Object.assign({},params,{callback:cb,_:Date.now()});
      s.src=API+'?'+new URLSearchParams(params).toString();
      document.body.appendChild(s);
    });
  }

  if(typeof buildShopping==='function'){
    buildShopping=function(opts={}){
      let keepManual=opts.keepManual!==false;
      let prior=keepManual?shoppingSnapshot():[];
      let manual=keepManual?shopping.filter(i=>(i.source==='manuelt'||i.source==='ekstra')&&i.name).map(i=>({
        id:i.id||id(),name:cleanName(i.name),category:i.category||'andet',qty:Number(i.qty)||1,on:i.on!==false,source:'manuelt'
      })) : [];
      let m={};
      function add(name,cat,qty=1,source='ret'){
        name=cleanName(name);cat=fixCategory(name,cat||'andet');
        let key=shoppingKey(name,cat,source);
        if(!m[key])m[key]={id:id(),name,category:cat,qty:0,on:true,source};
        m[key].qty+=qty;
      }
      plan.map(byId).forEach((r,di)=>(r.ingredients||[]).forEach(i=>{if(ingOn(di,i))add(i.name,i.category,1,'ret')}));
      STANDARD.forEach(i=>add(i.name,i.category,i.qty,'standard'));
      manual.forEach(i=>{let key=shoppingKey(i.name,i.category,'manuelt');if(!m[key])m[key]=i;else m[key].qty+=i.qty});
      shopping=Object.values(m).sort((a,b)=>CATS.indexOf(a.category)-CATS.indexOf(b.category)||a.source.localeCompare(b.source,'da')||a.name.localeCompare(b.name,'da'));
      applyShoppingSnapshot({sx:prior});
    };
  }

  if(typeof itemRow==='function'){
    itemRow=function(i){
      i.category=resolvedCategory(i.name,i.category,i.source);
      return '<div class="item"><button class="check '+(i.on?'on':'')+'" data-toggle="'+i.id+'">'+(i.on?'✓':'')+'</button><div><b>'+esc(i.name)+'</b><div class="sub" style="margin:2px 0 0">'+esc(sourceLabel(i.source))+'</div></div><div class="qty"><button data-minus="'+i.id+'">−</button><span>'+i.qty+'</span><button data-plus="'+i.id+'">+</button></div></div>';
    };
  }

  if(typeof addItem==='function'){
    addItem=function(cat,name){
      name=cleanName(name);cat=cat||'andet';
      let found=shopping.find(i=>i.category===cat&&i.name.toLowerCase()===name.toLowerCase()&&(i.source==='manuelt'||i.source==='ekstra'));
      if(found){found.qty++;found.on=true;found.source='manuelt'}
      else shopping.push({id:id(),name,category:cat,qty:1,on:true,source:'manuelt'});
      saveSession();renderList();renderPrint();
    };
  }

  async function loadRemote(weekId,force){
    try{
      if(!weekId || syncing || sending || dirty) return;
      const data=await jsonp({action:'get',id:weekId});
      // En ændring kan være lavet på telefonen, mens serveren svarede.
      if(sending||dirty)return;
      if(!data || !data.ok || !data.found || !data.week || !data.week.payload){
        showSyncStatus('Fælles madplan kunne ikke findes');
        return;
      }
      try{window.madplanLastRemotePayload=data.week.payload;}catch(e){}
      let remoteMeta=data.week.payload.w||{};
      let remoteChanged=remoteMeta.changedAt||remoteMeta.updatedAt||data.week.version||data.week.updatedAt||null;
      let localChanged=(activeWeek&&activeWeek.changedAt)||null;
      // En indledende tvungen hentning må ikke overskrive en nyere lokal uge.
      if(weekId===CURRENT_ID && olderThanLastReset(remoteMeta)){
        saveRemoteNow(true);
        return;
      }
      if(localChanged && remoteChanged && new Date(remoteChanged)<new Date(localChanged)){
        if(weekId===CURRENT_ID){
          // Genforsøg ældre lokale ændringer, der tidligere blev markeret
          // som gemt uden serverkvittering.
          dirty=true;
          showSyncStatus('Nyere lokale ændringer afventer synkronisering');
          saveRemoteNow(true);
        }
        return;
      }
      if(localChanged && remoteChanged && new Date(remoteChanged).getTime()===new Date(localChanged).getTime()){
        activeWeek.lastEditor=data.week.lastEditor||remoteMeta.lastEditor||activeWeek.lastEditor;
        activeWeek.savedAt=data.week.updatedAt||remoteMeta.savedAt||activeWeek.savedAt;
        saveWeekMeta();
        refreshWeekHeader();
        showSyncStatus('Synkroniseret');
        return;
      }
      syncing=true;
      shopping=[];
      pendingShopping=null;
      applyState(data.week.payload);
      activeWeek=Object.assign({},activeWeek||{},remoteMeta,{id:data.week.id||weekId,changedAt:remoteChanged,updatedAt:remoteChanged,savedAt:remoteMeta.savedAt||data.week.updatedAt||null,lastEditor:data.week.lastEditor||remoteMeta.lastEditor||'app'});
      if(weekId===CURRENT_ID){
        activeWeek.label=currentLabel();
        rememberReset();
      }
      saveWeekMeta();
      if(pendingShopping){
        shopping=pendingShopping.map(i=>{let source=i.source==='ekstra'?'manuelt':(i.source||'manuelt');return {id:Math.random().toString(36).slice(2,9),name:cleanName(i.name),category:resolvedCategory(i.name,i.category,source),qty:Number(i.qty)||1,on:i.on!==false,source};});
        pendingShopping=null;
        buildShopping();
      }else{
        buildShopping({keepManual:false});
      }
      applyShoppingSnapshot(data.week.payload);
      // Også gamle, allerede aktive uger skal få fem alternativer uden
      // at brugerens madplan eller indkøbsliste nulstilles.
      let repairedSuggestions=false;
      try{
        if(window.madplanMealHistory&&typeof window.madplanMealHistory.ensureAlternativeSuggestions==='function'){
          repairedSuggestions=window.madplanMealHistory.ensureAlternativeSuggestions();
        }
      }catch(e){}
      saveSession(false);
      writeLocalState();
      renderAll();
      syncing=false;
      showSyncStatus('Synkroniseret');
      if(repairedSuggestions)saveSession();
    }catch(e){
      syncing=false;
      showSyncStatus('Kunne ikke kontrollere fælles madplan');
    }
  }

  if(typeof saveSession==='function'){
    const oldSave=saveSession;
    saveSession=function(touch=true){
      oldSave(touch);
      writeLocalState();
      if(touch!==false) saveRemoteSoon();
    };
  }

  if(typeof shareWeek==='function'){
    shareWeek=async function(){
      saveSession();
      saveRemoteNow(true);
      let longLink=location.origin+location.pathname+'?week='+encodeURIComponent(activeWeek.id||CURRENT_ID);
      let link=longLink;
      try{
        let r=await fetch('https://tinyurl.com/api-create.php?url='+encodeURIComponent(longLink));
        let t=(await r.text()).trim();
        if(r.ok && /^https?:\/\//.test(t)) link=t;
      }catch(e){}
      let msg=['Her er ugens madplan:',link].join(String.fromCharCode(10));
      try{
        if(navigator.share){await navigator.share({title:'Madplan',text:msg});return;}
        await navigator.clipboard.writeText(msg);
        alert('Madplan-linket er kopieret. Send det til hende.');
      }catch(e){prompt('Kopiér Madplan-linket:',msg);}
    };
  }

  startNewWeek=function(){
    if(!confirm('Start ny uge? Den aktuelle madplan og manuelt tilføjede varer ryddes for jer begge.')) return;
    const now=new Date().toISOString();
    activeWeek=newWeekMeta();
    activeWeek.id=CURRENT_ID;
    activeWeek.label=currentLabel();
    activeWeek.changedAt=now;
    activeWeek.updatedAt=now;
    activeWeek.savedAt=null;
    activeWeek.lastEditor=null;
    rememberReset();
    dirty=true;
    saveWeekMeta();
    plan=[]; excluded={}; shopping=[]; pendingShopping=null;
    generatePlan();
    buildShopping({keepManual:false});
    saveSession();
    renderAll();
    saveRemoteNow(true);
  };

  async function bootstrapSharedWeek(){
    // Vent på opskrifter og initialisering før lokal/gemens restaurering.
    // Ellers kan en ny installation gemme en tilfældig uge oven i den fælles.
    try{if(window.madplanInitReady)await window.madplanInitReady;}catch(e){}
    try{restoreLocalState();buildShopping();renderAll();}catch(e){}
    const urlWeek=new URLSearchParams(location.search).get('week');
    if(urlWeek){
      activeWeek=Object.assign({},activeWeek,{id:urlWeek});
      saveWeekMeta();
      loadRemote(urlWeek,true);
    }else{
      useCurrentPlanId();
      loadRemote(CURRENT_ID,true);
    }
  }
  bootstrapSharedWeek();

  // Also refresh while both phones remain open. Focus/visibility still checks immediately.
  setInterval(()=>{
    if(document.hidden||dirty||sending||syncing)return;
    loadRemote(activeWeek.id||CURRENT_ID,false);
  },60000);

  window.addEventListener('pagehide',()=>saveRemoteNow(false));
  window.addEventListener('beforeunload',()=>saveRemoteNow(false));
  window.addEventListener('focus',()=>{
    if(dirty)saveRemoteNow(false);
    else loadRemote(activeWeek.id||CURRENT_ID,false);
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(dirty)saveRemoteNow(false);}
    else if(dirty)saveRemoteNow(false);
    else loadRemote(activeWeek.id||CURRENT_ID,false);
  });
})();