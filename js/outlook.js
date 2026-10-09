// CONTROLADOR DOS OUTLOOKS, MODELOS E INTEGRAÇÃO COM MAPA-MÚNDI (LEAFLET)

let mapaOutlook;
let camadaDesenhoManual;
let camadaModelosAuto;

// Definição de cores e estilos para os padrões do SPC (Storm Prediction Center)
const estilosRisco = {
    "TSTM": { cor: "#c2e2be", opacidade: 0.2, texto: "Tempestade Comum (General Thunderstorms)" },
    "MRGL": { cor: "#61b36b", opacidade: 0.35, texto: "Risco Marginal (Marginal Risk)" },
    "SLGT": { cor: "#f7e379", opacidade: 0.5, texto: "Risco Leve (Slight Risk)" },
    "ENH":  { cor: "#e69d5e", opacidade: 0.6, texto: "Risco Acentuado (Enhanced Risk)" },
    "MDT":  { cor: "#ca5858", opacidade: 0.7, texto: "Risco Moderado (Moderate Risk)" },
    "HIGH": { cor: "#ff00ff", opacidade: 0.75, texto: "Risco Alto (High Risk - Outbreak Violento)" }
};

// 1. Inicialização do Mapa-múndi assim que a página estiver pronta
window.addEventListener('DOMContentLoaded', () => {
    // Inicializa o mapa centralizado nos EUA/Atlântico (ótimo corredor de tempestades)
    mapaOutlook = L.map('convective-map').setView([38.0, -95.0], 4);

    // Carrega a textura visual do mapa-múndi (Estilo Dark / CartoDB Voyager Dark)
    L.tileLayer('https://{s}://{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(mapaOutlook);

    // Inicializa as camadas onde os desenhos vão morar
    camadaDesenhoManual = L.featureGroup().addTo(mapaOutlook);
    camadaModelosAuto = L.layerGroup().addTo(mapaOutlook);

    // Ativa os cliques no mapa para o modo manual
    configurarCliquesMapa();

    // Corrige bugs visuais de renderização do Leaflet em elementos ocultos (abas)
    document.querySelector('[onclick*="convective-tab"]').addEventListener('click', () => {
        setTimeout(() => { mapaOutlook.invalidateSize(); }, 200);
    });
});

// 2. Lógica de Alternância: Modo Manual vs Modo Automático (Modelos)
function alternarModoOutlook() {
    const modo = document.getElementById('outlook-mode').value;
    const painelFerramentasManuais = document.getElementById('manual-tools');

    // Limpa os desenhos anteriores ao trocar de modo
    camadaDesenhoManual.clearLayers();
    camadaModelosAuto.clearLayers();

    if (modo === "manual") {
        painelFerramentasManuais.style.display = "block";
        alert("Modo Manual Ativo: Clique em qualquer ponto do mapa do mundo para gerar círculos de risco meteorológico de forma livre!");
    } else {
        painelFerramentasManuais.style.display = "none";
        alert("Modo Automático Ativo: O mapa agora responderá aos parâmetros do modelo numérico e dos sliders!");
        gerarOutlookAutomatico();
    }
}

// 3. MODO MANUAL: Permite o jogador "desenhar" riscos clicando no mapa do mundo
function configurarCliquesMapa() {
    mapaOutlook.on('click', (e) => {
        const modo = document.getElementById('outlook-mode').value;
        if (modo !== "manual") return;

        const nivelRisco = document.getElementById('risk-level-select').value;
        const config = estilosRisco[nivelRisco];

        // Cria uma área circular simulada de impacto no mapa baseado no clique do mouse
        const circuloRisco = L.circle(e.latlng, {
            color: config.cor,
            fillColor: config.cor,
            fillOpacity: config.opacidade,
            radius: 250000 // Raio padrão de 250km de abrangência por clique
        });

        // Adiciona um balão descritivo ao polígono desenhado
        circuloRisco.bindPopup(`<b>${nivelRisco}</b> - ${config.texto}`);
        camadaDesenhoManual.addLayer(circuloRisco);
    });
}

// 4. MODO AUTOMÁTICO: Processa os Sliders + o viés do Modelo Numérico selecionado
function gerarOutlookAutomatico() {
    const modo = document.getElementById('outlook-mode').value;
    if (modo !== "auto") return;

    // Limpa a tela antes de desenhar a nova projeção matemática
    camadaModelosAuto.clearLayers();

    // Puxa as variáveis físicas atuais calculadas do nosso motor matemático
    const t = parseFloat(document.getElementById('temp').value);
    const td = parseFloat(document.getElementById('dwpt').value);
    const lapse = parseFloat(document.getElementById('lapse').value);
    const srw = parseInt(document.getElementById('srw').value);
    
    // Roda a fórmula calibrada do math.js para pegar o CAPE exato
    const cape = estimarCAPE(t, td, lapse);

    // Captura qual modelo numérico o jogador selecionou para rodar a projeção
    const modeloSelecionado = document.getElementById('model-select').value;

    // Aplica o "viés ou personalidade física" do modelo escolhido
    // Modelos de mesoescala (HRRR/WRF) capturam melhor eventos severos localizados, globais tendem a espalhar mais
    let modificadorVento = srw;
    if (modeloSelecionado === "HRRR" || modeloSelecionado === "WRF") modificadorVento *= 1.2; 
    if (modeloSelecionado === "GFS") modificadorVento *= 0.9;

    // Decisão algorítmica para classificar o nível do Risco Convectivo baseado no ambiente
    let riscoFinal = "TSTM";
    if (cape > 500 && modificadorVento > 25) riscoFinal = "MRGL";
    if (cape > 1200 && modificadorVento > 35) riscoFinal = "SLGT";
    if (cape > 2000 && modificadorVento > 45) riscoFinal = "ENH";
    if (cape > 3000 && modificadorVento > 55 && lapse > 7.0) riscoFinal = "MDT";
    if (cape > 4000 && modificadorVento > 65 && lapse > 7.5) riscoFinal = "HIGH";

    const config = estilosRisco[riscoFinal];

    // Desenha as plumas de previsão automatizadas em regiões estratégicas de teste (Centro dos EUA)
    const coordenadasTesteEUA = [37.5, -96.0];
    
    const poligonoPrevisaoAuto = L.circle(coordenadasTesteEUA, {
        color: config.cor,
        fillColor: config.cor,
        fillOpacity: config.opacidade,
        radius: 400000 + (modificadorVento * 3000) // O raio cresce de acordo com os ventos do modelo
    });

    poligonoPrevisaoAuto.bindPopup(`
        <b>Previsão Automatizada - SPC Style</b><br>
        <b>Modelo Emissor:</b> ${modeloSelecionado}<br>
        <b>Risco Computado:</b> ${riscoFinal} (${config.texto})<br>
        <hr style='border: 1px dashed #444;'>
        <b>Condições Analisadas:</b><br>
        - CAPE Atmosférico: ${cape} J/kg<br>
        - Cisalhamento SRW Ajustado: ${Math.round(modificadorVento)} kt
    `);

    camadaModelosAuto.addLayer(poligonoPrevisaoAuto);
}

// Vincula a atualização automática do mapa aos movimentos dos Sliders na tela principal
// Procura pela função original no js/main.js e acopla a atualização automática de mapas
if (typeof processarMesoanalise === 'function') {
    const funcaoOriginal = processarMesoanalise;
    processarMesoanalise = function() {
        funcaoOriginal();
        gerarOutlookAutomatico();
    };
}
