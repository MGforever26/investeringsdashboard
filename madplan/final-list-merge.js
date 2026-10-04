(function(){
  function normName(x){
    return cleanName(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  groupedItems=function(){
    const groups={};
    finalItems().forEach(i=>{
      const cat=i.category||'andet';
      const key=normName(i.name);
      const list=groups[cat]??(groups[cat]=[]);
      let found=list.find(x=>normName(x.name)===key);
      if(found){
        found.qty+=(Number(i.qty)||1);
      }else{
        list.push(Object.assign({},i,{qty:Number(i.qty)||1}));
      }
    });
    return groups;
  };

  try{renderPrint();}catch(e){}
})();
