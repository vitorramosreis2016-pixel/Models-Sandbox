// MOTOR GRÁFICO E TERMOCINÂMICO AVANÇADO - ESTILO SHARPPY PRO

let skewtPlot = null;
const niveisPressao =;

function transformarParaSkew(t, p) {
    // Inclina o eixo X em 45 graus usando o logaritmo da pressão
    return { x: t + 30 * Math.log10(1000 / p), y: p };
}

function atualizarGraficoSkewT() {
    const container = document.getElementById('skewt-chart');
    if (!container) return;

    const tSurf = parseFloat(document.getElementById('temp').value);
    const tdSurf = parseFloat(document.getElementById('dwpt').value);
    const lr = parseFloat(document.getElementById('lapse').value);
    const windSurf = parseInt(document.getElementById('wind').value);
    const srw = parseInt(document.getElementById('srw').value);

    let dadosTempX = [], dadosTempY = [];
    let dadosDewpointX = [], dadosDewpointY = [];
    let dadosParcelaX = [], dadosParcelaY = [];

    const lclAltitude = calcularLCL(tSurf, tdSurf);
    const cape = estimarCAPE(tSurf, tdSurf, lr);

    // 1. Simulação do perfil de vento em altitude (Cisalhamento Vertical Real)
    // À medida que a altitude aumenta (pressão diminui), o vento ganha velocidade baseado no SRW
    const ventosPerfil = {
        1000: windSurf,
        850: Math.round(windSurf + srw * 0.3),
        700: Math.round(windSurf + srw * 0.5),
        500: Math.round(windSurf + srw * 0.8),
        300: Math.round(windSurf + srw * 1.2),
        100: Math.round(windSurf + srw * 1.4)
    };

    // Atualiza a tabela do SHARPpy com o perfil de ventos
    if(document.getElementById('v-850')) {
        document.getElementById('v-850').innerText = `${ventosPerfil[850]} kt`;
        document.getElementById('v-700').innerText = `${ventosPerfil[700]} kt`;
        document.getElementById('v-500').innerText = `${ventosPerfil[500]} kt`;
        document.getElementById('v-300').innerText = `${ventosPerfil[300]} kt (Jato)`;
        document.getElementById('v-100').innerText = `${ventosPerfil[100]} kt`;
    }

    // 2. Cálculos dos Índices Avançados do SHARPpy (STP, SCP, EHI)
    // Helicidade relativa simulada (SRH) baseada na força do SRW e do vento em superfície
    const srh03km = (windSurf * 2) + (srw * 3); 
    
    // EHI (Energy Helicity Index): Relação direta entre CAPE e Cisalhamento
    const ehi = (cape * srh03km) / 160000;

    // SCP (Supercell Composite Parameter)
    const scp = (cape > 0) ? (cape / 1000) * (srh03km / 100) * (srw / 40) : 0;

    // STP (Significant Tornado Parameter) - Fórmula cinemática usada no SPC
    let stp = 0;
    if (cape > 0 && lclAltitude < 2000) {
        const termoCape = cape / 1500;
        const termoLcl = (2000 - lclAltitude) / 1000;
        const termoCisalhamento = srh03km / 150;
        stp = termoCape * termoLcl * termoCisalhamento;
    }

    // Atualiza o painel do SHARPpy com os índices calculados
    if(document.getElementById('idx-stp')) {
        document.getElementById('idx-stp').innerText = Math.max(0, stp).toFixed(1);
        document.getElementById('idx-scp').innerText = Math.max(0, scp).toFixed(1);
        document.getElementById('idx-ehi').innerText = Math.max(0, ehi).toFixed(1);
        
        // Alerta visual de cores se o parâmetro de tornado explodir (Estilo Surtos de Tornado do SPC)
        document.getElementById('idx-stp').style.color = stp > 5 ? '#ff00ff' : (stp > 2 ? '#ca5858' : '#cbd5e1');
    }

    // 3. Construção das curvas termodinâmicas do gráfico
    niveisPressao.forEach(p => {
        const altMetros = 44330 * (1 - Math.pow(p / 1013.25, 0.190284));

        let tAmbiente = tSurf - (lr * (altMetros / 1000));
        let ptTemp = transformarParaSkew(tAmbiente, p);
        dadosTempX.push(ptTemp.x);
        dadosTempY.push(ptTemp.y);

        let tdAmbiente = tdSurf - ((lr * 1.1) * (altMetros / 1000)) - (altMetros > 3000 ? 15 : 0);
        let ptDewpoint = transformarParaSkew(tdAmbiente, p);
        dadosDewpointX.push(ptDewpoint.x);
        dadosDewpointY.push(ptDewpoint.y);

        let tParcela;
        if (altMetros <= lclAltitude) {
            tParcela = tSurf - (9.8 * (altMetros / 1000));
        } else {
            const metrosAcimaLCL = altMetros - lclAltitude;
            const tNoLCL = tSurf - (9.8 * (lclAltitude / 1000));
            tParcela = tNoLCL - (5.8 * (metrosAcimaLCL / 1000));
        }
        let ptParcela = transformarParaSkew(tParcela, p);
        dadosParcelaX.push(ptParcela.x);
        dadosParcelaY.push(ptParcela.y);
    });

    const data = [
        { x: dadosTempX, y: dadosTempY, name: 'TEMP ambiente', type: 'scatter', mode: 'lines', line: { color: '#ff4a4a', width: 3 } },
        { x: dadosDewpointX, y: dadosDewpointY, name: 'DEWPOINT ambiente', type: 'scatter', mode: 'lines', line: { color: '#4ade80', width: 3 } },
        { x: dadosParcelaX, y: dadosParcelaY, name: 'PARCELA de ar ascendente', type: 'scatter', mode: 'lines', line: { color: '#ffffff', width: 2, dash: 'dash' } }
    ];

    const layout = {
        backgroundColor: '#121218', paper_bgcolor: '#121218', plot_bgcolor: '#121218',
        margin: { l: 50, r: 20, t: 20, b: 40 }, showlegend: true,
        legend: { font: { color: '#cbd5e1', size: 10 }, orientation: 'h', y: -0.1 },
        xaxis: { title: 'Isotermas Inclinadas (Estilo SHARPpy)', titlefont: { color: '#64748b', size: 11 }, tickfont: { color: '#475569' }, gridcolor: '#222230', zeroline: false },
        yaxis: { title: 'Pressão (hPa)', titlefont: { color: '#64748b', size: 11 }, tickfont: { color: '#475569' }, type: 'log', autorange: 'reverse', range: [Math.log10(100), Math.log10(1000)], gridcolor: '#222230', dtick: Math.log10(2) }
    };

    if (!skewtPlot) {
        Plotly.newPlot('skewt-chart', data, layout, { displayModeBar: false });
        skewtPlot = true;
    } else {
        Plotly.react('skewt-chart', data, layout, { displayModeBar: false });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(atualizarGraficoSkewT, 300);
    document.querySelector('[onclick*="skewt-tab"]').addEventListener('click', () => {
        setTimeout(atualizarGraficoSkewT, 100);
    });
});

if (typeof processarMesoanalise === 'function') {
    const funcaoMesoOriginal = processarMesoanalise;
    processarMesoanalise = function() {
        funcaoMesoOriginal();
        atualizarGraficoSkewT();
    };
}
