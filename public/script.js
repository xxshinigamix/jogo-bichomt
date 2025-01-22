document.addEventListener('DOMContentLoaded', () => {
    carregarConfiguracoes();
    exibirDataAtual();

    // Configurar botões de adicionar e remover bichos
    document.getElementById('addBicho').addEventListener('click', adicionarBicho);
    document.getElementById('removeLastBicho').addEventListener('click', removerUltimoBicho);
});

// Exibir a data atual
function exibirDataAtual() {
    const dataAtual = new Date().toLocaleDateString();
    document.getElementById('data-atual').textContent = dataAtual;
}

// Variável global para armazenar o horário de encerramento das apostas
let encerramentoApostas = null;

// Função para carregar configurações do backend
async function carregarConfiguracoes() {
    try {
        const response = await fetch('/admin/config');
        if (response.ok) {
            const config = await response.json();

            // Atualizar número da aposta
            document.getElementById('numero-aposta').textContent = `Aposta Nº: ${config.apostaAtual || 1}`;

            // Armazenar o horário de encerramento
            encerramentoApostas = new Date(config.timer);

            // Iniciar o timer
            iniciarTimer(encerramentoApostas);
        } else {
            console.error('Erro ao carregar configurações: Resposta inválida do servidor.');
        }
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
    }
}

