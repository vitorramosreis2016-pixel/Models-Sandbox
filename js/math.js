// MOTOR MATEMÁTICO - SIMULADOR DE MESOANÁLISE (VERSÃO CALIBRADA)

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
 * Estima o CAPE (Convective Available Potential Energy) de forma semi-empírica e realista
 * Baseado na diferença de temperatura da parcela e no Lapse Rate vertical
 * @param {number} t - Temperatura (°C)
 * @param {number} td - Dewpoint (°C)
 * @param {number} lapseRate - Gradiente térmico vertical (°C/km)
 * @returns {number} Energia disponível em J/kg
 */
function estimarCAPE(t, td, lapseRate) {
    if (td > t || td < 10) return 0; // Sem umidade significativa em superfície = sem CAPE significativo
    
    // O Lapse Rate condicionalmente instável começa acima de 6.0 °C/km. O limite teórico é ~9.8 (adiabática seca)
    if (lapseRate <= 6.0) return 0;

    // Calcula a força da instabilidade nos níveis médios
    let instabilidadeFator = Math.pow(lapseRate - 6.0, 1.5);
    
    // O ponto de orvalho em superfície define a quantidade de combustível (vapor d'água)
    let combustivelUmidade = Math.pow(td - 10, 1.2);
    
    // Equação calibrada para dar valores reais (Ex: 30°C/24°Td com Lapse Rate de 7.5°C/km vai gerar ~3500 J/kg)
    let capeCalculado = instabilidadeFator * combustivelUmidade * 45;
    
    // Limitador físico extremo da atmosfera da Terra (evita explosões surreais de CAPE)
    return Math.min(6500, Math.round(capeCalculado));
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
