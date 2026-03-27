import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, Printer, FileText, LogOut, Menu, 
  ChevronLeft, Search, Eye, User, Lock, LayoutDashboard,
  ClipboardList, PlusCircle, Truck, Settings, Heart,
  RotateCcw, Wrench, ArrowLeftRight, AlertCircle, Eraser,
  PenTool, Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
import { RegistroExpedicao, NFItem, NaturezaOperacao } from './types';

// --- Constants & Mock Data ---
const NATUREZAS: NaturezaOperacao[] = [
  'VENDA',
  'OUTROS',
  'DOAÇÃO / DEMONSTRAÇÃO',
  'RETORNO DE REPARO',
  'REMESSA PARA REPARO',
  'TRANSFERENCIA',
];

const INITIAL_FORM_DATA: RegistroExpedicao = {
  responsavel: 'Akim de Oliveira',
  dataSaida: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  cliente: 'Cielo S.A.',
  destino: 'FNC Barueri',
  nfs: [
    { id: '1', numero: '142171', expedicaoId: 'EXP-9921' },
    { id: '2', numero: '142056', expedicaoId: 'EXP-9922' },
    { id: '3', numero: '142071', expedicaoId: 'EXP-9923' },
  ],
  natureza: 'VENDA',
  volumes: '85',
  transportadora: 'FNC Logística',
  motorista: 'Lourival Dias',
  rgCpf: '12.345.678-9',
  placaVeiculo: 'RKE-0G55',
  ajudante: 'Sem ajudante',
  signatureImage: undefined,
  assinaturaDigital: {
    nome: '',
    dataHora: '',
    codigoRastreabilidade: '',
  },
};

// --- Components ---

