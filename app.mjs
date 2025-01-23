import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __dirname = path.resolve();
const apostasPendentes = {}; // Armazena as apostas pendentes em memória

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const ACCESS_TOKEN = 'APP_USR-6293315586107842-011000-6ce8e228206d8d4d452bb02118674930-237382613';
const PAYMENTS_URL = 'https://api.mercadopago.com/v1/payments';

const CONFIG_PATH = path.join(__dirname, 'utils/config.json');
const APOSTAS_PATH = path.join(__dirname, 'apostas');

let ultimoPagamentoId = null;
let ultimoApostaId = null; // Adicionando variável para armazenar o identificador único da aposta

// Função para verificar se o tempo expirou
function verificarTempo() {
    if (!fs.existsSync(CONFIG_PATH)) return false;

    const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const agora = new Date();
    const fim = new Date(configData.timer);

    return agora > fim;
}

// Rota para criar PIX
app.post('/criar-pix', async (req, res) => {
    const { valor } = req.body;

    if (!valor || valor <= 0) {
        return res.status(400).json({ error: 'Valor inválido' });
    }

    try {
        const idempotencyKey = uuidv4();
        const apostaId = uuidv4(); // Identificador único da aposta

        console.log('Criando pagamento para aposta:', apostaId);

        const response = await fetch(PAYMENTS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'X-Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({
                transaction_amount: valor,
                payment_method_id: 'pix',
                description: 'Pagamento via PIX',
                payer: {
                    email: 'email_do_cliente@exemplo.com',
                },
                external_reference: apostaId, // Adiciona o identificador único no pagamento
            }),
        });

        const data = await response.json();

        if (!response.ok || !data.point_of_interaction) {
            console.error('Erro na resposta do Mercado Pago:', data);
            return res.status(500).json({
                error: 'Erro ao criar PIX',
                details: data.message || 'Resposta inesperada do Mercado Pago',
            });
        }

        // Armazena a aposta pendente no objeto
        apostasPendentes[apostaId] = {
            valor,
            pagamentoId: data.id, // ID do pagamento gerado pelo Mercado Pago
            criadoEm: new Date().toISOString(), // Data de criação
        };

        console.log('Aposta adicionada ao sistema:', apostasPendentes[apostaId]);

        res.json({
            qr_code: data.point_of_interaction.transaction_data.qr_code,
            copia_e_cola: data.point_of_interaction.transaction_data.qr_code,
            apostaId, // Retorna o identificador único
        });
    } catch (error) {
        console.error('Erro ao criar PIX:', error);
        res.status(500).json({ error: 'Erro no servidor', details: error.message });
    }
});







