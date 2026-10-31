/* MODELS-SANDBOX — grade espacial de previsão por modelo */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const MODELS={
    gfs_global:{name:"GFS Global",coverage:"Global"},
    ecmwf_ifs025:{name:"ECMWF IFS",coverage:"Global"},
    icon_global:{name:"ICON Global",coverage:"Global"},
    ukmo_global_deterministic_10km:{name:"UK Met Office Global",coverage:"Global"},
    gfs_hrrr:{name:"HRRR",coverage:"CONUS"}
  };
  const FIELDS={
    pressure_msl:{unit:"hPa",label:"Pressão ao nível do mar",min:970,max:1040,colors:["#542788","#8073ac","#b2abd2","#d8daeb","#f7f7f7","#fddbc7","#ef8a62","#b2182b"]},
    precipitation:{unit:"mm",label:"Precipitação horária",min:0,max:30,colors:["#f7fbff","#c6dbef","#6baed6","#2171b5","#41ab5d","#a1d99b","#fdae6b","#e6550d"]},
    temperature_2m:{unit:"°C",label:"Temperatura a 2 m",min:-10,max:40,colors:["#313695","#4575b4","#74add1","#abd9e9","#ffffbf","#fdae61","#f46d43","#a50026"]},
    dew_point_2m:{unit:"°C",label:"Ponto de orvalho a 2 m",min:-10,max:30,colors:["#313695","#4575b4","#74add1","#abd9e9","#ffffbf","#fdae61","#f46d43","#a50026"]},
    cape:{unit:"J/kg",label:"CAPE",min:0,max:4000,colors:["#f7fbff","#c6dbef","#6baed6","#2171b5","#41ab5d","#a1d99b","#fdae6b","#e6550d"]},
    convective_inhibition:{unit:"J/kg",label:"CIN",min:-300,max:0,colors:["#313695","#4575b4","#74add1","#abd9e9","#ffffbf","#fdae61","#f46d43","#a50026"]},
    wind_speed_10m:{unit:"kt",label:"Vento a 10 m",min:0,max:60,colors:["#f7fbff","#c6dbef","#6baed6","#2171b5","#41ab5d","#a1d99b","#fdae6b","#e6550d"]},
    cloud_cover:{unit:"%",label:"Nebulosidade",min:0,max:100,colors:["#ffffff","#d9d9d9","#bdbdbd","#969696","#737373","#525252","#252525","#000000"]}
  };
  let map,layer=L.layerGroup(),selected=null,requestToken=0;
  function status(s){$("nwp-status").textContent=s;}
  function colorFor(v,f){if(v===null||!Number.isFinite(Number(v)))return null;const p=Math.max(0,Math.min(1,(Number(v)-f.min)/(f.max-f.min)));return f.colors[Math.min(f.colors.length-1,Math.floor(p*f.colors.length))];}
  function init(){
    if(! $("nwp-map")||typeof L==="undefined")return;
    map=L.map("nwp-map",{center:[-15,-48],zoom:4,minZoom:2,worldCopyJump:true});
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"&copy; OpenStreetMap"}).addTo(map);
    layer.addTo(map);
    map.on("click",e=>{selected=e.latlng;showPoint(e.latlng);});
    setTimeout(()=>map.invalidateSize(),120);
  }
  function showPoint(p){
    const model=MODELS[$("nwp-model").value],field=$("nwp-field").value;
    $("nwp-value").textContent=p.lat.toFixed(2)+"°, "+p.lng.toFixed(2)+"°";
    $("nwp-meta").textContent="Ponto selecionado. A grade mostra os valores do modelo nas células próximas; consulte novamente para atualizar a região.";
  }
  function addLegend(f){
    const old=$("nwp-legend");if(old)old.remove();
    const el=document.createElement("div");el.id="nwp-legend";el.className="nwp-legend";
    el.innerHTML="<b>"+f.label+" ("+f.unit+")</b><div class='nwp-legend-scale'>"+f.colors.map(c=>"<i style='background:"+c+"'></i>").join("")+"</div><div class='nwp-legend-labels'><span>"+f.min+"</span><span>"+f.max+"</span></div>";
    $("nwp-readout").appendChild(el);
  }
  async function query(){
    if(!map)return;
    const token=++requestToken,modelId=$("nwp-model").value,model=MODELS[modelId],field=$("nwp-field").value,lead=Number($("nwp-lead").value),f=FIELDS[field];
    const b=map.getBounds(),south=b.getSouth(),north=b.getNorth(),west=b.getWest(),east=b.getEast();
    const n=8,coords=[];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)coords.push({lat:south+(y+.5)*(north-south)/n,lon:west+(x+.5)*(east-west)/n});
    const btn=$("nwp-query");btn.disabled=true;status("Baixando grade de "+model.name+" ("+coords.length+" células)…");
    try{
      const params=new URLSearchParams({latitude:coords.map(p=>p.lat.toFixed(3)).join(","),longitude:coords.map(p=>p.lon.toFixed(3)).join(","),hourly:field,models:modelId,forecast_days:"7",timezone:"UTC"});
      const response=await fetch("https://api.open-meteo.com/v1/forecast?"+params);
      const payload=await response.json();if(!response.ok)throw new Error(payload.reason||payload.error||"HTTP "+response.status);
      const results=Array.isArray(payload)?payload:[payload];
      if(results.length!==coords.length)throw new Error("A API não retornou todos os pontos da grade.");
      const times=results[0].hourly?.time||[];
      const now=Date.now()+lead*3600000;let ti=0,delta=Infinity;
      times.forEach((t,i)=>{const d=Math.abs(new Date(t+"Z").getTime()-now);if(d<delta){delta=d;ti=i;}});
      if(token!==requestToken)return;
      layer.clearLayers();
      const dLat=(north-south)/n,dLon=(east-west)/n;
      results.forEach((r,i)=>{
        const value=r.hourly?.[field]?.[ti],p=coords[i],color=colorFor(value,f);if(!color)return;
        L.rectangle([[p.lat-dLat/2,p.lon-dLon/2],[p.lat+dLat/2,p.lon+dLon/2]],{stroke:false,fillColor:color,fillOpacity:.78,interactive:true})
          .bindPopup(model.name+"<br>"+f.label+": "+Number(value).toFixed(1)+" "+f.unit+"<br>"+(times[ti]||"")+" UTC")
          .addTo(layer);
      });
      addLegend(f);
      status(model.name+" · grade de "+coords.length+" células · previsão aproximada F"+String(lead).padStart(3,"0")+".");
      $("nwp-value").textContent=results.length+" células";
      $("nwp-meta").textContent="Modelo: "+model.name+" | Cobertura declarada: "+model.coverage+" | Validade: "+(times[ti]||"—")+" UTC. Cada célula usa um valor retornado para aquele modelo; as cores apenas representam os valores.";
    }catch(e){if(token===requestToken)status("Falha ao obter a grade: "+e.message);}
    finally{if(token===requestToken)btn.disabled=false;}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    init();$("nwp-query")?.addEventListener("click",query);
    ["nwp-model","nwp-field","nwp-lead"].forEach(id=>$(id)?.addEventListener("change",()=>{if(map)query();}));
    document.querySelectorAll('.tab-btn[onclick*="models-tab"]').forEach(b=>b.addEventListener("click",()=>setTimeout(()=>map?.invalidateSize(),80)));
  });
})();