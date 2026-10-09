// GERADOR DO GRÁFICO CIENTÍFICO SKEW-T LOG-P DINÂMICO (ESTILO SHARPPY)

let skewtPlot = null;

// Níveis de pressão padrão para plotar o perfil vertical (hPa)
const niveisPressao =;

/**
 * Converte coordenadas normais de Temperatura e Pressão para o espaço "inclinado" (Skew) do gráfico.
 * No Skew-T, o eixo X é deslocado baseado no logaritmo da pressão para inclinar as isotermas em 45°.
 */
function transformarParaSkew(t, p) {
    const xInclinado = t + 30 * Math.log10(1000 / p);
    const yLogaritmico = p; // O eixo Y será configurado como logarítmico no Plotly
    return { x: xInclinado, y: yLogaritmico };
}

/**
 * Renderiza ou atualiza o gráfico Skew-T completo com dados dinâmicos baseados nos Sliders
 */
function atualizarGraficoSkewT() {
    const container = document.getElementById('skewt-chart');
    if (!container) return;

    // Pega as variáveis atuais em superfície
    const tSurf = parseFloat(document.getElementById('temp').value);
    const tdSurf = parseFloat(document.getElementById('dwpt').value);
    const lr = parseFloat(document.getElementById('lapse').value);

    // Arrays para guardar as coordenadas convertidas para o plano Skew
    let dadosTempX = [];
    let dadosTempY = [];
    let dadosDewpointX = [];
    let dadosDewpointY = [];
    let dadosParcelaX = [];
    let dadosParcelaY = [];

    const lclAltitude = calcularLCL(tSurf, tdSurf);

    // Converte a pressão logarítmica aproximando para altitude em metros para calcular o perfil
    niveisPressao.forEach(p => {
        // Aproximação de altitude baseada na pressão (Standard Atmosphere)
        const altMetros = 44330 * (1 - Math.pow(p / 1013.25, 0.190284));

        // 1. Linha do Ambiente: Temperatura cai conforme o Lapse Rate selecionado
        let tAmbiente = tSurf - (lr * (altMetros / 1000));
        let ptTemp = transformarParaSkew(tAmbiente, p);
        dadosTempX.push(ptTemp.x);
        dadosTempY.push(ptTemp.y);

        // 2. Linha do Ambiente: Dewpoint (Ar tende a secar em altos níveis no padrão convectivo)
        let tdAmbiente = tdSurf - ((lr * 1.2) * (altMetros / 1000));
        let ptDewpoint = transformarParaSkew(tdAmbiente, p);
        dadosDewpointX.push(ptDewpoint.x);
        dadosDewpointY.push(ptDewpoint.y);

        // 3. Linha da Parcela de Ar Ascendente (Seguindo a física termodinâmica)
        let tParcela;
        if (altMetros <= lclAltitude) {
            // Abaixo do LCL: Esfria pela Adiabática Seca (~9.8°C/km)
            tParcela = tSurf - (9.8 * (altMetros / 1000));
        } else {
            // Acima do LCL: Condensa e passa a esfriar pela Adiabática Úmida (~6.0°C/km devido ao calor latente)
            const metrosAcimaLCL = altMetros - lclAltitude;
            const tNoLCL = tSurf - (9.8 * (lclAltitude / 1000));
            tParcela = tNoLCL - (6.0 * (metrosAcimaLCL / 1000));
        }
        let ptParcela = transformarParaSkew(tParcela, p);
        dadosParcelaX.push(ptParcela.x);
        dadosParcelaY.push(ptParcela.y);
    });

    // Definição das Linhas de Dados do Gráfico
    const traceTemp = {
        x: dadosTempX, y: dadosTempY,
        name: 'Temperatura do Ambiente', type: 'scatter', mode: 'lines',
        line: { color: '#ff4a4a', width: 3 } // Linha Vermelha clássica de sondagem
    };

    const traceDewpoint = {
        x: dadosDewpointX, y: dadosDewpointY,
        name: 'Ponto de Orvalho (Dewpoint)', type: 'scatter', mode: 'lines',
        line: { color: '#4ade80', width: 3 } // Linha Verde clássica
    };

    const traceParcela = {
        x: dadosParcelaX, y: dadosParcelaY,
        name: 'Trajetória da Parcela de Ar', type: 'scatter', mode: 'lines',
        line: { color: '#ffffff', width: 2, dash: 'dash' } // Tracejado Branco da parcela
    };

    const data = [traceTemp, traceDewpoint, traceParcela];

    // Layout Científico Meteorológico do Gráfico
    const layout = {
        backgroundColor: '#121218',
        paper_bgcolor: '#121218',
        plot_bgcolor: '#121218',
        margin: { l: 60, r: 40, t: 30, b: 50 },
        showlegend: true,
        legend: { font: { color: '#cbd5e1' }, orientation: 'h', y: -0.15 },
        xaxis: {
            title: 'Temperatura Inclinada (Eixo Skewed)',
            titlefont: { color: '#94a3b8', size: 12 },
            tickfont: { color: '#64748b' },
            gridcolor: '#2d2d3d',
            zeroline: false
        },
        yaxis: {
            title: 'Pressão Atmosférica (hPa / Escala Log)',
            titlefont: { color: '#94a3b8', size: 12 },
            tickfont: { color: '#64748b' },
            type: 'log',
            autorange: 'reverse', // Pressão maior (1000hPa - superfície) fica embaixo
            range: [Math.log10(100), Math.log10(1000)],
            gridcolor: '#2d2d3d',
            dtick: Math.log10(2) // Ajuste fino da grade logarítmica
        }
    };

    // Renderiza o gráfico usando o Plotly
    if (!skewtPlot) {
        Plotly.newPlot('skewt-chart', data, layout, { displayModeBar: false });
        skewtPlot = true;
    } else {
        Plotly.react('skewt-chart', data, layout, { displayModeBar: false });
    }
}

// Vincula a renderização do Skew-T à inicialização das abas
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(atualizarGraficoSkewT, 300);

    // Garante que o gráfico recalcula o tamanho se o usuário clicar na aba dele
    document.querySelector('[onclick*="skewt-tab"]').addEventListener('click', () => {
        setTimeout(atualizarGraficoSkewT, 100);
    });
});

// Acopla a atualização do gráfico ao Maestro Principal (js/main.js)
if (typeof processarMesoanalise === 'function') {
    const funcaoMesoOriginal = processarMesoanalise;
    processarMesoanalise = function() {
        funcaoMesoOriginal();
        atualizarGraficoSkewT();
    };
}
