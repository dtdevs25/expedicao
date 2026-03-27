import express from 'express';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();

app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Permitir carregar scripts se necessário
}));
app.use(morgan('dev'));

// SMTP Config
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'ctdi_secret_key_2026';

// Middleware for Auth
const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acesso negado. Faça login.' });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Token inválido.' });
  }
};

// SMTP Config

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email, mustChangePassword: user.mustChangePassword } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro no login' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'E-mail não cadastrado no sistema.' });

    // Gerar senha temporária de 10 caracteres
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        password: hashedPassword,
        mustChangePassword: true 
      }
    });

    // Enviar e-mail
    await transporter.sendMail({
      from: `"Expedição CTDI" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: "Recuperação de Senha - Sistema de Expedição",
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Recuperação de Acesso</h2>
          <p>Olá <b>${user.name}</b>,</p>
          <p>Você solicitou a recuperação de senha para o sistema de expedição CTDI.</p>
          <p>Sua nova senha temporária é: <b style="font-size: 1.2rem; color: #10b981;">${tempPassword}</b></p>
          <p>Ao realizar o login, o sistema solicitará que você defina uma nova senha definitiva.</p>
          <hr />
          <p style="font-size: 0.8rem; color: #666;">Se você não solicitou esta alteração, entre em contato imediatamente com o administrador.</p>
        </div>
      `
    });

    res.json({ message: 'E-mail enviado com sucesso.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Erro ao processar recuperação de senha.' });
  }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { newPassword } = req.body;
  const userId = (req as any).user.id;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { 
        password: hashedPassword,
        mustChangePassword: false 
      }
    });
    res.json({ message: 'Senha atualizada com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar senha.' });
  }
});

// Protect Records Routes
app.use('/api/records', authMiddleware);