const BrandLogo = ({ size = "md", className = "" }: { size?: "sm" | "md" | "lg", className?: string }) => {
  const sizes = {
    sm: "h-8",
    md: "h-12",
    lg: "h-24"
  };
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img src="/logo_branco.png" alt="Logo" className={`${sizes[size]} object-contain`} />
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<{ name: string, token: string, mustChangePassword?: boolean } | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [view, setView] = useState<'cadastro' | 'consulta' | 'preview'>('cadastro');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [records, setRecords] = useState<RegistroExpedicao[]>([]);
  const [formData, setFormData] = useState<RegistroExpedicao>(INITIAL_FORM_DATA);
  const [selectedRecord, setSelectedRecord] = useState<RegistroExpedicao | null>(null);

  const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const savedUser = localStorage.getItem('ctdi_user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          // Validate token is still good
          const res = await fetch('/api/records', {
            headers: { 'Authorization': `Bearer ${parsed.token}` }
          });
          if (res.status === 401) {
            localStorage.removeItem('ctdi_user');
          } else {
            setUser(parsed);
            if (!parsed.mustChangePassword) {
              const data = await res.json();
              const mappedData = data.map((r: any) => ({
                ...r,
                nfs: r.notasFiscais.map((nf: any) => ({
                  id: nf.id,
                  numero: nf.numero,
                  expedicaoId: nf.expedicaoRefId
                })),
                assinaturaDigital: {
                  nome: r.nomeAssinatura,
                  dataHora: r.dataHoraAssinatura,
                  codigoRastreabilidade: r.codigoRastreabilidade
                }
              }));
              setRecords(mappedData);
            }
          }
        }
      } catch (e) {
        console.error('Erro na inicialização:', e);
        localStorage.removeItem('ctdi_user');
      } finally {
        setIsInitializing(false);
      }
    };
    initAuth();
  }, []);

  const fetchRecords = async (token: string) => {
    try {
      const response = await fetch('/api/records', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        // Map backend response back to frontend types if necessary
        const mappedData = data.map((r: any) => ({
          ...r,
          nfs: r.notasFiscais.map((nf: any) => ({
            id: nf.id,
            numero: nf.numero,
            expedicaoId: nf.expedicaoRefId
          })),
          assinaturaDigital: {
            nome: r.nomeAssinatura,
            dataHora: r.dataHoraAssinatura,
            codigoRastreabilidade: r.codigoRastreabilidade
          }
        }));
        setRecords(mappedData);
      } else if (response.status === 401) {
        handleLogout();
      }
    } catch (e) {
      console.error('Erro ao carregar registros:', e);
      setNotification({ message: 'Erro ao carregar registros do servidor.', type: 'error' });
    }
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const saveRecord = async (dataToSave: RegistroExpedicao, signatureFromCanvas?: string) => {
    try {
      const isUpdate = !!dataToSave.assinaturaDigital.codigoRastreabilidade;
      const traceabilityCode = dataToSave.assinaturaDigital.codigoRastreabilidade || Math.random().toString(36).substring(2, 15).toUpperCase();
      
      const newRecord = {
        ...dataToSave,
        signatureImage: signatureFromCanvas || dataToSave.signatureImage,
        assinaturaDigital: {
          ...dataToSave.assinaturaDigital,
          nome: dataToSave.motorista || 'Operador',
          dataHora: new Date().toLocaleString('pt-BR'),
          codigoRastreabilidade: traceabilityCode
        }
      };
      
      setNotification({ message: 'Processando expedição e enviando e-mail...', type: 'success' });
      
      const response = await fetch('/api/records', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`
        },
        body: JSON.stringify(newRecord)
      });

      if (!response.ok) throw new Error('Falha ao salvar no servidor');

      const savedData = await response.json();
      
      // Refresh local list
      if (user?.token) fetchRecords(user.token);
      
      setFormData(newRecord);
      setView('preview');
      window.scrollTo(0, 0);
      setNotification({ message: 'Documento gerado e enviado por e-mail!', type: 'success' });
    } catch (error) {
      console.error('Erro ao salvar registro:', error);
      setNotification({ message: 'Erro ao gerar documento no servidor. Verifique a conexão.', type: 'error' });
    }
  };

  const handleLogout = () => setUser(null);

  const startNewCadastro = () => {
    setFormData(INITIAL_FORM_DATA);
    setView('cadastro');
    setSelectedRecord(null);
  };

  const deleteRecord = async (codigo: string) => {
    try {
      const response = await fetch(`/api/records/${codigo}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user?.token}` }
      });
      
      if (response.ok) {
        setRecords(prev => prev.filter(r => r.assinaturaDigital.codigoRastreabilidade !== codigo));
        setNotification({ message: 'Registro excluído com sucesso.', type: 'success' });
      } else {
        throw new Error('Falha ao excluir no servidor');
      }
    } catch (e) {
      console.error('Erro ao excluir:', e);
      setNotification({ message: 'Erro ao excluir registro do servidor.', type: 'error' });
    }
    setConfirmDelete(null);
  };

  const editRecord = (record: RegistroExpedicao) => {
    setFormData(record);
    setView('cadastro');
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center">
        <BrandLogo size="lg" className="opacity-80 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={(data: any) => {
      const userData = { token: data.token, ...data.user };
      setUser(userData);
      localStorage.setItem('ctdi_user', JSON.stringify(userData));
      if (!userData.mustChangePassword) {
        fetchRecords(userData.token);
      }
    }} />;
  }

  if (user.mustChangePassword) {
    return <ChangePasswordView 
      token={user.token} 
      onComplete={(token) => {
        const updatedUser = { ...user, token, mustChangePassword: false };
        setUser(updatedUser);
        localStorage.setItem('ctdi_user', JSON.stringify(updatedUser));
        fetchRecords(token);
      }} 
    />;
  }

  return (
    <div className="h-screen bg-stone-50 flex flex-col font-sans text-stone-900 overflow-hidden">
      {/* Header */}
      <header className="no-print h-16 bg-white border-b border-stone-200 px-6 flex items-center justify-between shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="text-stone-900 scale-110 origin-left">
            <BrandLogo size="sm" className="brightness-0" />
          </div>
          <span className="hidden md:block font-bold text-stone-400 text-xs uppercase tracking-widest ml-2">
            Sistema de Expedição
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={handleLogout}
            className="p-2.5 text-stone-500 hover:text-red-600 transition-colors rounded-full hover:bg-stone-100"
            title="Sair"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Notifications */}
        <AnimatePresence>
          {notification && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`fixed top-20 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border ${
                notification.type === 'error' ? 'bg-red-50 border-red-100 text-red-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'
              }`}
            >
              {notification.type === 'error' ? <AlertCircle size={20} /> : <PlusCircle size={20} />}
              <span className="text-sm font-bold">{notification.message}</span>
              <button onClick={() => setNotification(null)} className="ml-4 hover:opacity-70">
                <Plus size={18} className="rotate-45" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {confirmDelete && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl space-y-8"
              >
                <div className="flex items-center gap-4 text-red-600">
                  <div className="p-4 bg-red-50 rounded-2xl">
                    <Trash2 size={32} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tighter">Excluir Registro?</h2>
                    <p className="text-stone-400 text-sm font-bold uppercase tracking-widest">Esta ação não pode ser desfeita.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-stone-400 hover:bg-stone-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => deleteRecord(confirmDelete)}
                    className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 transition-all shadow-xl shadow-red-200"
                  >
                    Excluir
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside 
          className={`no-print bg-white border-r border-stone-200 transition-all duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'w-64' : 'w-20'}`}
        >
          <nav className="flex-1 py-6 px-3 space-y-2">
            <SidebarItem 
              icon={<PlusCircle size={20} />} 
              label="Novo Cadastro" 
              active={view === 'cadastro'} 
              collapsed={!isSidebarOpen}
              onClick={startNewCadastro}
            />
            <SidebarItem 
              icon={<ClipboardList size={20} />} 
              label="Consultar Registros" 
              active={view === 'consulta'} 
              collapsed={!isSidebarOpen}
              onClick={() => { setView('consulta'); setSelectedRecord(null); }}
            />
          </nav>
          <div className="p-4 border-t border-stone-100 bg-stone-50/50">
            <div className={`flex items-center gap-3 ${!isSidebarOpen && 'justify-center'}`}>
              <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-white text-sm font-black shadow-lg shadow-stone-200">
                {user.name[0].toUpperCase()}
              </div>
              {isSidebarOpen && (
                <div className="overflow-hidden flex flex-col">
                  <p className="text-xs font-black uppercase tracking-tighter truncate">{user.name}</p>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Operador</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <AnimatePresence mode="wait">
            {view === 'cadastro' ? (
              <motion.div
                key="cadastro"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <CadastroView 
                  data={formData} 
                  setData={setFormData} 
                  onSave={(data, sig) => saveRecord(data, sig)} 
                  setNotification={setNotification}
                />
              </motion.div>
            ) : view === 'preview' ? (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center"
              >
                <div className="mb-6 flex gap-4 no-print">
                  <button 
                    onClick={() => {
                      if (records.some(r => r.assinaturaDigital.codigoRastreabilidade === formData.assinaturaDigital.codigoRastreabilidade)) {
                        setView('consulta');
                      } else {
                        setView('cadastro');
                      }
                    }}
                    className="flex items-center gap-2 bg-white border border-stone-200 px-6 py-3 rounded-xl font-bold hover:bg-stone-50 transition-all shadow-sm"
                  >
                    <ChevronLeft size={18} /> Voltar
                  </button>
                </div>
                <DocumentPreview data={formData} />
              </motion.div>
            ) : (
              <motion.div
                key="consulta"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <ConsultaView 
                  records={records} 
                  onView={(record) => {
                    setFormData(record);
                    setView('preview');
                  }}
                  onEdit={editRecord}
                  onDelete={(codigo) => setConfirmDelete(codigo)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Print Modal / Overlay */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 no-print overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto relative">
            <button 
              onClick={() => setSelectedRecord(null)}
              className="absolute top-4 right-4 p-2 hover:bg-stone-100 rounded-full transition-colors z-10"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="p-8">
              <div className="flex justify-end mb-4">
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-stone-800 transition-all"
                >
                  <Printer size={18} /> Imprimir
                </button>
              </div>
              <DocumentPreview data={selectedRecord} />
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Area */}
      <div className="hidden print:block fixed inset-0 bg-white z-[999]">
        {selectedRecord && <DocumentPreview data={selectedRecord} />}
      </div>
    </div>
  );
}

// --- Sub-components ---

function SidebarItem({ icon, label, active, collapsed, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
        active 
          ? 'bg-stone-900 text-white shadow-lg shadow-stone-200' 
          : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <div className="flex-shrink-0">{icon}</div>
      {!collapsed && <span className="text-sm font-bold tracking-tight">{label}</span>}
    </button>
  );
}

function LoginView({ onLogin }: { onLogin: (data: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailForReset, setEmailForReset] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data);
      } else {
        setError(data.error || 'Erro ao realizar login');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailForReset })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Senha temporária enviada para o seu e-mail!');
        setTimeout(() => setIsResetMode(false), 3000);
      } else {
        setError(data.error || 'Erro ao processar solicitação');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="bg-stone-900 p-12 flex flex-col items-center text-white">
          <BrandLogo size="lg" />
          <h1 className="mt-6 text-2xl font-black tracking-tighter uppercase">
            {isResetMode ? 'Recuperar Acesso' : 'Acesso ao Sistema'}
          </h1>
          <p className="text-stone-400 text-xs font-bold tracking-widest uppercase mt-2">Controle de Expedição</p>
        </div>
        
        {isResetMode ? (
          <form onSubmit={handleResetPassword} className="p-10 space-y-6">
            {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold uppercase tracking-widest border border-red-100 flex items-center gap-2"><AlertCircle size={16} /> {error}</div>}
            {success && <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl text-xs font-bold uppercase tracking-widest border border-emerald-100 flex items-center gap-2"><PlusCircle size={16} /> {success}</div>}
            
            <div className="space-y-4">
              <p className="text-stone-500 text-xs font-bold uppercase leading-relaxed text-center">
                Informe o seu e-mail cadastrado para receber uma senha temporária.
              </p>
              <div className="relative">
                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="email"
                  placeholder="Seu E-mail"
                  value={emailForReset}
                  onChange={(e) => setEmailForReset(e.target.value)}
                  className="w-full bg-stone-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-stone-900 transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-[0.98] shadow-xl shadow-emerald-200 ${loading && 'opacity-50'}`}
            >
              {loading ? 'Enviando...' : 'Enviar Nova Senha'}
            </button>

            <button 
              type="button"
              onClick={() => setIsResetMode(false)}
              className="w-full text-stone-400 text-[10px] font-black uppercase tracking-widest hover:text-stone-900"
            >
              Voltar para o Login
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-10 space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-bold uppercase tracking-widest border border-red-100 flex items-center gap-2">
                <AlertCircle size={16} /> {error}
              </div>
            )}
            <div className="space-y-4">
              <div className="relative">
                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="email"
                  placeholder="Seu E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-stone-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-stone-900 transition-all"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="password"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-stone-50 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-stone-900 transition-all"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pr-2">
              <button 
                type="button" 
                onClick={() => setIsResetMode(true)}
                className="text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-red-500 transition-all flex items-center gap-2"
              >
                <RotateCcw size={14} /> Esqueci minha senha
              </button>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-stone-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-stone-800 transition-all active:scale-[0.98] shadow-xl shadow-stone-200 ${loading && 'opacity-50'}`}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

function SetupView({ onComplete }: { onComplete: (data: any) => void }) {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password, name, email })
      });
      const data = await res.json();
      if (res.ok) {
        onComplete(data);
      } else {
        setError(data.error || 'Erro no setup');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="bg-stone-900 p-12 flex flex-col items-center text-white text-center">
          <BrandLogo size="lg" />
          <h1 className="text-2xl font-black tracking-tighter uppercase mt-6">Configuração Inicial</h1>
          <p className="text-stone-400 text-[10px] font-bold tracking-widest uppercase mt-2">Crie o usuário administrador mestre</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-10 space-y-5">
          {error && <div className="text-red-600 bg-red-50 p-4 rounded-xl text-xs font-bold uppercase">{error}</div>}
          <div className="space-y-4">
            <InputField label="Nome Completo" value={name} onChange={setName} icon={<User size={18} />} />
            <InputField label="Seu E-mail" value={email} onChange={setEmail} icon={<FileText size={18} />} />
            <InputField label="Senha" value={password} onChange={setPassword} icon={<Lock size={18} />} type="password" />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-200 mt-4"
          >
            {loading ? 'Configurando...' : 'Finalizar Setup e Entrar'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function ChangePasswordView({ token, onComplete }: { token: string, onComplete: (token: string) => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return setError('As senhas não coincidem');
    if (newPassword.length < 6) return setError('A senha deve ter pelo menos 6 caracteres');
    
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        onComplete(token);
      } else {
        setError(data.error || 'Erro ao atualizar senha');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="bg-emerald-600 p-12 flex flex-col items-center text-white text-center">
          <Lock size={48} className="mb-4" />
          <h1 className="text-2xl font-black tracking-tighter uppercase">Defina sua Senha</h1>
          <p className="text-emerald-100 text-[10px] font-bold tracking-widest uppercase mt-2">Por segurança, você deve escolher uma senha permanente</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-10 space-y-5">
          {error && <div className="text-red-600 bg-red-50 p-4 rounded-xl text-xs font-bold uppercase">{error}</div>}
          <div className="space-y-4">
            <InputField label="Nova Senha" value={newPassword} onChange={setNewPassword} icon={<Lock size={18} />} type="password" />
            <InputField label="Confirmar Nova Senha" value={confirmPassword} onChange={setConfirmPassword} icon={<Lock size={18} />} type="password" />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-stone-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-stone-800 shadow-xl shadow-stone-200 mt-4"
          >
            {loading ? 'Salvando...' : 'Atualizar e Entrar'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}


function CadastroView({ 
  data, 
  setData, 
  onSave,
  setNotification
}: { 
  data: RegistroExpedicao, 
  setData: React.Dispatch<React.SetStateAction<RegistroExpedicao>>, 
  onSave: (data: RegistroExpedicao, sig?: string) => void,
  setNotification: (n: { message: string, type: 'error' | 'success' } | null) => void
}) {
  const sigCanvas = useRef<SignatureCanvas>(null);

  // Fix for signature canvas resizing
  useEffect(() => {
    const resizeCanvas = () => {
      if (sigCanvas.current) {
        const canvas = sigCanvas.current.getCanvas();
        if (canvas) {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          const container = canvas.parentElement;
          if (!container) return;

          const newWidth = container.offsetWidth * ratio;
          const newHeight = container.offsetHeight * ratio;
          
          if (canvas.width !== newWidth || canvas.height !== newHeight) {
            // Save current content before resize if possible
            const currentData = sigCanvas.current.isEmpty() ? null : sigCanvas.current.toDataURL();
            
            canvas.width = newWidth;
            canvas.height = newHeight;
            canvas.getContext('2d')?.scale(ratio, ratio);
            
            // Restore content if it existed
            if (currentData) {
              sigCanvas.current.fromDataURL(currentData);
            } else {
              sigCanvas.current.clear();
            }
          }
        }
      }
    };

    window.addEventListener('resize', resizeCanvas);
    const timer = setTimeout(resizeCanvas, 200);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      clearTimeout(timer);
    };
  }, []);

  const addNF = () => {
    const newNF: NFItem = {
      id: Math.random().toString(36).substr(2, 9),
      numero: '',
      expedicaoId: '',
    };
    setData((prev: any) => ({ ...prev, nfs: [...prev.nfs, newNF] }));
  };

  const removeNF = (id: string) => {
    setData((prev: any) => ({ ...prev, nfs: prev.nfs.filter((nf: any) => nf.id !== id) }));
  };

  const updateNF = (id: string, field: keyof NFItem, value: string) => {
    setData((prev: any) => ({
      ...prev,
      nfs: prev.nfs.map((nf: any) => (nf.id === id ? { ...nf, [field]: value } : nf)),
    }));
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setData((prev: any) => ({ ...prev, signatureImage: undefined }));
  };

  const saveSignature = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      const signatureData = sigCanvas.current.toDataURL('image/png');
      setData((prev: any) => ({ ...prev, signatureImage: signatureData }));
    }
  };

  const isFormValid = 
    data.responsavel.trim() !== '' &&
    data.cliente.trim() !== '' &&
    data.destino.trim() !== '' &&
    data.volumes.trim() !== '' &&
    data.transportadora.trim() !== '' &&
    data.motorista.trim() !== '' &&
    data.rgCpf.trim() !== '' &&
    data.placaVeiculo.trim() !== '' &&
    data.nfs.length > 0 &&
    data.nfs.every(nf => nf.numero.trim() !== '' && nf.expedicaoId.trim() !== '');

  const natureIcons: Record<string, any> = {
    'VENDA': FileText,
    'OUTROS': Settings,
    'DOAÇÃO / DEMONSTRAÇÃO': Heart,
    'RETORNO DE REPARO': RotateCcw,
    'REMESSA PARA REPARO': Wrench,
    'TRANSFERENCIA': ArrowLeftRight,
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="mb-10">
        <h1 className="text-4xl font-black tracking-tighter uppercase text-stone-900">Novo Registro</h1>
        <p className="text-stone-400 font-bold text-sm uppercase tracking-widest mt-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          Preencha os dados para gerar o documento oficial
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card: Dados da Expedição */}
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100 space-y-8">
          <div className="flex items-center gap-4 text-stone-900">
            <div className="p-3 bg-stone-100 rounded-2xl">
              <ClipboardList size={24} />
            </div>
            <h2 className="text-lg font-black uppercase tracking-tighter">Dados da Expedição</h2>
          </div>
          
          <div className="space-y-5">
            <InputField label="Responsável Expedição" value={data.responsavel} onChange={(v) => setData((prev: any) => ({ ...prev, responsavel: v }))} />
            <InputField label="Data/Hora Saída" value={data.dataSaida} onChange={(v) => setData((prev: any) => ({ ...prev, dataSaida: v }))} />
            <InputField label="Cliente" value={data.cliente} onChange={(v) => setData((prev: any) => ({ ...prev, cliente: v }))} />
            <InputField label="Destino" value={data.destino} onChange={(v) => setData((prev: any) => ({ ...prev, destino: v }))} />
          </div>
        </div>

        {/* Card: Logística */}
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100 space-y-8">
          <div className="flex items-center gap-4 text-stone-900">
            <div className="p-3 bg-stone-100 rounded-2xl">
              <Truck size={24} />
            </div>
            <h2 className="text-lg font-black uppercase tracking-tighter">Logística</h2>
          </div>
          
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Volumes" value={data.volumes} onChange={(v) => setData((prev: any) => ({ ...prev, volumes: v }))} />
              <InputField label="Placa do Veículo" value={data.placaVeiculo} onChange={(v) => setData((prev: any) => ({ ...prev, placaVeiculo: v }))} />
            </div>
            <InputField label="Transportadora" value={data.transportadora} onChange={(v) => setData((prev: any) => ({ ...prev, transportadora: v }))} />
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Motorista" value={data.motorista} onChange={(v) => setData((prev: any) => ({ ...prev, motorista: v }))} />
              <InputField label="RG/CPF" value={data.rgCpf} onChange={(v) => setData((prev: any) => ({ ...prev, rgCpf: v }))} />
            </div>
            <InputField label="Ajudante" value={data.ajudante} onChange={(v) => setData((prev: any) => ({ ...prev, ajudante: v }))} />
          </div>
        </div>

        {/* Card: Notas Fiscais */}
        <div className="md:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100 space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-stone-900">
              <div className="p-3 bg-stone-100 rounded-2xl">
                <FileText size={24} />
              </div>
              <h2 className="text-lg font-black uppercase tracking-tighter">Notas Fiscais</h2>
            </div>
            <button 
              onClick={addNF}
              className="flex items-center gap-2 bg-stone-900 text-white px-5 py-2.5 rounded-xl hover:bg-stone-800 transition-all text-[10px] font-black uppercase tracking-widest"
            >
              <Plus size={14} /> Adicionar NF
            </button>
          </div>

          <div className="space-y-3">
            {/* List Header */}
            {data.nfs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pr-12 px-4 hidden sm:grid">
                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Nº da NF</span>
                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">ID Expedição</span>
              </div>
            )}

            {data.nfs.map((nf: any) => (
              <div key={nf.id} className="flex items-center gap-4 group">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50/50 p-3 rounded-2xl border border-stone-100 group-hover:border-stone-200 transition-all">
                  <div className="sm:hidden">
                    <InputField label="Nº da NF" value={nf.numero} onChange={(v) => updateNF(nf.id, 'numero', v)} />
                  </div>
                  <div className="hidden sm:block">
                    <input
                      type="text"
                      value={nf.numero}
                      placeholder="000.000.000"
                      onChange={(e) => updateNF(nf.id, 'numero', e.target.value)}
                      className={`w-full bg-white border rounded-xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-stone-900 transition-all shadow-sm ${
                        nf.numero.trim() === '' ? 'border-amber-200 bg-amber-50/30' : 'border-stone-200'
                      }`}
                    />
                  </div>

                  <div className="sm:hidden">
                    <InputField label="ID Expedição" value={nf.expedicaoId} onChange={(v) => updateNF(nf.id, 'expedicaoId', v)} />
                  </div>
                  <div className="hidden sm:block">
                    <input
                      type="text"
                      value={nf.expedicaoId}
                      placeholder="EXP-0000"
                      onChange={(e) => updateNF(nf.id, 'expedicaoId', e.target.value)}
                      className={`w-full bg-white border rounded-xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-stone-900 transition-all shadow-sm ${
                        nf.expedicaoId.trim() === '' ? 'border-amber-200 bg-amber-50/30' : 'border-stone-200'
                      }`}
                    />
                  </div>
                </div>
                <button 
                  onClick={() => removeNF(nf.id)}
                  className="bg-white text-stone-300 hover:text-red-500 p-3 rounded-xl shadow-sm border border-stone-100 hover:border-red-100 transition-all"
                  title="Remover NF"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            {data.nfs.length === 0 && (
              <div className="py-12 text-center border-2 border-dashed border-stone-100 rounded-[2rem] text-stone-300 font-bold text-sm uppercase tracking-widest bg-stone-50/30">
                Nenhuma Nota Fiscal adicionada
              </div>
            )}
          </div>
        </div>

        {/* Card: Natureza da Operação */}
        <div className="md:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100 space-y-8">
          <div className="flex items-center gap-4 text-stone-900">
            <div className="p-3 bg-stone-100 rounded-2xl">
              <Settings size={24} />
            </div>
            <h2 className="text-lg font-black uppercase tracking-tighter">Natureza da Operação</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {NATUREZAS.map(n => {
              const Icon = natureIcons[n] || Settings;
              return (
                <button
                  key={n}
                  onClick={() => setData((prev: any) => ({ ...prev, natureza: n }))}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all border text-left group ${
                    data.natureza === n 
                      ? 'bg-stone-900 border-stone-900 text-white shadow-md' 
                      : 'bg-white border-stone-100 text-stone-600 hover:border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg transition-colors ${
                    data.natureza === n ? 'bg-white/10 text-white' : 'bg-stone-100 text-stone-400 group-hover:bg-stone-200'
                  }`}>
                    <Icon size={14} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-tight leading-tight flex-1">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Card: Coleta de Assinatura */}
        <div className="md:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100 space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-stone-900">
              <div className="p-3 bg-stone-100 rounded-2xl">
                <PenTool size={24} />
              </div>
              <h2 className="text-lg font-black uppercase tracking-tighter">Coleta de Assinatura</h2>
            </div>
            <button 
              onClick={clearSignature}
              className="flex items-center gap-2 text-stone-400 hover:text-red-500 transition-colors text-[10px] font-black uppercase tracking-widest"
            >
              <Eraser size={14} /> Limpar Assinatura
            </button>
          </div>

          <div className="border-2 border-dashed border-stone-200 rounded-3xl overflow-hidden bg-stone-50 h-48 relative">
            <SignatureCanvas 
              ref={sigCanvas}
              penColor="black"
              velocityFilterWeight={0.7}
              minWidth={1.5}
              maxWidth={3.5}
              canvasProps={{ 
                className: 'w-full h-full cursor-crosshair',
                style: { display: 'block' }
              }}
              onEnd={saveSignature}
            />
            {!data.signatureImage && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-stone-300 text-[10px] font-black uppercase tracking-[0.2em]">
                Assine aqui
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="md:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-6 pt-10 border-t border-stone-100">
          {!isFormValid && (
            <div className="flex items-center gap-3 text-amber-600 bg-amber-50 px-6 py-3 rounded-2xl border border-amber-100">
              <AlertCircle size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Preencha todos os campos obrigatórios</span>
            </div>
          )}
          <div className="flex items-center gap-4 ml-auto">
            <button
              onClick={() => setData(INITIAL_FORM_DATA)}
              className="px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all"
            >
              Limpar Tudo
            </button>
            <button
                  onClick={() => {
                    if (!isFormValid) {
                      const missingFields = [];
                      if (data.responsavel.trim() === '') missingFields.push('Responsável');
                      if (data.cliente.trim() === '') missingFields.push('Cliente');
                      if (data.destino.trim() === '') missingFields.push('Destino');
                      if (data.volumes.trim() === '') missingFields.push('Volumes');
                      if (data.transportadora.trim() === '') missingFields.push('Transportadora');
                      if (data.motorista.trim() === '') missingFields.push('Motorista');
                      if (data.rgCpf.trim() === '') missingFields.push('RG/CPF');
                      if (data.placaVeiculo.trim() === '') missingFields.push('Placa do Veículo');
                      if (data.nfs.length === 0) missingFields.push('Pelo menos uma NF');
                      if (data.nfs.some(nf => nf.numero.trim() === '' || nf.expedicaoId.trim() === '')) missingFields.push('Dados das NFs');

                      setNotification({ 
                        message: 'Campos obrigatórios faltando: ' + missingFields.join(', '), 
                        type: 'error' 
                      });
                      return;
                    }

                    let finalSignature = data.signatureImage;
                    
                    try {
                      if (sigCanvas.current) {
                        // Use toDataURL directly from the component for better reliability
                        const canvasData = sigCanvas.current.toDataURL('image/png');
                        // Only use it if it's not a completely empty canvas
                        if (!sigCanvas.current.isEmpty()) {
                          finalSignature = canvasData;
                        }
                      }
                    } catch (error) {
                      console.error('Erro ao capturar assinatura:', error);
                    }
                    
                    onSave(data, finalSignature);
                  }}
              className={`px-12 py-5 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center gap-4 group shadow-2xl ${
                isFormValid 
                  ? 'bg-stone-900 text-white hover:bg-stone-800 shadow-stone-300' 
                  : 'bg-stone-400 text-white hover:bg-stone-500 shadow-none'
              }`}
            >
              <PlusCircle size={22} className={isFormValid ? "group-hover:rotate-90 transition-transform" : ""} />
              Gerar Documento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsultaView({ 
  records, 
  onView, 
  onEdit, 
  onDelete 
}: { 
  records: RegistroExpedicao[], 
  onView: (r: RegistroExpedicao) => void,
  onEdit: (r: RegistroExpedicao) => void,
  onDelete: (codigo: string) => void
}) {
  const [search, setSearch] = useState('');

  const filtered = records.filter(r => 
    r.cliente.toLowerCase().includes(search.toLowerCase()) ||
    r.motorista.toLowerCase().includes(search.toLowerCase()) ||
    r.destino.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase">Consulta</h1>
          <p className="text-stone-400 font-bold text-xs uppercase tracking-widest mt-1">Gerencie os registros de expedição salvos</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente, motorista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-stone-200 rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-stone-900 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-100">
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Data</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Cliente</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Destino</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Motorista</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400">Natureza</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-stone-400 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filtered.map((record, i) => (
              <tr key={i} className="hover:bg-stone-50/50 transition-colors group">
                <td className="px-6 py-4 text-xs font-bold">{record.dataSaida}</td>
                <td className="px-6 py-4 text-xs font-bold text-stone-900">{record.cliente}</td>
                <td className="px-6 py-4 text-xs text-stone-500">{record.destino}</td>
                <td className="px-6 py-4 text-xs text-stone-500">{record.motorista}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-stone-100 rounded text-[9px] font-black uppercase tracking-tighter text-stone-600">
                    {record.natureza}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => onView(record)}
                      className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
                      title="Visualizar"
                    >
                      <Eye size={18} />
                    </button>
                    <button 
                      onClick={() => onEdit(record)}
                      className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Editar"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button 
                      onClick={() => onDelete(record.assinaturaDigital.codigoRastreabilidade)}
                      className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-stone-400 text-sm italic">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InputField({ 
  label, 
  value, 
  onChange, 
  icon, 
  type = "text", 
  placeholder, 
  required = false 
}: { 
  label: string, 
  value: string, 
  onChange: (v: string) => void, 
  icon?: React.ReactNode, 
  type?: string, 
  placeholder?: string, 
  required?: boolean 
}) {
  const isEmpty = required && value.trim() === '';
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-stone-400 ml-1">
        {label} {isEmpty && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-stone-50 border rounded-2xl py-4 ${icon ? 'pl-12' : 'px-6'} pr-4 text-sm focus:ring-2 focus:ring-stone-900 transition-all ${
            isEmpty ? 'border-amber-200 bg-amber-50/30' : 'border-transparent'
          }`}
          required={required}
        />
      </div>
    </div>
  );
}

function DocumentPreview({ data }: { data: RegistroExpedicao }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="relative">
      {/* Floating Print Button */}
      <button
        onClick={handlePrint}
        className="fixed bottom-8 right-8 z-50 bg-stone-900 text-white p-5 rounded-full shadow-2xl hover:scale-110 transition-all active:scale-95 group print:hidden"
        title="Imprimir Documento"
      >
        <Printer size={24} className="group-hover:rotate-12 transition-transform" />
      </button>

      <div className="document-page mx-auto bg-white p-16 shadow-2xl border border-stone-200 relative text-black font-sans" style={{ width: '210mm', minHeight: '297mm' }}>
        {/* Header */}
        <div className="flex flex-col items-center mb-12">
          <BrandLogo size="lg" className="mb-6 brightness-0" />
          <h1 className="text-xl font-bold uppercase tracking-tight">REGISTRO DE EXPEDIÇÃO</h1>
        </div>

        {/* Fields */}
        <div className="space-y-0 text-sm">
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">RESPONSÁVEL EXPEDIÇÃO:</span>
            <span className="uppercase">{data.responsavel}</span>
          </div>
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">DATA/HORA DA SAÍDA DA EXPEDIÇÃO:</span>
            <span className="uppercase">{data.dataSaida}</span>
          </div>
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">CLIENTE:</span>
            <span className="uppercase">{data.cliente}</span>
          </div>
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">DESTINO:</span>
            <span className="uppercase">{data.destino}</span>
          </div>
          <div className="flex flex-col py-2 border-b border-stone-300">
            <span className="font-bold uppercase mb-2">NF / ID EXPEDIÇÃO:</span>
            <div className="border border-stone-300 rounded-sm overflow-hidden">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-300">
                    <th className="py-1 px-3 text-left border-r border-stone-300 font-bold uppercase">Nota Fiscal</th>
                    <th className="py-1 px-3 text-left font-bold uppercase">ID Expedição</th>
                  </tr>
                </thead>
                <tbody>
                  {data.nfs.map((nf, i) => (
                    <tr key={i} className="border-b border-stone-200 last:border-0">
                      <td className="py-1 px-3 border-r border-stone-300 uppercase">{nf.numero || '---'}</td>
                      <td className="py-1 px-3 uppercase">{nf.expedicaoId || '---'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Natureza */}
        <div className="mt-8 mb-8">
          <h3 className="font-bold text-sm uppercase mb-4">NATUREZA DA OPERAÇÃO:</h3>
          <div className="space-y-2">
            {NATUREZAS.map(n => (
              <div key={n} className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border border-stone-400 flex items-center justify-center`}>
                  {data.natureza === n && <div className="w-2.5 h-2.5 bg-blue-600 rounded-full"></div>}
                </div>
                <span className="text-xs uppercase">{n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logistics */}
        <div className="space-y-0 text-sm">
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">VOLUMES:</span>
            <span className="uppercase">{data.volumes}</span>
          </div>
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">TRANSPORTADORA:</span>
            <span className="uppercase">{data.transportadora}</span>
          </div>
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">MOTORISTA:</span>
            <span className="uppercase">{data.motorista}</span>
          </div>
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">RG/CPF:</span>
            <span className="uppercase">{data.rgCpf}</span>
          </div>
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">PLACA DO VEICULO:</span>
            <span className="uppercase">{data.placaVeiculo}</span>
          </div>
          <div className="flex items-center py-2 border-b border-stone-300">
            <span className="font-bold w-64 uppercase">AJUDANTE:</span>
            <span className="uppercase">{data.ajudante || 'Sem ajudante'}</span>
          </div>
        <div className="flex items-start py-2 border-b border-stone-300 min-h-[110px]">
          <span className="font-bold w-32 uppercase">ASSINATURA:</span>
          <div className="flex-1 flex flex-col items-start -mt-2">
             {/* Signature Display */}
             <div className="w-72 h-24 relative">
                {data.signatureImage ? (
                  <img src={data.signatureImage} alt="Assinatura" className="w-full h-full object-contain object-center" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center opacity-10">
                     <FileText size={40} />
                  </div>
                )}
             </div>
             <div className="w-72 border-b border-stone-400 mb-2"></div>
             <div className="text-[9px] text-stone-600 text-left space-y-1">
                <p className="font-bold uppercase">DOCUMENTO ASSINADO DIGITALMENTE POR: {data.assinaturaDigital.nome}</p>
                <p className="uppercase">DATA E HORA DA ASSINATURA: {data.assinaturaDigital.dataHora}</p>
                <p className="uppercase">CÓDIGO ÚNICO DE RASTREABILIDADE (ID): {data.assinaturaDigital.codigoRastreabilidade}</p>
             </div>
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-12 left-16 text-[10px] text-stone-500">
          CTDI F-5000195 / 2
        </div>
      </div>
    </div>
  );
}
