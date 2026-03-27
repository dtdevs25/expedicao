export type NaturezaOperacao = 
  | 'VENDA' 
  | 'OUTROS' 
  | 'DOAÇÃO / DEMONSTRAÇÃO' 
  | 'RETORNO DE REPARO' 
  | 'REMESSA PARA REPARO' 
  | 'TRANSFERENCIA';

export interface NFItem {
  id: string;
  numero: string;
  expedicaoId: string;
}

export interface RegistroExpedicao {
  responsavel: string;
  dataSaida: string;
  cliente: string;
  destino: string;
  nfs: NFItem[];
  natureza: NaturezaOperacao;
  volumes: string;
  transportadora: string;
  motorista: string;
  rgCpf: string;
  placaVeiculo: string;
  ajudante: string;
  signatureImage?: string;
  assinaturaDigital: {
    nome: string;
    dataHora: string;
    codigoRastreabilidade: string;
  };
}
