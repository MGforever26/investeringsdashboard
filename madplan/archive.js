(function(){
  'use strict';
  // Uændrede, afsluttede maduger lagres i selvstændige serverposter,
  // så den aktuelle uge ikke begrænses af én Google Sheets-celles størrelse.
  const INDEX_KEY='madplan_archive_index_v1';
  const LOADED_KEY='madplan_archive_loaded_v1';
  const CHUNK_EVENTS=28;
  const KEEP_RECENT_WEEKS=2;

  function fromStorage(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch(e){return fallback}
  }
  function uniqueIds(ids){
    return [...new Set((Array.isArray(ids)?ids:[]).filter(x=>typeof x==='string'&&/^mha-\d{4}-\d{2}-\d{2}-\d+$/.test(x)))].sort();
  }
  let archiveIds=uniqueIds(fromStorage(INDEX_KEY,[]));
  let loaded=fromStorage(LOADED_KEY,{});
  if(!loaded||Array.isArray(loaded)||typeof loaded!=='object')loaded={};
  function persistIndex(){try{localStorage.setItem(INDEX_KEY,JSON.stringify(archiveIds))}catch(e){}}
  function mergeIndex(ids){
    archiveIds=uniqueIds([...archiveIds,...(Array.isArray(ids)?ids:[])]);
    persistIndex();
    return [...archiveIds];
  }
  function register(id){
    if(!archiveIds.includes(id)){
      archiveIds.push(id);
      archiveIds.sort();
      persistIndex();
    }
  }
  function allPlans(state){
    const history=Array.isArray(state&&state.h)?state.h:[];
    const events=Array.isArray(state&&state.learning&&state.learning.events)?state.learning.events:[];
    const byWeek=new Map();
    events.forEach(e=>{
      if(e&&e.week){
        const arr=byWeek.get(e.week)||[];
        arr.push(e);
        byWeek.set(e.week,arr);
      }
    });
    return history.slice(0,Math.max(0,history.length-KEEP_RECENT_WEEKS)).map(w=>{
      const weekEvents=(byWeek.get(w.startedAt)||[]).sort((a,b)=>String(a.ts).localeCompare(String(b.ts))||String(a.id).localeCompare(String(b.id)));
      const parts=[];
      const count=Math.max(1,Math.ceil(weekEvents.length/CHUNK_EVENTS));
      const date=String(w.startedAt||'').slice(0,10);
      for(let i=0;i<count;i++)parts.push({
        id:'mha-'+date+'-'+i,
        payload:{v:1,h:i===0?[w]:[],learning:{events:weekEvents.slice(i*CHUNK_EVENTS,(i+1)*CHUNK_EVENTS)}}
      });
      return {startedAt:w.startedAt,parts};
    }).filter(w=>w.parts.every(p=>/^mha-\d{4}-\d{2}-\d{2}-\d+$/.test(p.id)));
  }
  function unuploaded(state){
    return allPlans(state).flatMap(w=>w.parts.filter(p=>!archiveIds.includes(p.id)));
  }
  function compact(state){
    const all=allPlans(state);
    const completeWeeks=new Set(all.filter(w=>w.parts.every(p=>archiveIds.includes(p.id))).map(w=>w.startedAt));
    // Før arkivering er serverens aktuelle uge fortsat ansvarlig for alle data.
    const history=Array.isArray(state.h)?state.h.filter(w=>!completeWeeks.has(w.startedAt)):[];
    const learning=state.learning&&Array.isArray(state.learning.events)
      ?Object.assign({},state.learning,{events:state.learning.events.filter(e=>!completeWeeks.has(e.week))})
      :state.learning;
    return Object.assign({},state,{h:history,learning,archiveIndex:[...archiveIds]});
  }
  function compactLocal(state){
    const x=Object.assign({},state);
    if(Array.isArray(x.h))x.h=x.h.slice(-4);
    if(x.learning&&Array.isArray(x.learning.events)){
      x.learning=Object.assign({},x.learning,{events:x.learning.events.slice(-120)});
    }
    return x;
  }
  function pendingHydration(){
    return archiveIds.filter(id=>loaded[id]!==true);
  }
  function mergeFromArchive(data){
    try{
      if(data&&Array.isArray(data.h)&&window.madplanMealHistory&&window.madplanMealHistory.mergeArchive)
        window.madplanMealHistory.mergeArchive(data.h);
      if(data&&data.learning&&Array.isArray(data.learning.events)&&window.madplanLearning&&window.madplanLearning.mergeArchive)
        window.madplanLearning.mergeArchive(data.learning.events);
    }catch(e){throw e}
  }
  function markLoaded(id){
    loaded[id]=true;
    try{localStorage.setItem(LOADED_KEY,JSON.stringify(loaded))}catch(e){}
  }
  window.madplanArchive={
    ids:()=>[...archiveIds],
    mergeIndex,
    register,
    unuploaded,
    compact,
    compactLocal,
    pendingHydration,
    mergeFromArchive,
    markLoaded,
    stats:()=>({chunks:archiveIds.length,awaitingDownload:pendingHydration().length,loaded:Object.values(loaded).filter(Boolean).length})
  };
})();