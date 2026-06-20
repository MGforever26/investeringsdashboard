(function(){
  function normName(x){
    return cleanName(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9æøå ]+/gi,' ').replace(/\s+/g,' ').trim();
  }

  function canonicalCat(cat){
    cat=String(cat||'').trim();
    if(cat==='tørvarer og konserves') return 'konserves og tørvarer';
    if(cat==='hakkede tomater') return 'konserves og tørvarer';
    return cat||'andet';
  }

  function inList(n,words){return words.indexOf(n)!==-1;}

  function betterCategory(name,cat){
    let n=normName(name);
    let original=canonicalCat(cat);

    // Explicit decisions: these override old saved/shared lists if they contain historic wrong categories.
    if(inList(n,['kyllingepålæg','kyllingepalaeg'])) return 'mælkeprodukter og pålæg';
    if(inList(n,['kylling','hakket oksekød','hakket oksekod','hakket svinekød','hakket svinekod','lammekød','lammekod','tykstegsbøf','tykstegsbof','fiskefars'])) return 'andet';
    if(inList(n,['pølser','pølse','polser','polse','bacon','pulled pork','pepperoni','salsichia','røget skinke','roget skinke'])) return 'mælkeprodukter og pålæg';
    if(inList(n,['havregryn','grove havregryn','sesamfrø','sesamfro','peanuts','honning','hasselnødder','hasselnodder','mandler','rosiner','pinjekærner','pinjekaerner','karry','spidskommen','spidskommenfrø','spidskommenfro','kardemomme','stødt koriander','stodt koriander','gurkemeje','sennepsfrø','sennepsfro','kanel','krydderier','lauerbærblade','lauerbaerblade','laurbærblade','laurbaerblade'])) return 'mel og gryn';
    if(inList(n,['ris','grødris','grodris','hakkede tomater','tomatpure','kokosmælk','kokosmaelk','pasta','nudler','lasagneplader','suppehorn','røde linser','rode linser','kikærter','kikaerter','røde bønner','rode bonner','sorte bønner','sorte bonner','kidney bønner','kidney bonner','bulgur','peanutbutter'])) return 'konserves og tørvarer';
    if(inList(n,['blomkålsris','blomkalsris','frostmajs','ærter','aerter','majs','frosne pomfritter','frosne ærter','frosne aerter','frosne grøntsager','frosne grontsager','frostsuppe','kød og melboller','kod og melboller','hvidløgsflute','hvidlogsflute','falafler','rødbedebøffer','roedbedeboffer','rødspættefilet','rodspaettefilet','torsk'])) return 'frostvarer';
    if(inList(n,['pitabrød','pitabrod','pølsebrød','polsebrod','burgerboller','rugbrød','rugbrod','tortillas'])) return 'brød';
    if(inList(n,['æblecidereddike','aeblecidereddike','worcestershiresauce','chili','barbecuesauce','ketchup','lagereddike','sukker','lage fra ananas','grøntsagsbouillon','grontsagsbouillon','majsstivelse','frisk pasta','tortellini','rødvin','rodvin'])) return 'andet';

    // Database category wins for everything else.
    return original;
  }

  function normalizeShoppingCategories(){
    if(!Array.isArray(shopping)) return;
    shopping.forEach(i=>{i.category=betterCategory(i.name,i.category);});
  }

  if(typeof buildShopping==='function'){
    const previousBuildShopping=buildShopping;
    buildShopping=function(opts={}){
      previousBuildShopping(opts);
      normalizeShoppingCategories();
    };
  }

  if(typeof addItem==='function'){
    const previousAddItem=addItem;
    addItem=function(cat,name){
      return previousAddItem(betterCategory(name,cat),name);
    };
  }

  if(typeof saveSession==='function'){
    const previousSaveSession=saveSession;
    saveSession=function(touch=true){
      normalizeShoppingCategories();
      previousSaveSession(touch);
    };
  }

  try{
    normalizeShoppingCategories();
    if(typeof renderList==='function') renderList();
    if(typeof renderPrint==='function') renderPrint();
    if(typeof saveSession==='function') saveSession(false);
  }catch(e){}
})();