// Rota para verificar o pagamento
app.get('/verificar-pagamento', async (req, res) => {
    const { external_reference } = req.query;

    if (!external_reference || !apostasPendentes[external_reference]) {
        return res.status(400).json({ error: 'Aposta não encontrada ou inválida.' });
    }

    console.log('Consultando pagamento no Mercado Pago para:', external_reference);

    try {
        const pagamentoId = apostasPendentes[external_reference].pagamentoId;

        const response = await fetch(`${PAYMENTS_URL}/${pagamentoId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
            },
        });

        const data = await response.json();

        // Log detalhado da resposta do Mercado Pago
        console.log('Resposta do Mercado Pago:', data);

        if (response.ok && data.status === 'approved') {
            if (data.external_reference === external_reference) {
                console.log('Pagamento confirmado para aposta ID:', external_reference);

                // Remover a aposta do objeto pendente após confirmação
                delete apostasPendentes[external_reference];
                return res.status(200).json({ pagamentoConfirmado: true });
            } else {
                console.error('Identificador da aposta não corresponde:', {
                    esperado: external_reference,
                    recebido: data.external_reference,
                });
                return res.status(400).json({ pagamentoConfirmado: false, error: 'Identificador da aposta não corresponde.' });
            }
        } else {
            console.error('Pagamento não aprovado ou erro ao consultar:', data);
            return res.status(200).json({ pagamentoConfirmado: false });
        }
    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        res.status(500).json({ error: 'Erro ao verificar pagamento', details: error.message });
    }
});



// Rotas administrativas
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '123456') {
        return res.status(200).json({ success: true, message: 'Login bem-sucedido!' });
    }
    return res.status(401).json({ success: false, message: 'Credenciais inválidas!' });
});

app.post('/admin/config', (req, res) => {
    const { timer, apostaAtual } = req.body;
    if (!timer || !apostaAtual || isNaN(new Date(timer))) {
        return res.status(400).json({ success: false, message: 'Dados inválidos!' });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ timer, apostaAtual }));
    return res.status(200).json({ success: true, message: 'Configurações atualizadas!' });
});

app.get('/admin/config', (req, res) => {
    if (fs.existsSync(CONFIG_PATH)) {
        const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        return res.status(200).json(configData);
    }
    return res.status(404).json({ success: false, message: 'Configurações não encontradas!' });
});
// Rota para salvar apostas
// Rota para salvar apostas
app.post('/apostas/salvar', (req, res) => {
    if (verificarTempo()) {
        return res.status(403).json({ success: false, message: 'Tempo de apostas encerrado!' });
    }

    const { nome, telefone, bichos } = req.body;
    if (!nome || !telefone || !bichos) {
        return res.status(400).json({ success: false, message: 'Dados inválidos!' });
    }

    // Carregar número da aposta do arquivo de configuração
    const configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const numeroAposta = configData.apostaAtual;

    // Incrementar o número da aposta no arquivo de configuração
    configData.apostaAtual += 1;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2));

    // Ajustar data e hora para o fuso horário de Cuiabá
    const now = new Date();
    const options = { 
        timeZone: 'America/Cuiaba', 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
    };
    const formatter = new Intl.DateTimeFormat('pt-BR', options);
    const formattedDateTime = formatter.format(now); // Data e hora formatadas
    const [formattedDate, formattedTime] = formattedDateTime.split(' '); // Separar data e hora

    // Criar pasta com base na data
    const dateDir = path.join(APOSTAS_PATH, formattedDate);
    if (!fs.existsSync(APOSTAS_PATH)) fs.mkdirSync(APOSTAS_PATH);
    if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir);

    // Nome do arquivo baseado no número da aposta
    const filePath = path.join(dateDir, `aposta_${numeroAposta}.txt`);

    // Gerar conteúdo da aposta
    let apostaContent = `Nome: ${nome}\nTelefone: ${telefone}\nData: ${formattedDate}\nHora: ${formattedTime}\n`;
    apostaContent += "Bichos Selecionados:\n";

    let totalValor = 0;
    bichos.forEach(({ bicho, valor, tipoAposta }) => {
        apostaContent += `Bicho: ${bicho}, Tipo: ${tipoAposta}, Valor: ${valor}\n`;
        totalValor += valor;
    });

    apostaContent += `Valor Total: ${totalValor}\n\n`;

    // Salvar o conteúdo no arquivo
    fs.writeFileSync(filePath, apostaContent);

    return res.status(200).json({ success: true, message: 'Aposta salva com sucesso!', totalValor });
});



const __filename = fileURLToPath(import.meta.url);
const apostasDir = path.join(__dirname, 'apostas');

// Para servir arquivos estáticos se quiser
app.use(express.static(path.join(__dirname, 'public')));

// Rota para listar pastas dentro de 'apostas'
app.get('/apostas/pastas', (req, res) => {
  if (!fs.existsSync(apostasDir)) {
    // Se a pasta 'apostas' não existe, retorne array vazio
    return res.json([]);
  }
  // Lê todo o conteúdo de 'apostas'
  const itens = fs.readdirSync(apostasDir);
  // Filtrar apenas pastas
  const pastas = itens.filter(item => {
    const itemPath = path.join(apostasDir, item);
    return fs.lstatSync(itemPath).isDirectory();
  });

  res.json(pastas);
});app.get('/apostas/arquivos', (req, res) => {
    const { pasta } = req.query; // ?pasta=2025-01-21
    if (!pasta) {
      return res.status(400).json({ error: 'Faltou informar a pasta.' });
    }
  
    const pastaPath = path.join(apostasDir, pasta);
    if (!fs.existsSync(pastaPath)) {
      return res.status(404).json({ error: 'Pasta não encontrada.' });
    }
  
    const arquivos = fs.readdirSync(pastaPath);
    const listaArquivos = arquivos.map(fileName => {
      const filePath = path.join(pastaPath, fileName);
      const stats = fs.lstatSync(filePath);
      if (stats.isFile()) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { fileName, content };
      }
      return null;
    }).filter(Boolean);
  
    res.json(listaArquivos);
  });
  

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
// Captura erros não tratados
process.on('uncaughtException', (error) => {
    console.error('Erro não tratado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Rejeição não tratada:', reason);
});
