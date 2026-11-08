/* Shared accessible controls and dialog behavior. */
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const hud=document.getElementById('hud-layer'),canvas=document.getElementById('glcanvas');
    const toolbar=document.createElement('div');toolbar.className='system-controls interactive';toolbar.setAttribute('aria-label','播放设置');
    const qualityLabel=document.createElement('label');qualityLabel.textContent='画质 ';
    const quality=document.createElement('select');quality.id='quality';
    for(const [value,text]of [['auto','自动'],['low','低'],['medium','中'],['high','高']]){const option=document.createElement('option');option.value=value;option.textContent=text;quality.append(option);}
    qualityLabel.append(quality);toolbar.append(qualityLabel);
    const volumeLabel=document.createElement('label');volumeLabel.textContent='音量 ';
    const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.id='volume';volumeLabel.append(volume);toolbar.append(volumeLabel);
    const reduceLabel=document.createElement('label'),reduce=document.createElement('input');reduce.type='checkbox';reduce.id='reduced-motion';reduceLabel.append(reduce,document.createTextNode(' 减少动态'));toolbar.append(reduceLabel);
    const pause=document.createElement('button');pause.id='pause-scene';pause.type='button';pause.textContent='暂停画面';toolbar.append(pause);
    const qualityStatus=document.createElement('span');qualityStatus.id='quality-status';toolbar.append(qualityStatus);
    hud.querySelector('.top-bar').after(toolbar);
    function syncSettings(){const s=Cosmos.settings;quality.value=s.mode;volume.value=String(s.volume);reduce.checked=s.reduced;qualityStatus.textContent=s.mode==='auto'?'当前：'+({high:'高',medium:'中',low:'低'}[s.effective]):'';}
    syncSettings();Cosmos.events.addEventListener('settings',syncSettings);
    quality.addEventListener('change',()=>Cosmos.setQuality(quality.value));volume.addEventListener('input',()=>Cosmos.setVolume(volume.value));reduce.addEventListener('change',()=>Cosmos.setReduced(reduce.checked));
    pause.addEventListener('click',()=>{if(Cosmos.info().paused){Cosmos.resume();pause.textContent='暂停画面';}else{Cosmos.pause();pause.textContent='继续播放';}});
    [...document.querySelectorAll('.content-area > .panel')].forEach((panel,index)=>{
      const details=document.createElement('details');details.className=panel.className;details.id=index===0?'science-panel':'controls-panel';details.open=!matchMedia('(max-width:700px)').matches||index>0;
      const summary=document.createElement('summary');summary.textContent=panel.querySelector('h3')?.textContent.trim()||'控制面板';panel.querySelector('h3')?.remove();details.append(summary,...panel.childNodes);panel.replaceWith(details);
    });
    document.querySelectorAll('input[type=range][id^="param-"]').forEach(input=>{const title=input.closest('.control-item')?.querySelector('.control-label span');if(title){const label=document.createElement('label');label.htmlFor=input.id;label.textContent=title.textContent;title.replaceWith(label);}});
    document.querySelectorAll('a.nav-tab.active').forEach(a=>a.setAttribute('aria-current','page'));
    const syncButton=button=>{if(button.matches('.mode-btn,.stage-btn,.epoch-btn,.spectral-btn')||button.id==='btn-audio'||button.id==='btn-director')button.setAttribute('aria-pressed',String(button.classList.contains('active')));};
    document.querySelectorAll('button').forEach(syncButton);new MutationObserver(records=>{for(const r of records)if(r.target.tagName==='BUTTON')syncButton(r.target);}).observe(hud,{subtree:true,attributes:true,attributeFilter:['class']});
    const restore=document.createElement('button');restore.id='restore-hud';restore.textContent='恢复控制界面';restore.hidden=true;document.body.append(restore);
    function toggleHud(force){const hidden=force??!hud.classList.contains('hud-hidden');hud.classList.toggle('hud-hidden',hidden);hud.inert=hidden;restore.hidden=!hidden;if(hidden)restore.focus();else document.getElementById('btn-toggle-hud').focus();}
    document.getElementById('btn-toggle-hud').addEventListener('click',()=>toggleHud());restore.addEventListener('click',()=>toggleHud(false));
    const modal=document.getElementById('modal-box'),open=document.getElementById('btn-modal'),close=document.getElementById('btn-close-modal');
    const title=modal.querySelector('h2');title.id='science-dialog-title';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby',title.id);modal.setAttribute('aria-hidden','true');close.setAttribute('aria-label','关闭科学资料');
    function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');hud.inert=false;canvas.inert=false;open.focus();}
    open.addEventListener('click',()=>{modal.classList.add('open');modal.setAttribute('aria-hidden','false');hud.inert=true;canvas.inert=true;close.focus();});close.addEventListener('click',closeModal);modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
    document.addEventListener('keydown',event=>{
      if(modal.classList.contains('open')){
        if(event.key==='Escape'){closeModal();event.preventDefault();}
        if(event.key==='Tab'){const nodes=[...modal.querySelectorAll('button,a[href],input,[tabindex="0"]')].filter(n=>!n.disabled&&n.offsetParent!==null);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}}
      }else if(event.key.toLowerCase()==='h'&&!event.target.closest('input,select,textarea,[contenteditable=true]')){toggleHud();event.preventDefault();}
    });
    const notice=document.createElement('p');notice.className='model-notice';notice.textContent='程序化科普演示：画面、参数与合成声景的模型范围和参考来源见下文。';modal.querySelector('.modal-header').after(notice);
    const live=document.createElement('div');live.id='runtime-status';live.setAttribute('role','status');document.body.append(live);Cosmos.events.addEventListener('status',()=>{const info=Cosmos.info();live.textContent=info.status==='lost'?'图形上下文已丢失，等待恢复。':info.status==='ready'&&info.generation>1?'图形资源已恢复。':'';});
  });
})();
