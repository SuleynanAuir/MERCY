'use strict';
(() => {
  const english = window.UIEnglish;
  const $=id=>document.getElementById(id), query=location.search;
  let stopped=false, timer, submitting=false, signature='';
  if((new URLSearchParams(query).get('scene')||'lego')!=='lego'){
    $('orbitPath').value='full';$('legoOrbitPath').disabled=true;$('legoOverviewPath').disabled=true;
  }
  function routeControls(){const full=$('orbitPath').value==='full';for(const id of ['orbitRadius','orbitElevation'])$(id).disabled=!full;}
  $('orbitPath').onchange=routeControls;routeControls();
  async function api(path,body) {
    const r=await fetch('/fvv/api/'+path+query,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok)throw Error((await r.text()).slice(0,240));return r.json();
  }
  async function refresh() {
    try {
      const data=await api('orbit-export'),job=data.job, running=job?.state==='running';
      $('saveOrbit').disabled=submitting||running;$('cancelOrbit').hidden=!running;
      $('orbitProgress').hidden=!job;$('orbitProgress').value=job?.progress||0;
      if(job)$('orbitStatus').textContent=running?`Exporting ${job.frame}/${job.frames} frames · ${Math.floor(job.progress)}%`:job.state==='complete'?'Export complete. Save the video and parameters. JSON. ':'Export incomplete:'+english.text(job.error, 'Check the export server logs.');
      const next=JSON.stringify(data.exports);
      if(signature!==next){signature=next;$('orbitDownloads').replaceChildren();
        for(const item of data.exports){
          const row=document.createElement('p'),label=document.createElement('span');row.className='orbit-export-item';label.textContent=new Date(item.created_at).toLocaleString()+' ';row.append(label);
          for(const [kind,text] of [['video','Download MP4'],['parameters','Download Parameters JSON']]){
            const a=document.createElement('a');a.textContent=text+' ';a.href='/fvv/api/orbit-export/'+item.id+'/'+kind+query;a.download='';row.append(a);
          }
          const button=document.createElement('button');button.textContent='Delete Server Copy';button.onclick=async()=>{
            if(!window.confirm('Delete this video and its parameters from the server? Downloaded files are unaffected.'))return;
            try{await api('orbit-export/'+item.id+'/delete',{});signature='';clearTimeout(timer);await refresh();}catch(e){$('orbitStatus').textContent=english.text(e.message, 'Check the server and SSH tunnel.');}
          };row.append(button);$('orbitDownloads').append(row);
        }
      }
    }catch(e){$('orbitStatus').textContent='Video export service unavailable:'+english.text(e.message, 'Check the server and SSH tunnel.');}
    finally{if(!stopped){clearTimeout(timer);timer=setTimeout(refresh,1500);}}
  }
  $('saveOrbit').onclick=async()=>{
    if(submitting)return;
    const pose=window.FVV.exportPose();if(!pose){$('orbitStatus').textContent='Load a dynamic Gaussian model first.';return;}
    submitting=true;$('saveOrbit').disabled=true;
    try{await api('orbit-export',{...pose,path:$('orbitPath').value,seconds:Number($('orbitSeconds').value),fps:Number($('orbitFps').value),width:Number($('orbitWidth').value),radius:Number($('orbitRadius').value),elevation:Number($('orbitElevation').value)});}
    catch(e){$('orbitStatus').textContent='Cannot export:'+english.text(e.message, 'Check the server and SSH tunnel.');return;}
    finally{submitting=false;$('saveOrbit').disabled=false;}
    clearTimeout(timer);await refresh();
  };
  $('cancelOrbit').onclick=async()=>{try{await api('orbit-export/cancel',{});clearTimeout(timer);await refresh();}catch(e){$('orbitStatus').textContent=english.text(e.message, 'Check the server and SSH tunnel.');}};
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);});
  refresh();
})();