// API Routes
app.get('/api/records', async (req, res) => {
  try {
    const records = await prisma.expedicao.findMany({
      include: { notasFiscais: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(records);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Erro ao buscar registros' });
  }
});

// Create new record
app.post('/api/records', async (req, res) => {
  const { signatureImage, ...data } = req.body;

  try {
    // 1. Save to DB
    const newRecord = await prisma.expedicao.create({
      data: {
        responsavel: data.responsavel,
        dataSaida: data.dataSaida,
        cliente: data.cliente,
        destino: data.destino,
        natureza: data.natureza,
        volumes: data.volumes,
        transportadora: data.transportadora,
        motorista: data.motorista,
        rgCpf: data.rgCpf,
        placaVeiculo: data.placaVeiculo,
        ajudante: data.ajudante,
        nomeAssinatura: data.assinaturaDigital.nome,
        dataHoraAssinatura: data.assinaturaDigital.dataHora,
        codigoRastreabilidade: data.assinaturaDigital.codigoRastreabilidade,
        notasFiscais: {
          create: data.nfs.map((nf: any) => ({
            numero: nf.numero,
            expedicaoRefId: nf.expedicaoId
          }))
        }
      },
      include: { notasFiscais: true }
    });

    // 2. Generate PDF using Puppeteer
    const pdfBuffer = await generatePDF(data, signatureImage);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // 3. Send Email
    await transporter.sendMail({
      from: `"Expedição CTDI" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // Para si mesmo ou destinatário fixo
      subject: `Novo Documento de Expedição - ${data.cliente} - ${data.assinaturaDigital.codigoRastreabilidade}`,
      text: `Segue em anexo o documento de expedição de ${data.cliente}.`,
      attachments: [
        {
          filename: `Expedicao_${data.assinaturaDigital.codigoRastreabilidade}.pdf`,
          content: pdfBuffer
        }
      ]
    });

    res.status(201).json(newRecord);
  } catch (error) {
    console.error('Error creating record:', error);
    res.status(500).json({ error: 'Erro ao processar expedição' });
  }
});

// Delete record
app.delete('/api/records/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.expedicao.delete({
      where: { codigoRastreabilidade: id }
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ error: 'Erro ao excluir registro' });
  }
});

// PDF Generation Helper
async function generatePDF(data: any, signatureImage: string) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage();
  
  // HTML Template matching the frontend DocumentPreview
  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: black; }
          .header { text-align: center; margin-bottom: 40px; }
          .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .title { font-size: 18px; font-weight: bold; text-decoration: underline; margin-bottom: 20px; }
          .field { display: flex; border-bottom: 1px solid #ccc; padding: 8px 0; font-size: 14px; }
          .label { font-weight: bold; width: 250px; text-transform: uppercase; }
          .value { text-transform: uppercase; }
          .nf-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          .nf-table th, .nf-table td { border: 1px solid #ccc; padding: 5px; text-align: left; }
          .nf-table th { background: #f9f9f9; text-transform: uppercase; }
          .signature-section { margin-top: 40px; display: flex; align-items: flex-start; }
          .signature-box { border-bottom: 1px solid black; width: 300px; margin-right: 20px; }
          .signature-img { height: 60px; object-fit: contain; }
          .traceability { font-size: 10px; color: #666; margin-top: 10px; }
          .natureza-list { margin-top: 20px; }
          .natureza-item { display: flex; align-items: center; gap: 10px; margin-bottom: 5px; font-size: 12px; }
          .checkbox { width: 12px; height: 12px; border: 1px solid black; display: flex; align-items: center; justify-content: center; }
          .checked { background: #000; width: 6px; height: 6px; }
          .footer { position: fixed; bottom: 40px; left: 40px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">CTDI</div>
          <div class="title">REGISTRO DE EXPEDIÇÃO</div>
        </div>
        <div class="field"><span class="label">RESPONSÁVEL EXPEDIÇÃO:</span><span class="value">${data.responsavel}</span></div>
        <div class="field"><span class="label">DATA/HORA DA SAÍDA DA EXPEDIÇÃO:</span><span class="value">${data.dataSaida}</span></div>
        <div class="field"><span class="label">CLIENTE:</span><span class="value">${data.cliente}</span></div>
        <div class="field"><span class="label">DESTINO:</span><span class="value">${data.destino}</span></div>
        
        <div style="margin-top: 20px;">
          <div class="label" style="margin-bottom: 10px;">NF / ID EXPEDIÇÃO:</div>
          <table class="nf-table">
            <thead>
              <tr><th>Nota Fiscal</th><th>ID Expedição</th></tr>
            </thead>
            <tbody>
              ${data.nfs.map((nf: any) => `<tr><td>${nf.numero}</td><td>${nf.expedicaoId}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="natureza-list">
          <div class="label" style="margin-bottom: 10px;">NATUREZA DA OPERAÇÃO:</div>
          ${['VENDA', 'OUTROS', 'DOAÇÃO / DEMONSTRAÇÃO', 'RETORNO DE REPARO', 'REMESSA PARA REPARO', 'TRANSFERENCIA'].map(n => `
            <div class="natureza-item">
              <div class="checkbox">${data.natureza === n ? '<div class="checked"></div>' : ''}</div>
              <span>${n}</span>
            </div>
          `).join('')}
        </div>

        <div class="field"><span class="label">VOLUMES:</span><span class="value">${data.volumes}</span></div>
        <div class="field"><span class="label">TRANSPORTADORA:</span><span class="value">${data.transportadora}</span></div>
        <div class="field"><span class="label">MOTORISTA:</span><span class="value">${data.motorista}</span></div>
        <div class="field"><span class="label">RG/CPF:</span><span class="value">${data.rgCpf}</span></div>
        <div class="field"><span class="label">PLACA DO VEICULO:</span><span class="value">${data.placaVeiculo}</span></div>
        <div class="field"><span class="label">AJUDANTE:</span><span class="value">${data.ajudante || 'Sem ajudante'}</span></div>

        <div class="signature-section">
          <span class="label" style="width: 130px;">ASSINATURA:</span>
          <div>
            <div class="signature-box">
              ${signatureImage ? `<img src="${signatureImage}" class="signature-img" />` : ''}
            </div>
            <div class="traceability">
              <p>DOCUMENTO ASSINADO DIGITALMENTE POR: ${data.assinaturaDigital.nome}</p>
              <p>DATA E HORA DA ASSINATURA: ${data.assinaturaDigital.dataHora}</p>
              <p>CÓDIGO ÚNICO DE RASTREABILIDADE (ID): ${data.assinaturaDigital.codigoRastreabilidade}</p>
            </div>
          </div>
        </div>

        <div class="footer">CTDI F-5000195 / 2</div>
      </body>
    </html>
  ` ;

  await page.setContent(html);
  const pdf = await page.pdf({ format: 'A4' });
  await browser.close();
  return pdf;
}

// Serve static build
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
