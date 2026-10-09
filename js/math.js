// MOTOR MATEMÁTICO - SIMULADOR DE MESOANÁLISE

/**
 * Calcula a altitude aproximada do LCL (Nível de Condensação por Levantamento)
 * @param {number} t - Temperatura em superfície (°C)
 * @param {number} td - Dewpoint em superfície (°C)
 * @returns {number} Altitude do LCL em metros
 */
function calcularLCL(t, td) {
    if (t <= td) return 0;
    // Fórmula empírica de Espy: a diferença diminui ~8°C a cada 1000 metros (1000 / 8 = 125)
    return Math.round(125 * (t - td));
}

/**
 * Estima o CAPE (Convective Available Potential Energy) de forma paramétrica para o simulador
 * @param {number} t - Temperatura (°C)
 * @param {number} td - Dewpoint (°C)
 * @param {number} lapseRate - Gradiente térmico vertical (°C/km)
 * @returns {number} Energia disponível em J/kg
 */
function estimarCAPE(t, td, lapseRate) {
    // Se o ponto de orvalho for muito baixo ou maior que a temperatura, não há CAPE
    if (td > t || td < 0) return 0;
    
    // O CAPE decola se o Lapse Rate for íngreme (acima de 6.5°C/km) e houver muita umidade (Dewpoint alto)
    // Esta é uma aproximação matemática para simular o comportamento da atmosfera nos sliders
    let fatorUmidade = Math.max(0, td - 10); // Gatilho de umidade
    let fatorEstabilidade = Math.max(0, lapseRate - 5.5); // Gatilho de gradiente térmico
    
    let capeConstruido = fatorUmidade * 120 * Math.pow(fatorEstabilidade, 1.8);
    
    return Math.round(capeConstruido);
}

/**
 * Estima o CIN (Convective Inhibition / Capping Inversion)
 * @param {number} t - Temperatura (°C)
 * @param {number} td - Dewpoint (°C)
 * @returns {number} Inibição convectiva em J/kg
 */
function estimarCIN(t, td) {
    let depressaoDewpoint = t - td;
    // Quanto maior a diferença entre Temp e Dewpoint na superfície, maior tende a ser a camada de ar seco/estável (CIN)
    if (depressaoDewpoint <= 2) return 0;
    
    let cinConstruido = Math.pow(depressaoDewpoint, 1.5) * 5;
    return Math.round(cinConstruido);
}
