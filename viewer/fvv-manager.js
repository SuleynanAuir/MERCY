'use strict';
(() => {
  const english = window.UIEnglish;
  const $=id=>document.getElementById(id), query=location.search;
  let data, timer, working=false, polling=false, awaitingLoad=false, selectedResult=null, upload=null, stopped=false, notice=null;
  function modelLabel(model) {
    const date=new Date(model.trained_at || NaN);
    return `${english.text(model.scene, 'Model') || 'Model'} · ${Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString('en-US',{hour12:false})}`;
  }
  function deleteState() {
    const selected=data?.models.find(x=>x.id===$('modelSelect').value);
    $('deleteModel').disabled=working||data?.loading||data?.job?.state==='running'||!selected||selected.active;
  }
  function progress(message,value) {
    message=english.text(message, 'Model operation failed. Check the server logs.'); notice=message; $('modelTask').textContent=message; $('modelProgress').hidden=false;
    if(value===null) $('modelProgress').removeAttribute('value');
    else $('modelProgress').value=value;
  }
  async function api(path,body) {
    const response=await fetch('/fvv/api/'+path+query,body===undefined ? {cache:'no-store'} :
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok) throw new Error((await response.text()).slice(0,400));
    return response.json();
  }
  function options(element,items,label) {
    const previous=element.value, signature=JSON.stringify(items);
    if(element.dataset.signature===signature) return;
    element.dataset.signature=signature; element.replaceChildren();
    for(const item of items) {const option=document.createElement('option');option.value=item.id;option.textContent=label(item);element.append(option);}
    if(items.some(x=>x.id===previous)) element.value=previous;
    else if(items.some(x=>x.active)) element.value=items.find(x=>x.active).id;
  }
  async function refresh() {
    if(polling||stopped) return;
    polling=true;
    try {
      data=await api('models');
      options($('modelSelect'),data.models,x=>`${x.active?'Current · ':''}${modelLabel(x)} · ${(x.bytes/1048576).toFixed(1)} MiB`);
      if(selectedResult && !data.models.some(x=>x.id===selectedResult)) selectedResult=null;
      deleteState();
      options($('trainingProfile'),data.profiles,x=>`${english.text(x.label, x.id)} · ${x.iterations} iterations`);
      const running=data.job?.state==='running';
      $('loadModel').disabled=working||data.loading||!data.models.length;
      $('startTraining').disabled=working||running||data.loading||!data.profiles.length;
      $('importModel').disabled=working||running||data.loading||!$('modelFile').files.length;
      if(!working) {
        if(data.loading) progress('Validate the model and load it onto GPU…',null);
        else if(awaitingLoad) {
          awaitingLoad=false;
          if(data.load_error) {progress('Load failed; the original model is retained:'+data.load_error,0);window.FVV.connect();}
          else {progress('Model ready for free navigation.',100);window.FVV.connect();}
        } else if(running) progress(`${english.text(data.job.stage, 'Training')} · ${data.job.iteration}/${data.job.iterations} iterations · ${data.job.progress.toFixed(1)}%`,data.job.iteration?data.job.progress:null);
        else if(data.job?.state==='failed') progress('Training failed; the original model is retained:'+data.job.error,0);
        else if(data.job?.state==='complete') {selectedResult=data.job.id;progress(`Training complete (${data.job.iterations} iterations). You can load the new model; the current model is unchanged.`,100);}
        else $('modelTask').textContent=notice || (data.models.length?'Choose an existing model to browse, train independently, or import a model package.':'This scene has no model yet. Train or import one first.');
      }
      $('loadTrained').hidden=!selectedResult;
      $('loadTrained').disabled=working||data.loading;
    } catch(error) {if(!working) $('modelTask').textContent='Model management service unavailable: '+english.text(error.message, 'Check the server and SSH tunnel.');}
    finally {polling=false;if(!stopped) timer=setTimeout(refresh,1500);}
  }
  async function load(id) {
    if(working||!id) return;
    working=true;window.FVV.disconnect();progress('Preparing to load model…',null);
    try {await api('models/load',{id});awaitingLoad=true;}
    catch(error) {progress('Load failed:'+error.message,0);window.FVV.connect();}
    finally {working=false;}
  }
  $('loadModel').onclick=()=>load($('modelSelect').value);
  $('modelSelect').onchange=deleteState;
  $('deleteModel').onclick=async()=>{
    const selected=data?.models.find(x=>x.id===$('modelSelect').value);
    if(working||data.loading||selected?.active||!selected) return;
    if(!window.confirm(`Delete ${modelLabel(selected)}？Model files will be permanently removed.`)) return;
    working=true;deleteState();
    try {await api('models/delete',{id:selected.id,sha256:selected.sha256});
      if(selectedResult===selected.id) selectedResult=null;
      progress('Model deleted and storage released.',100);
    } catch(error) {progress('Deletion failed:'+error.message,0);}
    finally {working=false;clearTimeout(timer);await refresh();}
  };
  $('loadTrained').onclick=()=>load(selectedResult);
  $('startTraining').onclick=async()=>{
    if(working) return; working=true;$('startTraining').disabled=true;selectedResult=null;
    try {await api('training',{profile:$('trainingProfile').value});progress('Training submitted. Preparing source data…',null);}
    catch(error) {progress('Cannot start training:'+error.message,0);}
    finally {working=false;}
  };
  $('modelFile').onchange=()=>{$('importModel').disabled=working||!$('modelFile').files.length;};
  $('importModel').onclick=()=>{
    const file=$('modelFile').files[0];if(!file||working) return;
    if(file.size>512*1048576) {progress('Model package must not exceed 512 MiB. ',0);return;}
    working=true;$('importModel').disabled=true;progress('Uploading model package…',0);
    upload=new XMLHttpRequest();upload.open('POST','/fvv/api/models/import'+query);upload.timeout=900000;
    upload.setRequestHeader('Content-Type','application/zip');
    upload.upload.onprogress=e=>{if(e.lengthComputable) progress(`Upload Model Package ${Math.round(100*e.loaded/e.total)}%`,100*e.loaded/e.total);};
    upload.upload.onload=()=>progress('Upload complete. Validating files and scene…',null);
    upload.onload=async()=>{
      working=false;
      if(upload.status<200||upload.status>=300) {progress('Import failed:'+upload.responseText.slice(0,400),0);return;}
      try {const result=JSON.parse(upload.responseText);await load(result.id);}
      catch(error) {progress('Import failed:'+error.message,0);}
    };
    upload.onerror=upload.ontimeout=()=>{working=false;progress('Upload interrupted. Check the SSH tunnel and retry.',0);};
    upload.send(file);
  };
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);if(upload&&upload.readyState!==4)upload.abort();});
  refresh();
})();
