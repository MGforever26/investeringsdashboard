(function(){
  const API='https://script.google.com/macros/s/AKfycbzJyz-EbpidFmHsylCUqJ16uuDPHWUDfQde2bcOwYs6egreJwKqeKsYUshl8ov7RnA/exec';
  const CURRENT_ID='madplan-faelles-aktiv';
  const LOCAL_STATE_KEY='madplan_state_local_v1';
  if(!API) return;
  let syncing=false,timer=null;

  function currentLabel(){
    try{return 'Uge '+isoWeek().w}catch(e){return (activeWeek&&activeWeek.label)||'Uge'}
  }

  function useCurrentPlanId(){
    activeWeek=Object.assign({},activeWeek||{}, {id:CURRENT_ID,label:currentLabel()});
    try{localStorage.setItem('madplan_week_meta_v1',JSON.stringify(activeWeek));}catch(e){}
  }

  function shoppingKey(name,cat,source){
    source=source==='ekstra'?'manuelt':(source||'ret');
    return source+'|'+(cat||'andet')+'|'+cleanName(name).toLowerCase();
  }

  function shoppingSnapshot(){
    try{return shopping.map(i=>[i.name,Math.max(0,CATS.indexOf(i.category||'andet')),i.source==='ekstra'?'manuelt':(i.source||'ret'),Number(i.qty)||1,i.on!==false]);}
    catch(e){return []}
  }

  function applyShoppingSnapshot(data){
    try{
      let arr=(data&&Array.isArray(data.sx))?data.sx:[];
      if(!arr.length) return;
      let map={};
      arr.forEach(x=>{
        let name=x[0],cat=typeof x[1]==='number'?(CATS[x[1]]||'andet'):(x[1]||'andet'),source=x[2]==='ekstra'?'manuelt':(x[2]||'ret');
        map[shoppingKey(name,cat,source)]={qty:Number(x[3])||1,on:x[4]!==false};
      });
      shopping.forEach(i=>{let v=map[shoppingKey(i.name,i.category,i.source)];if(v){i.qty=v.qty;i.on=v.on;}});
    }catch(e){}
  }

  if(typeof stateObj==='function'){
    const oldStateObj=stateObj;
    stateObj=function(){
      let o=oldStateObj();
      try{o.sx=shoppingSnapshot();}catch(e){}
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
      if(pendingShopping){
        shopping=pendingShopping.map(i=>({id:Math.random().toString(36).slice(2,9),name:cleanName(i.name),category:i.category,qty:Number(i.qty)||1,on:i.on!==false,source:i.source==='ekstra'?'manuelt':(i.source||'manuelt')}));
        pendingShopping=null;
        buildShopping();
      }else buildShopping();
      applyShoppingSnapshot(data);
      renderAll();
      return true;
    }catch(e){return false;}
  }

  function saveRemoteNow(){
    try{
      writeLocalState();
      if(!activeWeek || !activeWeek.id || typeof stateObj!=='function') return;
      const body=new URLSearchParams({
        action:'save',
        id:activeWeek.id,
        version:new Date().toISOString(),
        payload:JSON.stringify(stateObj()),
        lastEditor:'app',
        note:activeWeek.label||''
      });
      fetch(API,{method:'POST',mode:'no-cors',keepalive:true,headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    }catch(e){}
  }

  function saveRemoteSoon(){
    writeLocalState();
    if(syncing) return;
    clearTimeout(timer);
    timer=setTimeout(saveRemoteNow,500);
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
      })):[];
      let m={};
      function add(name,cat,qty=1,source='ret'){
        name=cleanName(name);cat=cat||'andet';
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
      return '<div class="item"><button class="check '+(i.on?'on':'')+'" data-toggle="'+i.id+'">'+(i.on?'✓':'')+'</button><div><b>'+esc(i.name)+'</b><div class="sub" style="margin:2px 0 0">'+esc(sourceLabel(i.source))+'</div></div><div class="qty"><button data-minus="'+i.id+'">−</button><span>'+i.qty+'</span><button data-plus="'+i.id+'">+</button></div></div>';
    };
  }

  if(typeof addItem==='function'){
    addItem=function(cat,name){
      name=cleanName(name);
      let found=shopping.find(i=>i.category===cat&&i.name.toLowerCase()===name.toLowerCase()&&(i.source==='manuelt'||i.source==='ekstra'));
      if(found){found.qty++;found.on=true;found.source='manuelt'}
      else shopping.push({id:id(),name,category:cat,qty:1,on:true,source:'manuelt'});
      saveSession();renderList();renderPrint();
    };
  }

  async function loadRemote(weekId,force){
    try{
      if(!weekId || syncing) return;
      const data=await jsonp({action:'get',id:weekId});
      if(!data || !data.ok || !data.found || !data.week || !data.week.payload){
        if(force) saveRemoteNow();
        return;
      }
      if(!force && activeWeek.updatedAt && data.week.updatedAt && new Date(data.week.updatedAt)<=new Date(activeWeek.updatedAt)) return;
      syncing=true;
      shopping=[];
      pendingShopping=null;
      applyState(data.week.payload);
      activeWeek=Object.assign({},data.week.payload.w||activeWeek,{id:data.week.id||weekId,updatedAt:data.week.updatedAt||new Date().toISOString()});
      if(weekId===CURRENT_ID) activeWeek.label=currentLabel();
      localStorage.setItem('madplan_week_meta_v1',JSON.stringify(activeWeek));
      if(pendingShopping){
        shopping=pendingShopping.map(i=>({id:Math.random().toString(36).slice(2,9),name:cleanName(i.name),category:i.category,qty:Number(i.qty)||1,on:i.on!==false,source:i.source==='ekstra'?'manuelt':(i.source||'manuelt')}));
        pendingShopping=null;
        buildShopping();
      }else{
        buildShopping({keepManual:false});
      }
      applyShoppingSnapshot(data.week.payload);
      saveSession(false);
      writeLocalState();
      renderAll();
      syncing=false;
    }catch(e){syncing=false;}
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
      saveRemoteNow();
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
    activeWeek=newWeekMeta();
    activeWeek.id=CURRENT_ID;
    activeWeek.label=currentLabel();
    activeWeek.updatedAt=new Date().toISOString();
    try{localStorage.setItem('madplan_week_meta_v1',JSON.stringify(activeWeek));}catch(e){}
    plan=[]; excluded={}; shopping=[]; pendingShopping=null;
    generatePlan();
    buildShopping({keepManual:false});
    saveSession();
    renderAll();
    saveRemoteNow();
  };

  try{restoreLocalState();buildShopping();renderAll();}catch(e){}

  const urlWeek=new URLSearchParams(location.search).get('week');
  if(urlWeek){
    activeWeek=Object.assign({},activeWeek,{id:urlWeek});
    localStorage.setItem('madplan_week_meta_v1',JSON.stringify(activeWeek));
    loadRemote(urlWeek,true);
  }else{
    useCurrentPlanId();
    loadRemote(CURRENT_ID,true);
  }

  window.addEventListener('pagehide',saveRemoteNow);
  window.addEventListener('beforeunload',saveRemoteNow);
  window.addEventListener('focus',()=>loadRemote(activeWeek.id||CURRENT_ID,false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveRemoteNow();else loadRemote(activeWeek.id||CURRENT_ID,false);});
})();
