export interface PatientData {
  name_surnames: string;
  mail?: string;
  age?: number;
  phone?: string;
  gender?: string; // 'M' | 'F' | 'O' based on your UI
  height?: number;
  weight?: number;
}

export interface ConsultationData {
  objetivo_calorias?: number;
  objetivo_descripcion?: string;
  objetivo_tipo?: string[]; // Array
  objetivo_justificacion?: string;
  resultados_analiticos?: string;
  suplementos?: string;
  alergias_intolerancias?: string[]; // Array
  cirugias?: string;
  medicacion?: string;
  patologias?: string[]; // Array
  actividad_fisica_duracion?: string;
  actividad_fisica_tipo?: string;
  actividad_fisica_perfil?: string;
  actividad_diaria?: string;
  horario_dia_normal?: string;
  horas_sueno?: number;
  cantidad_agua?: string;
  gustos_preferencias?: string[]; // Array
  alimentos_evitar?: string[]; // Array
  alimentos_priorizar?: string[]; // Array
}
