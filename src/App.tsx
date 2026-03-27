import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, Printer, FileText, LogOut, Menu, 
  ChevronLeft, Search, Eye, User, Lock, LayoutDashboard,
  ClipboardList, PlusCircle, Truck, Settings, Heart,
  RotateCcw, Wrench, ArrowLeftRight, AlertCircle, Eraser,
  PenTool, Edit3, EyeOff, Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SignatureCanvas from 'react-signature-canvas';
import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode';
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

const natureIcons: Record<NaturezaOperacao, any> = {
  'VENDA': Truck,
  'OUTROS': Settings,
  'DOAÇÃO / DEMONSTRAÇÃO': Heart,
  'RETORNO DE REPARO': RotateCcw,
  'REMESSA PARA REPARO': Wrench,
  'TRANSFERENCIA': ArrowLeftRight,
};

const INITIAL_FORM_DATA: RegistroExpedicao = {
  responsavel: '',
  dataSaida: '',
  cliente: '',
  destino: '',
  nfs: [],
  natureza: 'VENDA',
  volumes: '',
  transportadora: '',
  motorista: '',
  rgCpf: '',
  placaVeiculo: '',
  ajudante: '',
  signatureImage: undefined,
  assinaturaDigital: {
    nome: '',
    dataHora: '',
    codigoRastreabilidade: '',
  },
};

// --- Components ---

