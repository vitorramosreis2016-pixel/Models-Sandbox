// CONTROLADOR PRINCIPAL - CONEXÃO INTERFACE E MOTOR MATEMÁTICO

// 1. Mapeamento dos elementos de entrada (Sliders)
const sliderTemp = document.getElementById('temp');
const sliderDwpt = document.getElementById('dwpt');
const sliderWind = document.getElementById('wind');
const sliderLapse = document.getElementById('lapse');
const sliderSrw = document.getElementById('srw');

// 2. Mapeamento dos elementos de saída de texto (Valores ao lado dos Sliders)
const textTemp = document.getElementById('val-temp');
const textDwpt = document.getElementById('val-dwpt');
const textWind = document.getElementById('val-wind');
const textLapse = document.getElementById('val-lapse');
const textSrw = document.getElementById('val-srw');

// 3. Mapeamento dos elementos de saída dos Índices Computados
const resultLcl = document.getElementById('lcl-result');
const resultCape = document.getElementById('cape-result');
const resultCin = document.getElementById('cin-result');

/**
 * Função responsável por ler os sliders, rodar os cálculos e atualizar a tela
 */
function processarMesoanalise() {
    // Captura e converte os valores atuais dos controles flutuantes
    const t = parseFloat(sliderTemp.value);
    const td = parseFloat(sliderDwpt.value);
    const wind = parseInt(sliderWind.value);
    const lapse = parseFloat(sliderLapse.value);
    const srw = parseInt(sliderSrw.value);

    // Regra de segurança: O Dewpoint não pode ser maior que a temperatura real
    if (td > t) {
        // Força o slider do Dewpoint a acompanhar o limite máximo da temperatura ambiente
        sliderDwpt.value = t;
        textDwpt.innerText = t;
    } else {
        textDwpt.innerText = td;
    }

    // Atualiza os pequenos textos indicadores ao lado de cada slider
    textTemp.innerText = t;
    textWind.innerText = wind;
    textLapse.innerText = lapse;
    textSrw.innerText = srw;

    // Executa as fórmulas meteorológicas importadas do arquivo math.js
    const lcl = calcularLCL(t, parseFloat(sliderDwpt.value));
    const cape = estimarCAPE(t, parseFloat(sliderDwpt.value), lapse);
    const cin = estimarCIN(t, parseFloat(sliderDwpt.value));

    // cospe os resultados finais calculados dentro do painel de diagnóstico
    resultLcl.innerText = lcl;
    resultCape.innerText = cape;
    resultCin.innerText = cin;

    // [ESPAÇO RESERVADO] Futuramente, chamaremos a função de redesenhar o Skew-T aqui:
    // atualizarGraficoSkewT(t, parseFloat(sliderDwpt.value), lapse, wind, srw);
}

// 4. Adiciona ouvintes de eventos para recalcular tudo instantaneamente ao mover os controles
sliderTemp.addEventListener('input', processarMesoanalise);
sliderDwpt.addEventListener('input', processarMesoanalise);
sliderWind.addEventListener('input', processarMesoanalise);
sliderLapse.addEventListener('input', processarMesoanalise);
sliderSrw.addEventListener('input', processarMesoanalise);

// 5. Roda a função uma vez ao carregar a página para preencher os dados iniciais padrão
window.addEventListener('DOMContentLoaded', () => {
    processarMesoanalise();
});
