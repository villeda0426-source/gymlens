'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const tour = [
    {id:'plan', kicker:'YOUR GOALS. YOUR CALL.', title:'A plan that <br>feels like yours.', desc:'Compare two options. Ask Coach for changes. Choose the one that fits your life.', chips:['Your goals','Your equipment','Your schedule'], front:'options',back:'goals',word:'YOU.',note:'Built around you. Chosen by you.'},
    {id:'scan', kicker:'FROM “WHAT IS THAT?” TO “I’VE GOT THIS.”',title:'Meet your <br>next machine.',desc:'Point your camera. Get an equipment match, muscle diagrams, and a clear place to start.',chips:['Camera scanning','Muscle diagrams','Exercise guides'],front:'equipment',back:'scan',word:'SCAN.',note:'A little knowledge. A lot more confidence.'},
    {id:'workout',kicker:'ONE GOOD REP AT A TIME.',title:'Less to juggle. <br>More to focus on.',desc:'Follow the workout, adjust your weight and reps, and log each set as you go.',chips:['Guided sessions','Exercise swaps','Resume anytime'],front:'workout',back:'exercises',word:'LIFT.',note:'Your next step, right in front of you.'},
    {id:'log',kicker:'GIVE YOUR EFFORT A PLACE TO LIVE.',title:'Little wins. <br>Lasting progress.',desc:'Save your sets and see previous personal records. Pick up your session from the Plan tab.',chips:['Weights & reps','Personal records','Saved sessions'],front:'log',back:'plan',word:'GROW.',note:'Every rep is something to build on.'}
  ];
  const cards = $$('.screen-card');
  const screens = new Map(cards.map(c => [c.dataset.screen,{id:c.dataset.screen,title:c.querySelector('.screen-card-label').textContent.trim().replace(/^\d+\s*/,''),alt:c.querySelector('img').alt,src:c.querySelector('img').getAttribute('src')} ]));
  const tabs = $$('[data-tour]');
  let currentTour = 0, timer;
  function setTour(index, focus = false) {
    currentTour = (index + tour.length) % tour.length;
    const item = tour[currentTour];
    tabs.forEach((tab,i) => { tab.setAttribute('aria-selected',String(i===currentTour)); tab.tabIndex=i===currentTour?0:-1; });
    $('#tour-panel').setAttribute('aria-labelledby',`tab-${item.id}`);
    $('#tour-kicker').textContent=item.kicker; $('#tour-title').innerHTML=item.title; $('#tour-desc').textContent=item.desc;
    $('#tour-chips').replaceChildren(...item.chips.map(text => {const span=document.createElement('span');span.textContent=text;return span;}));
    $('#tour-watermark').textContent=item.word; $('#tour-visual-note').textContent=item.note; $('#tour-number').textContent=String(currentTour+1).padStart(2,'0');
    for(const side of ['front','back']) {const screen=screens.get(item[side]);const image=$(`#tour-${side}-img`);image.src=screen.src;image.alt=screen.alt;$(`#tour-${side}`).dataset.screen=screen.id;$(`#tour-${side}`).setAttribute('aria-label',`Enlarge ${screen.title.toLowerCase()} screenshot`);}
    $('#tour-enlarge').dataset.screen=item.front;
    $('#tour-panel').classList.remove('is-changing');clearTimeout(timer);
    requestAnimationFrame(() => {$('#tour-panel').classList.add('is-changing');timer=setTimeout(()=>$('#tour-panel').classList.remove('is-changing'),400);});
    if(focus) tabs[currentTour].focus();
  }
  tabs.forEach((tab,i) => {tab.addEventListener('click',()=>setTour(i));tab.addEventListener('keydown',event=>{const target={ArrowRight:currentTour+1,ArrowLeft:currentTour-1,Home:0,End:tour.length-1};if(event.key in target){event.preventDefault();setTour(target[event.key],true);}});});
  $('#tour-next').addEventListener('click',()=>setTour(currentTour+1));
  const track=$('#screen-track');
  function scrollTrack(direction){const width=cards.find(c=>!c.hidden)?.getBoundingClientRect().width||280;track.scrollBy({left:direction*(width+24),behavior:reducedMotion.matches?'instant':'smooth'});}
  function updateArrows(){$('#gallery-prev').disabled=track.scrollLeft<2;$('#gallery-next').disabled=track.scrollLeft>=track.scrollWidth-track.clientWidth-3;}
  $('#gallery-prev').addEventListener('click',()=>scrollTrack(-1));$('#gallery-next').addEventListener('click',()=>scrollTrack(1));
  track.addEventListener('scroll',updateArrows,{passive:true});window.addEventListener('resize',updateArrows,{passive:true});
  track.addEventListener('keydown',event=>{if(event.target===track&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();scrollTrack(event.key==='ArrowLeft'?-1:1);}});
  $$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
    $$('[data-filter]').forEach(filter=>{const selected=filter===button;filter.classList.toggle('active',selected);filter.setAttribute('aria-pressed',String(selected));});
    cards.forEach(card=>{card.hidden=button.dataset.filter!=='all'&&card.dataset.category!==button.dataset.filter;});
    track.scrollTo({left:0,behavior:'instant'});$('#gallery-count').textContent=`${cards.filter(c=>!c.hidden).length} screens to explore`;updateArrows();
  }));
  const dialog=$('#screen-dialog');let activeScreen='plan', sequence=[];
  function showScreen(id,opening=false){const screen=screens.get(id);if(!screen)return;activeScreen=id;$('#dialog-title').textContent=screen.title;$('#dialog-image').src=screen.src;$('#dialog-image').alt=screen.alt;$('#dialog-count').textContent=`${sequence.indexOf(id)+1} / ${sequence.length}`;if(opening&&!dialog.open){dialog.showModal();document.documentElement.style.overflow='hidden';}}
  document.addEventListener('click',event=>{const trigger=event.target.closest('[data-screen]');if(!trigger)return;sequence=cards.filter(c=>!c.hidden).map(c=>c.dataset.screen);if(!sequence.includes(trigger.dataset.screen))sequence=[...screens.keys()];showScreen(trigger.dataset.screen,true);});
  function advance(direction){showScreen(sequence[(sequence.indexOf(activeScreen)+direction+sequence.length)%sequence.length]);}
  $('#dialog-prev').addEventListener('click',()=>advance(-1));$('#dialog-next').addEventListener('click',()=>advance(1));$('#dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{document.documentElement.style.overflow='';});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();advance(1);}if(event.key==='ArrowLeft'){event.preventDefault();advance(-1);}});
  let touchStart;
  $('#dialog-image').addEventListener('touchstart',event=>{touchStart={x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY};},{passive:true});
  $('#dialog-image').addEventListener('touchend',event=>{if(!touchStart)return;const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy))advance(dx<0?1:-1);touchStart=null;},{passive:true});
  const prompts={time:['Your workout. <br>On your time.','Ask Coach to adjust the session to the time you have. Compare the options before you choose.'],equipment:['Different gear. <br>Same intention.','Tell Coach which equipment you have. Ask for a dumbbell-only workout, or build a plan for home.'],routine:['Your routine. <br>A fresh home.','Paste your routine into SpotLift. Review the matched exercises, then bring it into your plan.']};
  $$('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{$$('[data-prompt]').forEach(prompt=>{const selected=prompt===button;prompt.classList.toggle('active',selected);prompt.setAttribute('aria-pressed',String(selected));});$('#prompt-title').innerHTML=prompts[button.dataset.prompt][0];$('#prompt-desc').textContent=prompts[button.dataset.prompt][1];}));
  if('IntersectionObserver' in window&&!reducedMotion.matches){document.documentElement.classList.add('motion-ready');const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}}),{threshold:.12});$$('.reveal').forEach(element=>observer.observe(element));}
  updateArrows();
})();