const BrandLogo = ({ size = "md", className = "" }: { size?: "sm" | "md" | "lg" | "xl", className?: string }) => {
  const sizes = {
    sm: "h-8",
    md: "h-12",
    lg: "h-24",
    xl: "h-[120px]"
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Changed initial state to false for mobile-first
  const [records, setRecords] = useState<RegistroExpedicao[]>([]);
  const [formData, setFormData] = useState<RegistroExpedicao>(INITIAL_FORM_DATA);
  const [selectedRecord, setSelectedRecord] = useState<RegistroExpedicao | null>(null);

  const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

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
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setFormData({ ...INITIAL_FORM_DATA, dataSaida: formattedDate });
    setView('cadastro');
    setSelectedRecord(null);
    setIsSidebarOpen(false); // Close sidebar on mobile after navigation
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
    setIsSidebarOpen(false); // Close sidebar on mobile after navigation
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
      {/* Sidebar Overlay (Mobile only) */}
      {isSidebarOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="lg:hidden fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Header */}
      <header className="no-print h-20 bg-white border-b border-stone-100 px-6 lg:px-10 flex items-center justify-between shrink-0 z-50 shadow-sm relative">
        <div className="flex items-center gap-8">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-3 hover:bg-stone-50 rounded-2xl transition-all active:scale-95 text-stone-400 hover:text-stone-900"
          >
            {/* Toggle icon based on state if needed, or keep Menu */}
            <Menu size={24} />
          </button>
          
          <div className="flex items-center gap-6">
            <div className="text-stone-900 transition-transform hover:scale-105 cursor-pointer flex items-center justify-center">
              <BrandLogo size="sm" className="brightness-0" />
            </div>
            <div className="w-[1px] h-8 bg-stone-200 hidden lg:block" />
            <h2 className="text-base lg:text-lg font-black tracking-tighter uppercase hidden sm:block">
              Expedição <span className="text-[#003366]">CTDI</span>
            </h2>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <p className="text-xs font-black uppercase tracking-widest text-stone-900">{user.name}</p>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Acesso Autorizado</p>
          </div>
          <div className="w-[1px] h-6 bg-stone-200 hidden md:block" />
          <button 
            onClick={handleLogout}
            className="p-3 text-stone-400 hover:text-red-500 transition-all rounded-2xl hover:bg-red-50 group"
            title="Sair do Sistema"
          >
            <LogOut size={22} className="group-hover:-translate-x-0.5 transition-transform" />
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
          className={`
            fixed lg:sticky inset-y-0 left-0 bg-white border-r border-stone-100 z-[60]
            transition-all duration-300 ease-in-out flex flex-col
            ${isSidebarOpen 
              ? 'w-72 translate-x-0 shadow-2xl lg:shadow-none' 
              : 'w-20 -translate-x-full lg:translate-x-0'
            }
            no-print
          `}
        >
          <div className={`flex items-center justify-between p-6 pb-0 ${!isSidebarOpen && 'lg:justify-center'}`}>
            {isSidebarOpen && (
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] animate-in fade-in duration-500">Menu Principal</p>
            )}
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-stone-50 rounded-xl text-stone-400"
            >
              <Plus size={24} className="rotate-45" />
            </button>
          </div>

          <div className={`flex-1 py-10 px-4 space-y-3 ${!isSidebarOpen && 'lg:items-center'}`}>
            <SidebarItem 
              icon={<PlusCircle size={22} />} 
              label="Novo Cadastro" 
              active={view === 'cadastro'} 
              collapsed={!isSidebarOpen}
              onClick={startNewCadastro}
            />
            <SidebarItem 
              icon={<ClipboardList size={22} />} 
              label="Consultar Registros" 
              active={view === 'consulta'} 
              collapsed={!isSidebarOpen}
              onClick={() => { setView('consulta'); setSelectedRecord(null); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} 
            />
          </div>

          <div className={`p-6 border-t border-stone-50 bg-stone-50/30 flex items-center gap-4 transition-all ${!isSidebarOpen && 'lg:justify-center lg:px-0'}`}>
            <div className={`w-12 h-12 shrink-0 rounded-2xl bg-[#003366] flex items-center justify-center text-white text-lg font-black shadow-lg shadow-blue-100`}>
              {user.name[0].toUpperCase()}
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden flex flex-col min-w-0 animate-in fade-in slide-in-from-left-2 duration-300">
                <p className="text-sm font-black uppercase tracking-tighter truncate text-stone-900">{user.name}</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Online</p>
                </div>
              </div>
            )}
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
                {/* Header Actions for Preview */}
                <div className="w-full max-w-4xl flex items-center justify-between mb-8 no-print px-4">
                  <button 
                    onClick={() => {
                      if (selectedRecord) {
                        setFormData(selectedRecord);
                        setView('cadastro');
                      } else {
                        setView('cadastro');
                      }
                    }} 
                    className="flex items-center gap-3 px-6 py-4 bg-white border border-stone-200 rounded-2xl font-black text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-900 hover:border-stone-400 transition-all shadow-sm active:scale-95"
                  >
                    <ChevronLeft size={18} />
                    Voltar para Edição
                  </button>

                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-widest">
                      Pronto para Impressão
                    </span>
                  </div>
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

function SidebarItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void, collapsed?: boolean }) {
  const isMobile = window.innerWidth < 1024;
  const showLabel = !collapsed || isMobile;

  return (
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-4 p-4 rounded-2xl transition-all relative overflow-hidden group
        ${active 
          ? 'bg-[#003366] text-white shadow-lg shadow-blue-100' 
          : 'text-stone-400 hover:text-stone-900 hover:bg-stone-50'}
        ${!showLabel ? 'justify-center' : 'justify-start'}
      `}
      title={!showLabel ? label : ''}
    >
      <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      {showLabel && (
        <span className="text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">
          {label}
        </span>
      )}
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute left-0 w-1 h-6 bg-white rounded-full ml-1"
        />
      )}
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
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [success]);

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
        <div className="bg-stone-900 py-6 px-6 flex flex-col items-center text-white relative overflow-hidden">
          <motion.div 
            initial={{ scale: 0.8, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 100 }}
          >
            <BrandLogo size="xl" className="mb-0 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
          </motion.div>
          <h1 className="mt-2 text-xl font-black tracking-tighter uppercase leading-none">
            {isResetMode ? 'Recuperar Acesso' : 'Acesso ao Sistema'}
          </h1>
          <p className="text-stone-400 text-[10px] font-bold tracking-widest uppercase mt-4">Controle de Expedição</p>
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
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-stone-50 border-none rounded-2xl py-4 pl-12 pr-12 text-sm focus:ring-2 focus:ring-stone-900 transition-all font-sans"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
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
            <InputField label="Nome Completo" value={name} onChange={setName} />
            <InputField label="Seu E-mail" value={email} onChange={setEmail} />
            <InputField label="Senha" value={password} onChange={setPassword} type="password" />
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
            <InputField label="Nova Senha" value={newPassword} onChange={setNewPassword} type="password" />
            <InputField label="Confirmar Nova Senha" value={confirmPassword} onChange={setConfirmPassword} type="password" />
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
  const [isScannerActive, setScannerActive] = useState(false);
  const [isSignatureModalActive, setIsSignatureModalActive] = useState(false);

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
        <div className="bg-white rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden">
          <div className="bg-stone-900 p-6 flex items-center gap-4 text-white">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <ClipboardList size={22} />
            </div>
            <h2 className="text-base font-black uppercase tracking-tighter">Dados da Expedição</h2>
          </div>
          
          <div className="p-8 space-y-5">
            <InputField label="Responsável Expedição" value={data.responsavel} onChange={(v) => setData((prev: any) => ({ ...prev, responsavel: v }))} />
            <InputField label="Data/Hora Saída" value={data.dataSaida} onChange={(v) => setData((prev: any) => ({ ...prev, dataSaida: v }))} placeholder="DD/MM/AAAA HH:MM" />
            <InputField label="Cliente" value={data.cliente} onChange={(v) => setData((prev: any) => ({ ...prev, cliente: v }))} />
            <InputField label="Destino" value={data.destino} onChange={(v) => setData((prev: any) => ({ ...prev, destino: v }))} />
          </div>
        </div>

        {/* Card: Logística */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden">
          <div className="bg-stone-900 p-6 flex items-center gap-4 text-white">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Truck size={22} />
            </div>
            <h2 className="text-base font-black uppercase tracking-tighter">Logística</h2>
          </div>
          
          <div className="p-8 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <InputField label="Volumes" value={data.volumes} onChange={(v) => setData((prev: any) => ({ ...prev, volumes: v }))} />
              <InputField label="Placa do Veículo" value={data.placaVeiculo} onChange={(v) => setData((prev: any) => ({ ...prev, placaVeiculo: v }))} mask="placa" />
            </div>
            <InputField label="Transportadora" value={data.transportadora} onChange={(v) => setData((prev: any) => ({ ...prev, transportadora: v }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <InputField label="Motorista" value={data.motorista} onChange={(v) => setData((prev: any) => ({ ...prev, motorista: v }))} />
              <InputField label="RG/CPF" value={data.rgCpf} onChange={(v) => setData((prev: any) => ({ ...prev, rgCpf: v }))} mask="rg" />
            </div>
            <InputField label="Ajudante" value={data.ajudante} onChange={(v) => setData((prev: any) => ({ ...prev, ajudante: v }))} />
          </div>
        </div>

        {/* Card: Notas Fiscais */}
        <div className="md:col-span-2 bg-white rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden">
          <div className="bg-stone-900 p-6 flex items-center justify-between text-white">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-white/10 rounded-xl">
                <FileText size={22} />
              </div>
              <h2 className="text-base font-black uppercase tracking-tighter">Notas Fiscais</h2>
            </div>
             <div className="flex items-center gap-3">
              <button 
                onClick={() => setScannerActive(true)}
                className="flex items-center gap-2 bg-stone-800 text-white px-5 sm:px-5 py-3 rounded-xl hover:bg-stone-700 transition-all shadow-sm"
                title="Escanear NF"
              >
                <Camera size={18} /> 
                <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest ml-1">Escanear NF</span>
              </button>
              <button 
                onClick={addNF}
                className="flex items-center gap-2 bg-white text-stone-900 px-5 sm:px-5 py-3 rounded-xl hover:bg-stone-100 transition-all shadow-sm"
                title="Adicionar NF"
              >
                <Plus size={18} /> 
                <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest ml-1">Adicionar</span>
              </button>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-4">
              {/* List Header (Desktop Only) */}
              {data.nfs.length > 0 && (
                <div className="hidden sm:grid grid-cols-2 gap-6 pr-12 px-4">
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Nº da NF</span>
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">ID Expedição</span>
                </div>
              )}

              {data.nfs.map((nf: any) => (
                <div key={nf.id} className="group relative">
                  {/* Item Row/Card */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-stone-50/50 p-4 sm:p-3 rounded-2xl border border-stone-100 group-hover:border-stone-200 transition-all">
                    {/* Mobile Labels are handled inside InputField or shown only on mobile */}
                    <div className="flex-1 space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-4">
                      <div className="sm:hidden">
                         <InputField label="Nº da NF" value={nf.numero} onChange={(v) => updateNF(nf.id, 'numero', v)} placeholder="000.000.000" />
                      </div>
                      <div className="hidden sm:block">
                        <input
                          type="text"
                          value={nf.numero}
                          placeholder="Nº da NF"
                          onChange={(e) => updateNF(nf.id, 'numero', e.target.value)}
                          className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-stone-900 transition-all shadow-sm"
                        />
                      </div>

                      <div className="sm:hidden">
                         <InputField label="ID Expedição" value={nf.expedicaoId} onChange={(v) => updateNF(nf.id, 'expedicaoId', v)} placeholder="EXP-0000" />
                      </div>
                      <div className="hidden sm:block">
                        <input
                          type="text"
                          value={nf.expedicaoId}
                          placeholder="ID Expedição"
                          onChange={(e) => updateNF(nf.id, 'expedicaoId', e.target.value)}
                          className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-4 text-xs focus:ring-2 focus:ring-stone-900 transition-all shadow-sm"
                        />
                      </div>
                    </div>

                    <button 
                      onClick={() => removeNF(nf.id)}
                      className="p-3 bg-red-50 text-red-500 rounded-xl sm:rounded-lg opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white flex items-center justify-center"
                      title="Remover Nota"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {data.nfs.length === 0 && (
              <div className="text-center py-10 bg-stone-50/50 rounded-3xl border border-dashed border-stone-200">
                <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Nenhuma nota adicionada</p>
              </div>
            )}
          </div>
        </div>

        {/* Card: Natureza da Operação */}
        <div className="md:col-span-2 bg-white rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden">
          <div className="bg-stone-900 p-6 flex items-center gap-4 text-white">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Settings size={22} />
            </div>
            <h2 className="text-base font-black uppercase tracking-tighter">Natureza da Operação</h2>
          </div>

          <div className="p-8 space-y-8">
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
        </div>

        {/* Card: Assinatura */}
        <div className="md:col-span-2 bg-white rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden">
          <div className="bg-stone-900 p-6 flex items-center justify-between text-white">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-white/10 rounded-xl">
                <PenTool size={22} />
              </div>
              <h2 className="text-base font-black uppercase tracking-tighter">Assinatura Digital</h2>
            </div>
            <button 
              onClick={() => signatureRef.current?.clear()}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
              title="Limpar assinatura"
            >
              <Trash2 size={18} />
            </button>
          </div>
          
          <div className="p-8">
             <div className="sm:hidden mb-6">
                <button 
                  onClick={() => setIsSignatureModalActive(true)}
                  className="w-full bg-blue-50 text-[#003366] py-16 rounded-[2rem] border-2 border-dashed border-blue-200 flex flex-col items-center justify-center gap-4 hover:bg-blue-100 transition-all"
                >
                  <div className="p-4 bg-white rounded-2xl shadow-sm">
                    <PenTool size={32} />
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest text-[#003366]">Clique para assinar</p>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">(Abre em tela cheia)</p>
                </button>
             </div>

            <div className={`hidden sm:block border-2 border-dashed border-stone-200 rounded-[2rem] bg-stone-50/30 transition-all hover:border-stone-300 relative`}>
              <SignatureCanvas 
                ref={sigCanvas}
                penColor="black"
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
              onClick={() => {
                setData(INITIAL_FORM_DATA);
                sigCanvas.current?.clear();
              }}
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
 
        {/* Scanner Modal */}
        <AnimatePresence>
          {isScannerActive && (
            <ScannerModal 
              onScan={(decodedText) => {
                if (decodedText.length >= 34) {
                  const nfNumero = decodedText.substring(25, 34);
                  const newNF: NFItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    numero: nfNumero,
                    expedicaoId: '',
                  };
                  setData((prev: any) => ({ ...prev, nfs: [...prev.nfs, newNF] }));
                  setNotification({ message: `NF ${nfNumero} lida!`, type: 'success' });
                } else {
                  setNotification({ message: 'Barcode inválido.', type: 'error' });
                }
              }}
              onClose={() => setScannerActive(false)}
            />
          )}
        </AnimatePresence>

        {/* Signature Modal */}
        <AnimatePresence>
          {isSignatureModalActive && (
            <SignatureFullscreenModal 
              onSave={(image) => {
                setData((prev: any) => ({ ...prev, signatureImage: image }));
                setIsSignatureModalActive(false);
              }}
              onClose={() => setIsSignatureModalActive(false)}
            />
          )}
        </AnimatePresence>
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

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
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
                    <button onClick={() => onView(record)} className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"><Eye size={18} /></button>
                    <button onClick={() => onEdit(record)} className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit3 size={18} /></button>
                    <button onClick={() => onDelete(record.assinaturaDigital.codigoRastreabilidade)} className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4 pb-20">
        {filtered.map((record, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{record.dataSaida}</p>
                <h3 className="text-sm font-black text-stone-900 uppercase leading-none">{record.cliente}</h3>
              </div>
              <span className="px-2 py-1 bg-stone-100 rounded text-[8px] font-black uppercase tracking-tighter text-stone-600">
                {record.natureza}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-[10px] font-bold text-stone-500 uppercase tracking-tight">
              <div>
                <span className="block text-stone-400 mb-0.5">Destino:</span>
                {record.destino}
              </div>
              <div>
                <span className="block text-stone-400 mb-0.5">Motorista:</span>
                {record.motorista}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-stone-50">
              <button 
                onClick={() => onView(record)} 
                className="flex-1 bg-stone-50 text-stone-900 py-3 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
              >
                <Eye size={14} /> Ver
              </button>
              <button 
                onClick={() => onEdit(record)} 
                className="flex-1 bg-blue-50 text-blue-600 py-3 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
              >
                <Edit3 size={14} /> Editar
              </button>
              <button 
                onClick={() => onDelete(record.assinaturaDigital.codigoRastreabilidade)} 
                className="p-3 bg-red-50 text-red-600 rounded-xl active:scale-90 transition-all font-black"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-3xl p-20 border border-dashed border-stone-200 text-center">
          <p className="text-stone-400 text-sm font-bold uppercase tracking-widest">Nenhum registro encontrado</p>
        </div>
      )}
    </div>
  );
}

function ScannerModal({ onScan, onClose }: { onScan: (text: string) => void, onClose: () => void }) {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  
  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");
    scannerRef.current = html5QrCode;

    const config = { fps: 10, qrbox: { width: 280, height: 100 } };

    html5QrCode.start(
      { facingMode: "environment" }, 
      config, 
      (decodedText) => {
        onScan(decodedText);
        setLastScanned(decodedText.substring(25, 34) || decodedText);
        setIsFlashActive(true);
        setTimeout(() => setIsFlashActive(false), 150);
        setTimeout(() => setLastScanned(null), 1500);
      },
      () => {}
    ).catch(err => console.error("Error starting scanner:", err));

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(e => console.error("Error stopping scanner:", e));
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[250] bg-black flex flex-col no-print">
      {/* Immersive Camera View */}
      <div id="reader" className="flex-1 w-full bg-black relative overflow-hidden">
        {/* Viewfinder Overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="w-[300px] h-[150px] border-2 border-white/30 rounded-3xl relative">
            {/* Corners */}
            <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl" />
            <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl" />
            <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl" />
            
            {/* Scanning Laser */}
            <motion.div 
              animate={{ top: ['10%', '90%'] }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute inset-x-4 h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]"
            />
          </div>
        </div>

        {/* Flash Effect */}
        <AnimatePresence>
          {isFlashActive && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 bg-white"
            />
          )}
        </AnimatePresence>

        {/* Scan Feedback */}
        <AnimatePresence>
          {lastScanned && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-emerald-500 text-white px-8 py-4 rounded-3xl shadow-2xl flex flex-col items-center gap-2 border-4 border-white"
            >
              <PlusCircle size={32} />
              <p className="text-sm font-black uppercase tracking-widest">NF {lastScanned} Lida!</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modern Control Bar */}
      <div className="h-40 bg-stone-900 px-8 flex items-center justify-between text-white relative">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black uppercase tracking-tighter">Scanner de Notas</h2>
          <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest">Aponte para o código de barras</p>
        </div>
        
        <button 
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 p-5 rounded-3xl transition-all shadow-xl backdrop-blur-md font-black uppercase tracking-widest text-sm flex items-center gap-3"
        >
          Concluir <Plus size={20} className="rotate-45" />
        </button>
      </div>
    </div>
  );
}

function SignatureFullscreenModal({ onSave, onClose }: { onSave: (img: string) => void, onClose: () => void }) {
  const modalCanvasRef = useRef<SignatureCanvas>(null);
  const [rotationHint, setRotationHint] = useState(false);

  // Resize handler to avoid "buggy" behavior on rotation
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < window.innerHeight) {
        setRotationHint(true);
      } else {
        setRotationHint(false);
      }
      
      // We don't want to clear the canvas on resize if possible
      // but react-signature-canvas needs a redraw
      if (modalCanvasRef.current) {
         const currentData = modalCanvasRef.current.toDataURL();
         // Trigger a short delay to allow DOM to settle
         setTimeout(() => {
           if (modalCanvasRef.current) {
              const canvas = modalCanvasRef.current.getCanvas();
              const ratio =  Math.max(window.devicePixelRatio || 1, 1);
              canvas.width = canvas.offsetWidth * ratio;
              canvas.height = canvas.offsetHeight * ratio;
              canvas.getContext("2d")?.scale(ratio, ratio);
              modalCanvasRef.current.fromDataURL(currentData);
           }
         }, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDone = () => {
    if (modalCanvasRef.current && !modalCanvasRef.current.isEmpty()) {
      onSave(modalCanvasRef.current.toDataURL('image/png'));
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-stone-900 flex flex-col no-print">
      <div className="h-16 lg:h-20 bg-stone-900 text-white flex items-center justify-between px-6 lg:px-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-xl">
             <PenTool size={20} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Assinatura Digital</p>
        </div>
        <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all">
          <Plus size={24} className="rotate-45" />
        </button>
      </div>
      
      <div className="flex-1 bg-stone-50 relative overflow-hidden flex items-center justify-center p-3 sm:p-6 lg:p-10">
        {/* Instructional background text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
          <h2 className="text-4xl sm:text-6xl lg:text-8xl font-black uppercase tracking-[0.5em] text-center">Assine Aqui</h2>
        </div>
        
        <div className="w-full h-full relative">
          <SignatureCanvas 
            ref={modalCanvasRef}
            penColor="black"
            canvasProps={{ 
              className: "w-full h-full bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border-4 border-white cursor-crosshair",
            }}
          />
          
          <AnimatePresence>
            {rotationHint && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm rounded-[2rem] sm:rounded-[3rem] pointer-events-none"
              >
                 <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 text-center">
                    <div className="p-4 bg-blue-50 text-[#003366] rounded-2xl animate-bounce">
                       <RotateCcw size={32} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tighter text-stone-900">Gire o celular</p>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Para ter mais espaço</p>
                    </div>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="p-6 sm:p-8 bg-white border-t border-stone-100 flex gap-4 shrink-0">
        <button 
          onClick={() => modalCanvasRef.current?.clear()}
          className="flex-1 py-4 sm:py-5 rounded-2xl sm:rounded-3xl border-2 border-stone-100 text-stone-400 font-black uppercase tracking-widest text-[10px] hover:bg-stone-50 transition-all active:scale-95"
        >
          Limpar
        </button>
        <button 
          onClick={handleDone}
          className="flex-[2.5] py-4 sm:py-5 rounded-2xl sm:rounded-3xl bg-[#003366] text-white font-black uppercase tracking-widest text-[10px] hover:shadow-xl hover:shadow-blue-100 transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          Confirmar <PlusCircle size={18} />
        </button>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = "text", mask }: { 
  label: string, 
  value: string, 
  onChange: (v: string) => void, 
  placeholder?: string,
  type?: string,
  mask?: 'placa' | 'rg'
}) {
  const [isInvalid, setIsInvalid] = useState(false);

  const applyMask = (val: string) => {
    let masked = val.toUpperCase();
    if (mask === 'placa') {
      masked = masked.replace(/[^A-Z0-9]/g, '');
      if (masked.length > 7) masked = masked.substring(0, 7);
      
      // Validação Placa Brasil (Antiga: AAA9999 ou Mercosul: AAA9A99)
      const placaRegex = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
      setIsInvalid(masked.length > 0 && !placaRegex.test(masked));
    } else if (mask === 'rg') {
      masked = masked.replace(/[^0-9X]/g, '');
      if (masked.length > 9) masked = masked.substring(0, 9);
      
      // Máscara 00.000.000-0
      let temp = masked;
      if (temp.length > 2) temp = temp.slice(0, 2) + '.' + temp.slice(2);
      if (temp.length > 6) temp = temp.slice(0, 6) + '.' + temp.slice(6);
      if (temp.length > 10) temp = temp.slice(0, 10) + '-' + temp.slice(10);
      masked = temp;
      
      setIsInvalid(masked.length > 0 && masked.length < 12);
    }
    onChange(masked);
  };

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
      <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-1">{label}</label>
      <div className="relative">
        <input 
          type={type}
          value={value}
          onChange={(e) => mask ? applyMask(e.target.value) : onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-stone-50/50 border rounded-2xl py-3.5 px-5 text-xs font-bold text-stone-900 focus:ring-4 focus:ring-stone-900/5 focus:border-stone-900 transition-all placeholder:text-stone-300 ${
            isInvalid ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-100' : 'border-stone-100'
          }`}
        />
        {isInvalid && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500">
            <AlertCircle size={16} />
          </div>
        )}
      </div>
      {isInvalid && <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest px-1">Formato inválido</p>}
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

      <div className="w-full overflow-x-auto pb-10 flex justify-start lg:justify-center px-4 md:px-0">
        <div className="document-page bg-white p-8 md:p-16 shadow-2xl border border-stone-200 relative text-black font-sans shrink-0" style={{ width: '210mm', minHeight: '297mm' }}>
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
    </div>
  );
}
