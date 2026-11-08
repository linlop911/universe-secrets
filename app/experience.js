/* One shared chapter experience. Timing is driven by Cosmos's existing RAF. */
(() => {
  'use strict';
  const query=new URLSearchParams(location.search).get('lang'),preferred=String(navigator.language||'').toLowerCase();
  const LANG=['zh','en','ja'].includes(query)?query:preferred.startsWith('ja')?'ja':preferred.startsWith('en')?'en':'zh';
  document.addEventListener('DOMContentLoaded',()=>{
    const id=document.body.dataset.chapter,data=CosmicContent.languages[LANG].chapters[id],duration=CosmicContent.duration;
    const hud=document.getElementById('hud-layer'),canvas=document.getElementById('glcanvas');
    document.documentElement.style.setProperty('--chapter-accent',data.accent);
    document.body.classList.add('chapter-experience');
    document.querySelector('.header-box,.header-title').classList.add('chapter-navigation');
    document.querySelector('.observatory-tag').hidden=true;
    for(const panel of [document.getElementById('science-panel'),document.getElementById('controls-panel')])panel.open=false;
    document.querySelector('.bottom-bar').parentElement.classList.add('chapter-readouts');
    const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
    const link=(text,url)=>{const a=el('a','source-link',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
    const intro=el('section','chapter-intro interactive');intro.setAttribute('aria-labelledby','chapter-question');
    intro.append(el('p','chapter-eyebrow',data.number+' / 06  ·  '+data.eyebrow));
    const question=el('h2','chapter-question',data.question);question.id='chapter-question';intro.append(question,el('p','chapter-introduction',data.intro));
    const coreBox=el('div','chapter-core'),coreLabel=el('label','',data.coreLabel);coreLabel.htmlFor='chapter-control';
    const core=document.getElementById(data.core),control=el('input');control.id='chapter-control';control.type='range';for(const attribute of ['min','max','step'])control.setAttribute(attribute,core.getAttribute(attribute));control.value=core.value;
    const value=el('output','chapter-core-value');value.htmlFor=control.id;coreBox.append(coreLabel,value,control);intro.append(coreBox);
    const actions=el('div','chapter-actions'),source=link(data.sourceLabel,data.sourceUrl);source.id='chapter-source';
    const compare=el('button','observation-button',id==='wormhole'||id==='heatdeath'?'查看理论图解':'打开观测对照');compare.id='open-observatory';actions.append(compare,source);intro.append(actions,el('p','scene-kind',data.kind));hud.append(intro);

    const assets=data.assets.map(assetId=>CosmicContent.languages[LANG].assets.find(a=>a.id===assetId));
    const evidence=el('figure','guide-evidence interactive');evidence.hidden=true;
    const evidenceImage=el('img');evidenceImage.src=assets[0].localPath;evidenceImage.alt=assets[0].title;
    const evidenceCaption=el('figcaption'),evidenceTag=el('span','asset-kind',assets[0].contentType),evidenceTitle=el('strong','',assets[0].title);
    const evidenceCredit=el('small','asset-credit',assets[0].credit),evidenceSource=link('查看原始资料',assets[0].sourceUrl);
    evidenceCaption.append(evidenceTag,evidenceTitle,el('span','',data.evidence),evidenceCredit,evidenceSource);evidence.append(evidenceImage,evidenceCaption);hud.append(evidence);

    const deck=el('section','guide-deck interactive');deck.setAttribute('aria-label','章节导览');
    const progress=el('progress');progress.id='guide-progress';progress.max=duration;progress.value=0;progress.setAttribute('aria-label','导览进度');
    const beats=el('div','guide-beats');beats.id='guide-beats';beats.setAttribute('aria-hidden','true');
    for(const frame of data.frames)beats.append(el('span'));
    const guideTitle=el('h3','','先看见，再理解。'),guideVoice=el('p','guide-voice',data.frames[0].voice),guideText=el('p','','点击开始，跟随镜头与关键变量探索这一章；也可以拖动上方滑块，自由比较。');guideTitle.id='guide-title';guideVoice.id='guide-voice';guideText.id='guide-text';
    const transport=el('div','guide-transport'),play=el('button','guide-primary','开始 '+duration+' 秒导览'),next=el('button','','下一幕'),leave=el('button','','自由探索'),counter=el('span','guide-counter','00 / '+duration);
    play.id='guide-play';next.id='guide-next';leave.id='guide-exit';transport.append(play,next,leave,counter);deck.append(progress,beats,guideTitle,guideVoice,guideText,transport);hud.append(deck);

    const dialog=el('dialog','observatory');dialog.id='observatory';dialog.setAttribute('aria-labelledby','observatory-title');
    const dialogTop=el('header','observatory-header'),dialogTitle=el('h2','','从模拟，走向原始资料。'),close=el('button','','关闭对照');dialogTitle.id='observatory-title';close.id='close-observatory';dialogTop.append(dialogTitle,close);
    const tabs=el('div','observation-tabs');tabs.setAttribute('aria-label','资料选择');
    const plate=el('figure','observation-plate'),photo=el('img'),caption=el('figcaption'),tag=el('span','asset-kind'),title=el('h3'),description=el('p'),credit=el('p','asset-credit'),processing=el('p','asset-processing'),original=link('查看原始发布页面',assets[0].sourceUrl);
    photo.id='observation-image';plate.append(photo,caption);caption.append(tag,title,description,credit,processing,original);
    const connections=el('div','observation-connections');connections.append(el('h3','','继续追问'),link(data.sourceLabel,data.sourceUrl),...data.related.map(item=>link(item.label,item.url)));
    if(id==='index'||id==='stellar'){const official=el('section','official-sound');official.append(el('span','asset-kind','数据声化 · NASA'),el('h3','',data.officialSound.title),el('p','',data.officialSound.description),link('前往 NASA 播放官方声化',data.officialSound.url));connections.append(official);}
    dialog.append(dialogTop,tabs,plate,el('p','evidence-explanation',data.evidence),connections);document.body.append(dialog);
    let selected=0,wasPaused=false;
    function selectAsset(index){selected=index;const asset=assets[index];photo.src=asset.localPath;photo.alt=asset.title;tag.textContent=asset.contentType;title.textContent=asset.title;description.textContent=asset.supportsClaim;credit.textContent=asset.credit;processing.textContent=asset.processing;original.href=asset.sourceUrl;for(const [i,button]of [...tabs.children].entries()){button.classList.toggle('active',i===index);button.setAttribute('aria-pressed',String(i===index));}}
    assets.forEach((asset,index)=>{const button=el('button','',asset.title);button.type='button';button.addEventListener('click',()=>selectAsset(index));tabs.append(button);});selectAsset(0);
    compare.addEventListener('click',()=>{wasPaused=Cosmos.info().paused;Cosmos.pause();dialog.showModal();close.focus();});
    function closeObservation(){dialog.close();if(!wasPaused)Cosmos.resume();compare.focus();}
    close.addEventListener('click',closeObservation);
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeObservation();}});

    const frames=[];let carried={};for(const frame of data.frames){carried={...carried,...frame.controls};frames.push({...frame,controls:{...carried}});}
    let status='idle',time=0,anchor=0,step=-1,applying=false;
    function syncCore(){control.value=core.value;value.textContent=Number(core.value).toFixed(core.step.includes('.')?core.step.split('.')[1].length:0)+' '+data.coreUnit;}
    syncCore();document.addEventListener('input',event=>{if(event.target===core)syncCore();if(!applying&&event.isTrusted&&event.target.matches('input[id^="param-"]')){Cosmos.setSceneLevel(1);if(status==='playing')pauseGuide();}});
    Cosmos.events.addEventListener('modelchange',syncCore);
    document.addEventListener('click',event=>{if(event.isTrusted&&status==='playing'&&event.target.closest('.mode-btn,.epoch-btn,.spectral-btn,#btn-director,#btn-autoplay,#btn-traverse,#btn-rebirth'))pauseGuide();});
    let lastSecond=-1,lastPlay='';
    function syncTransport(){progress.value=time;const second=Math.floor(time);if(second!==lastSecond){lastSecond=second;counter.textContent=String(second).padStart(2,'0')+' / '+duration;}const label=status==='playing'?'暂停导览':status==='paused'?'继续导览':status==='reading'?'阅读当前一幕':status==='complete'?'重播导览':'开始 '+duration+' 秒导览';if(label!==lastPlay){lastPlay=label;play.textContent=label;}play.setAttribute('aria-pressed',String(status==='playing'));}
    function applyFrame(second,actionsEnabled){
      time=Math.max(0,Math.min(duration,second));let index=0;while(index<frames.length-1&&time>=frames[index+1].at)index++;
      const frame=frames[index],end=frames[Math.min(index+1,frames.length-1)],fraction=end===frame?0:(time-frame.at)/(end.at-frame.at),smooth=fraction*fraction*(3-2*fraction);
      const controls={};for(const [key,start]of Object.entries(frame.controls))controls[key]=start+(end.controls[key]-start)*smooth;
      const camera=frame.camera.map((start,i)=>start+(end.camera[i]-start)*smooth);
      applying=true;Cosmos.apply(controls,{camRadius:camera[0],camTheta:camera[1],camPhi:camera[2],directorMode:false,autoplay:false,isDragging:true});applying=false;
      if(index!==step){
        step=index;guideTitle.textContent=frame.title;guideVoice.textContent=frame.voice;guideText.textContent=frame.text;
        deck.classList.remove('beat-in');void deck.offsetWidth;deck.classList.add('beat-in');
        for(const [beatIndex,beat]of [...beats.children].entries())beat.classList.toggle('is-current',beatIndex===index);
        if(Object.hasOwn(frame,'mode'))document.querySelector(`button[data-mode="${frame.mode}"]`).click();
        evidence.hidden=!Boolean(frame.evidence);document.body.classList.toggle('showing-evidence',Boolean(frame.evidence));
        if(id==='stellar'&&frame.evidence){evidenceImage.src=assets[1].localPath;evidenceImage.alt=assets[1].title;evidenceTitle.textContent=assets[1].title;evidenceTag.textContent=assets[1].contentType;evidenceCredit.textContent=assets[1].credit;evidenceSource.href=assets[1].sourceUrl;}
        if(frame.action==='traverse'&&actionsEnabled){if(Cosmos.state.audioActive)document.getElementById('btn-traverse').click();else Cosmos.apply({},{isTraversing:true,traverseStart:Cosmos.info().elapsed,traverseRadius:Cosmos.state.camRadius,traverseUniverse:Cosmos.state.inUniverseB});}
      }
      if(id==='heatdeath')Cosmos.setSceneLevel(time<24?1:Math.max(.025,1-(time-24)/16));
      if(id==='stellar')Cosmos.setSceneLevel(time<24 ? .035 : Math.min(1,.035+(time-24)/8));
      syncTransport();
    }
    function start(){step=-1;time=0;anchor=Cosmos.info().elapsed;status=Cosmos.settings.reduced?'reading':'playing';Cosmos.setSceneLevel(1);document.body.classList.add('guide-active');Cosmos.resume();applyFrame(0,false);}
    function pauseGuide(){status='paused';syncTransport();}
    for(const type of ['pointerdown','wheel'])canvas.addEventListener(type,()=>{if(status==='playing')pauseGuide();},{passive:true});
    canvas.addEventListener('keydown',event=>{if(status==='playing'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(event.key))pauseGuide();});
    function resumeGuide(){status='playing';anchor=Cosmos.info().elapsed-time*1000;Cosmos.resume();syncTransport();}
    function stop(){status='idle';document.body.classList.remove('guide-active','showing-evidence');evidence.hidden=true;Cosmos.setSceneLevel(1);Cosmos.apply({},{isDragging:false,directorMode:false});if(id==='wormhole'){Cosmos.apply({},{isTraversing:false});const button=document.getElementById('btn-traverse');button.disabled=false;button.textContent='🚀 穿越平行宇宙 (Traverse)';}syncTransport();}
    function seek(second){anchor=Cosmos.info().elapsed-second*1000;step=-1;applyFrame(second,false);}
    play.addEventListener('click',()=>{if(status==='playing')pauseGuide();else if(status==='paused')resumeGuide();else if(status!=='reading')start();});
    next.addEventListener('click',()=>{if(status==='idle'||status==='complete')start();else if(step<frames.length-1)seek(frames[step+1].at);else{status='complete';time=duration;syncTransport();}});leave.addEventListener('click',stop);
    control.addEventListener('input',()=>{if(status==='playing')pauseGuide();const controls={[data.core]:Number(control.value)};Cosmos.apply(controls,{isDragging:false,directorMode:false});if(id==='cosmicweb')document.querySelector('button[data-mode="2"]').click();syncCore();});
    Cosmos.events.addEventListener('beforeframe',event=>{if(status!=='playing')return;applyFrame((event.detail.elapsed-anchor)/1000,true);if(time>=duration){status='complete';syncTransport();}});
    Cosmos.events.addEventListener('settings',()=>{if(Cosmos.settings.reduced&&status==='playing'){status='reading';syncTransport();}});
    window.CosmicGuide={start,stop,seek,next:()=>next.click(),pause:pauseGuide,info:()=>({chapter:id,status,time,step,duration,selectedAsset:selected})};
    syncTransport();
  });
})();
