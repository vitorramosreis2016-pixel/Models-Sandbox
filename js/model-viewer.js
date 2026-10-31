/* MODELS-SANDBOX — consulta pontual de previsões NWP reais */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const MODELS = {
    gfs_global:{name:"GFS Global",coverage:"Global"},
    ecmwf_ifs025:{name:"ECMWF IFS",coverage:"Global"},
    icon_global:{name:"ICON Global",coverage:"Global"},
    ukmo_global_deterministic_10km:{name:"UK Met Office Global",coverage:"Global"},
    gfs_hrrr:{name:"HRRR",coverage:"Estados Unidos contíguos (CONUS)"}
  };
  const FIELDS = {
    pressure_msl:{unit:"hPa",label:"Pressão ao nível do mar",decimals:1},
    precipitation:{unit:"mm",label:"Precipitação horária",decimals:1},
    temperature_2m:{unit:"°C",label:"Temperatura a 2 m",decimals:1},
    dew_point_2m:{unit:"°C",label:"Ponto de orvalho a 2 m",decimals:1},
    cape:{unit:"J/kg",label:"CAPE",decimals:0},
    convective_inhibition:{unit:"J/kg",label:"CIN",decimals:0},
    wind_speed_10m:{unit:"kt",label:"Vento a 10 m",decimals:1},
    wind_direction_10m:{unit:"°",label:"Direção do vento a 10 m",decimals:0},
    cloud_cover:{unit:"%",label:"Nebulosidade",decimals:0}
  };
  let map=null, marker=null, selected=null;
  function status(message){if($("nwp-status")) $("nwp-status").textContent=message;}
  function init(){
    const el=$("nwp-map");
    if(!el||map||typeof L==="undefined") return;
    map=L.map(el,{center:[38.5,-97.5],zoom:4,minZoom:2,worldCopyJump:true});
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"&copy; OpenStreetMap"}).addTo(map);
    map.on("click",e=>{selected={lat:e.latlng.lat,lon:e.latlng.lng};placeMarker();query();});
    setTimeout(()=>map.invalidateSize(),100);
  }
  function placeMarker(){
    if(!map||!selected)return;
    if(marker)map.removeLayer(marker);
    marker=L.marker([selected.lat,selected.lon]).addTo(map)
      .bindPopup("Ponto selecionado<br>"+selected.lat.toFixed(3)+", "+selected.lon.toFixed(3)).openPopup();
  }
  function render(data,model,field,lead){
    const times=data.hourly?.time||[], values=data.hourly?.[field]||[];
    const target=Date.now()+Number(lead)*3600000;
    let i=0,best=Infinity;
    times.forEach((t,n)=>{const d=Math.abs(new Date(t+"Z").getTime()-target);if(d<best){best=d;i=n;}});
    const value=values[i],meta=$("nwp-meta");
    if(value===null||value===undefined){
      $("nwp-value").textContent="Sem dado";
      meta.textContent="O modelo não disponibilizou esse campo para este ponto/horário.";
      return;
    }
    const f=FIELDS[field];
    $("nwp-value").textContent=Number(value).toFixed(f.decimals)+" "+f.unit;
    meta.innerHTML="<div><b>"+f.label+"</b></div><div>Modelo: "+model.name+"</div><div>Validade: "+times[i]+" UTC</div><div>Coordenadas: "+selected.lat.toFixed(3)+", "+selected.lon.toFixed(3)+"</div><div>Elevação: "+(data.elevation??"—")+" m</div><div>Fonte: Open-Meteo · "+model.name+"</div>";
  }
  async function query(){
    if(!selected){status("Clique no mapa para selecionar um ponto.");return;}
    const modelId=$("nwp-model").value,model=MODELS[modelId];
    const field=$("nwp-field").value,lead=$("nwp-lead").value,button=$("nwp-query");
    button.disabled=true;
    status("Consultando "+model.name+" para "+selected.lat.toFixed(2)+", "+selected.lon.toFixed(2)+"…");
    try{
      const params=new URLSearchParams({
        latitude:selected.lat.toFixed(4),longitude:selected.lon.toFixed(4),
        hourly:Object.keys(FIELDS).join(","),models:modelId,forecast_days:"7",
        timezone:"UTC",wind_speed_unit:"kn"
      });
      const response=await fetch("https://api.open-meteo.com/v1/forecast?"+params.toString());
      const data=await response.json();
      if(!response.ok)throw new Error(data.reason||data.error||("HTTP "+response.status));
      render(data,model,field,lead);
      status("Consulta concluída · "+model.name+" · cobertura declarada: "+model.coverage+".");
    }catch(error){
      console.error("[NWP]",error);
      status("Não foi possível consultar "+model.name+": "+error.message+". Verifique a cobertura do modelo para esse ponto.");
      $("nwp-value").textContent="—";$("nwp-meta").textContent="Sem resultado.";
    }finally{button.disabled=false;}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    init();
    $("nwp-query")?.addEventListener("click",query);
    ["nwp-model","nwp-field","nwp-lead"].forEach(id=>
      $(id)?.addEventListener("change",()=>{if(selected)query();})
    );
    document.querySelectorAll('.tab-btn[onclick*="models-tab"]').forEach(b=>
      b.addEventListener("click",()=>setTimeout(()=>map?.invalidateSize(),80))
    );
  });
})();