// Função para iniciar o timer
function iniciarTimer(endTime) {
    const timerElement = document.getElementById('timer');

    const interval = setInterval(() => {
        const now = new Date();
        const diff = endTime - now;

        if (diff <= 0) {
            clearInterval(interval);
            timerElement.textContent = 'Tempo Restante: Apostas Encerradas';
        } else {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            timerElement.textContent = `Tempo Restante: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// Função principal para realizar uma aposta
// Função principal para realizar uma aposta
async function fazerAposta() {
    const nome = document.getElementById('nome').value.trim();
    const telefone = document.getElementById('telefone').value.trim();
    const data = new Date().toISOString().split('T')[0];

    if (!nome || !telefone) {
        alert('Todos os campos são obrigatórios.');
        return;
    }
    if (encerramentoApostas && new Date() > encerramentoApostas) {
        alert('As apostas estão encerradas!');
        return;
    }


    const bichos = Array.from(document.querySelectorAll('.bicho-item')).map(item => {
        const bicho = item.querySelector('.bicho-select').value;
        const valor = parseFloat(item.querySelector('.bicho-valor').value);
        const tipoAposta = item.querySelector('.tipo-aposta').value;
        return { bicho, valor, tipoAposta };
    });

    try {
        // Criar pagamento PIX
        const responsePix = await fetch('/criar-pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valor: bichos.reduce((sum, b) => sum + b.valor, 0) }),
        });

        const dataPix = await responsePix.json();
        if (!responsePix.ok) throw new Error('Erro ao criar QR Code');

        console.log('QR Code gerado:', dataPix);

        // Renderizar QR Code
        const qrcodeContainer = document.getElementById('qrcode');
        qrcodeContainer.innerHTML = '';
        new QRCode(qrcodeContainer, {
            text: dataPix.qr_code,
            width: 500,
            height: 500,
        });

        // Mostrar o "Copia e Cola"
        const copiaColaInput = document.getElementById('pix-copia-cola');
        const copiaColaContainer = document.getElementById('copia-cola-container');
        copiaColaInput.value = dataPix.copia_e_cola;
        copiaColaContainer.style.display = 'block';

        // Confirmar pagamento (SEM ALERTS)
        const pagamentoConfirmado = await confirmarPagamento(dataPix.apostaId);

        // Se confirmado, salvar a aposta automaticamente, sem interação do usuário:
        if (pagamentoConfirmado) {
            const responseSalvar = await fetch('/apostas/salvar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, telefone, bichos, data }),
            });

            const resultSalvar = await responseSalvar.json();
            if (responseSalvar.ok) {
                console.log(resultSalvar.message); // Removemos o alert e usamos console.log
                // Resetar formulário
                document.getElementById('apostaForm').reset();
                // Recarregar configurações e página
                carregarConfiguracoes();
                setTimeout(() => location.reload(), 1000);
                alert('APOSTA SALVA COM SUCESSO');
            } else {
                console.error(resultSalvar.message);
            }
        } else {
            // Se não confirmado, não fazemos nada ou só logamos
            console.log('Pagamento não confirmado. Operação cancelada.');
        }
    } catch (error) {
        console.error('Erro ao realizar aposta:', error);
        // Se quiser, pode exibir um alert aqui ou não
        // alert(`Erro ao realizar aposta: ${error.message}`);
    }
}

// Função para confirmar o pagamento (sem alerts)
async function confirmarPagamento(apostaId) {
    return new Promise((resolve, reject) => {
        const maxTentativas = 48; // Ajuste conforme desejar
        let tentativas = 0;

        const intervalo = setInterval(async () => {
            tentativas++;

            try {
                const response = await fetch(`/verificar-pagamento?external_reference=${apostaId}`);
                const data = await response.json();

                console.log('Resultado da verificação de pagamento:', data);

                if (response.ok && data.pagamentoConfirmado) {
                    clearInterval(intervalo);
                    console.log('Pagamento confirmado com sucesso!'); // Removemos alert
                    resolve(true);
                } else if (tentativas >= maxTentativas) {
                    clearInterval(intervalo);
                    console.log('Tempo limite para confirmação de pagamento excedido.'); // Removemos alert
                    resolve(false);
                }
            } catch (error) {
                clearInterval(intervalo);
                console.error('Erro ao verificar pagamento:', error);
                reject(new Error(`Erro ao verificar pagamento: ${error.message}`));
            }
        }, 5000);
    });
}


// Função para adicionar um novo bicho ao formulário
function adicionarBicho() {
    const container = document.getElementById('bichos-container');
    const newBicho = document.createElement('div');
    newBicho.className = 'bicho-item';
    newBicho.innerHTML = `
        <select name="bicho" class="bicho-select">
            <option value="Avestruz">🐦 Avestruz (01-04)</option>
            <option value="Águia">🦅 Águia (05-08)</option>
            <option value="Burro">🐴 Burro (09-12)</option>
            <option value="Borboleta">🦋 Borboleta (13-16)</option>
            <option value="Cachorro">🐶 Cachorro (17-20)</option>
            <option value="Cabra">🐐 Cabra (21-24)</option>
            <option value="Carneiro">🐑 Carneiro (25-28)</option>
            <option value="Camelo">🐪 Camelo (29-32)</option>
            <option value="Cavalo">🐎 Cavalo (33-36)</option>
            <option value="Elefante">🐘 Elefante (37-40)</option>
            <option value="Galo">🐓 Galo (41-44)</option>
            <option value="Gato">🐱 Gato (45-48)</option>
            <option value="Jacaré">🐊 Jacaré (49-52)</option>
            <option value="Leão">🦁 Leão (53-56)</option>
            <option value="Macaco">🐒 Macaco (57-60)</option>
            <option value="Porco">🐖 Porco (61-64)</option>
            <option value="Pavão">🦚 Pavão (65-68)</option>
            <option value="Peru">🦃 Peru (69-72)</option>
            <option value="Touro">🐂 Touro (73-76)</option>
            <option value="Tigre">🐅 Tigre (77-80)</option>
            <option value="Urso">🐻 Urso (81-84)</option>
            <option value="Veado">🦌 Veado (85-88)</option>
            <option value="Vaca">🐄 Vaca (89-92)</option>
        </select>
        <input type="number" name="valor" class="bicho-valor" placeholder="Valor" required>
        <select name="tipo-aposta" class="tipo-aposta">
            <option value="Dezena">Dezena</option>
            <option value="Centena">Centena</option>
            <option value="Milhar">Milhar</option>
        </select>
    `;
    container.appendChild(newBicho);
}

// Função para remover o último bicho adicionado
function removerUltimoBicho() {
    const container = document.getElementById('bichos-container');
    const bichos = container.getElementsByClassName('bicho-item');
    if (bichos.length > 1) {
        container.removeChild(bichos[bichos.length - 1]);
    } else {
        alert('Não é possível remover o bicho inicial!');
    }
}

// Função para copiar o conteúdo do PIX Copia e Cola
function copiarCopiaCola() {
    const copiaColaInput = document.getElementById('pix-copia-cola');
    copiaColaInput.select();
    document.execCommand('copy');
    alert('PIX Copia e Cola copiado!');
}

