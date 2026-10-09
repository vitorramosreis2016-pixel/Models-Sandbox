// Função para alternar entre as abas do simulador
function switchTab(tabId) {
    // 1. Remove a classe 'active' de todas as seções de conteúdo
    const sections = document.querySelectorAll('.tab-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });

    // 2. Remove a classe 'active' de todos os botões de aba
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(button => {
        button.classList.remove('active');
    });

    // 3. Adiciona a classe 'active' na seção que o usuário clicou
    const activeSection = document.getElementById(tabId);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    // 4. Encontra o botão correspondente e adiciona a classe 'active' nele
    // Procura pelo botão que possui o evento contendo o ID da aba correspondente
    buttons.forEach(button => {
        if (button.getAttribute('onclick').includes(tabId)) {
            button.classList.add('active');
        }
    });
}
